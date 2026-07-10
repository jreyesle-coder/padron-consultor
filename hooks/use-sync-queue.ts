import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  buildNamespace,
  dequeue,
  getForeignQueues,
  getQueue,
  markConflict,
  markError,
  resolveConflict as resolveConflictInDb,
  type PendingMutation,
} from '@/lib/sync-queue';
import { useSesion } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export type ForeignQueue = { ns: string; count: number };

/**
 * Tables where we apply optimistic concurrency via updated_at.
 * Only UPDATEs on these tables use the conditional WHERE updated_at = ? check.
 */
const CONCURRENCY_TABLES = new Set(['colaboradores_campo', 'lideres_campo']);

export function useSyncQueue() {
  const { sesion } = useSesion();
  const ns = sesion ? buildNamespace(sesion.userId, sesion.organizacion_id) : null;

  const [pending, setPending] = useState<PendingMutation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [foreignQueues, setForeignQueues] = useState<ForeignQueue[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // ── State refresh ────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!ns) { if (mounted.current) setPending([]); return; }
    const q = await getQueue(ns);
    if (mounted.current) setPending(q);
  }, [ns]);

  const refreshForeignQueues = useCallback(async () => {
    if (!ns || Platform.OS !== 'web') return;
    const foreign = await getForeignQueues(ns);
    if (mounted.current) setForeignQueues(foreign);
  }, [ns]);

  useEffect(() => {
    refresh();
    refreshForeignQueues();

    if (Platform.OS !== 'web') return;

    const onQueueChange = () => { refresh(); refreshForeignQueues(); };
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('prm-queue-changed', onQueueChange);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('prm-queue-changed', onQueueChange);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh, refreshForeignQueues]);

  // ── Sync all pending / error mutations ───────────────────────────────────────
  const syncAll = useCallback(async () => {
    if (!ns || syncing) return;
    // Only process 'pending' and 'error'; skip 'conflict' (needs manual resolution)
    const q = await getQueue(ns);
    const toSync = q.filter(m => m.status === 'pending' || m.status === 'error');
    if (!toSync.length) return;

    setSyncing(true);

    for (const m of toSync) {
      try {
        let error: { message: string; code?: string } | null = null;

        // ── INSERT ────────────────────────────────────────────────────────────
        if (m.operation === 'insert') {
          ({ error } = await supabase.from(m.table as any).insert(m.payload));

        // ── UPDATE ────────────────────────────────────────────────────────────
        } else if (m.operation === 'update' && m.filter) {
          const useOptLock =
            CONCURRENCY_TABLES.has(m.table) && !!m.capturedUpdatedAt;

          if (useOptLock) {
            // Conditional update: only succeeds if updated_at hasn't changed
            let qb: any = supabase.from(m.table as any).update(m.payload);
            for (const [col, val] of Object.entries(m.filter)) qb = qb.eq(col, val);
            const { data: touched, error: updErr } = await qb
              .eq('updated_at', m.capturedUpdatedAt)
              .select('id');

            if (updErr && updErr.code !== '23505') {
              await markError(ns, m.id, updErr.message);
              continue;
            }
            if (!updErr && Array.isArray(touched) && touched.length === 0) {
              // 0 rows matched → another user changed the row → CONFLICT
              const idVal = m.filter['id'];
              const { data: serverRow } = await supabase
                .from(m.table as any)
                .select('*')
                .eq('id', idVal)
                .maybeSingle();
              await markConflict(ns, m.id, (serverRow as Record<string, unknown>) ?? {});
              continue; // Leave mutation in queue with status='conflict'
            }
            await dequeue(ns, m.id);
            continue;
          }

          // Regular update (inserts from campo, recintos, etc.)
          let qb: any = supabase.from(m.table as any).update(m.payload);
          for (const [col, val] of Object.entries(m.filter)) qb = qb.eq(col, val);
          ({ error } = await qb);

        // ── DELETE ────────────────────────────────────────────────────────────
        } else if (m.operation === 'delete' && m.filter) {
          let qb: any = supabase.from(m.table as any).delete();
          for (const [col, val] of Object.entries(m.filter)) qb = qb.eq(col, val);
          ({ error } = await qb);
        }

        // 23505 = unique violation — already applied, treat as idempotent success
        if (error && error.code !== '23505') {
          await markError(ns, m.id, error.message);
        } else {
          await dequeue(ns, m.id);
        }
      } catch (e: any) {
        await markError(ns, m.id, e?.message ?? 'Error desconocido');
      }
    }

    if (mounted.current) setSyncing(false);
    await refresh();
  }, [ns, syncing, refresh]);

  // ── Conflict resolution ──────────────────────────────────────────────────────
  const resolveConflict = useCallback(async (
    id: string,
    action: 'apply' | 'discard' | 'edit',
    editedPayload?: Record<string, unknown>
  ) => {
    if (!ns) return;
    await resolveConflictInDb(ns, id, action, editedPayload);
    await refresh();
  }, [ns, refresh]);

  // ── Auto-sync on reconnect ───────────────────────────────────────────────────
  const syncAllRef = useRef(syncAll);
  syncAllRef.current = syncAll;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = () => syncAllRef.current();
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────────
  const firstConflict = pending.find(m => m.status === 'conflict') ?? null;
  const pendingCount = pending.filter(m => m.status === 'pending' || m.status === 'error').length;
  const conflictCount = pending.filter(m => m.status === 'conflict').length;

  return {
    pending,
    pendingCount,
    conflictCount,
    firstConflict,
    syncing,
    isOnline,
    foreignQueues,
    ns,
    syncAll,
    resolveConflict,
    refresh,
  };
}
