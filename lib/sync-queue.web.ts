import { createStore, get, set, keys as idbKeys } from 'idb-keyval';

export type MutationType = 'insert' | 'update' | 'delete';
export type MutationStatus = 'pending' | 'error' | 'conflict';

export type PendingMutation = {
  id: string;
  table: string;
  operation: MutationType;
  payload: Record<string, unknown>;
  /** Column→value pairs used in .eq() for update/delete */
  filter?: Record<string, unknown>;
  /** Human-readable label shown in sync UI */
  label: string;
  /** ISO timestamp of row's updated_at at capture time — used for optimistic concurrency */
  capturedUpdatedAt?: string;
  status: MutationStatus;
  /** Populated when status === 'conflict': the row's current values on the server */
  serverState?: Record<string, unknown>;
  createdAt: number;
  retries: number;
  lastError?: string;
};

// ── Storage ───────────────────────────────────────────────────────────────────
// All queues live in a single IDB store; the key encodes the namespace so
// different users/orgs on the same device never mix.
const QUEUE_PREFIX = 'queue|';
const store = createStore('prm-sync-queue', 'queue');

// ── Namespace ─────────────────────────────────────────────────────────────────
/** Stable per (user, org) — deterministic across page reloads. */
export function buildNamespace(userId: string, orgId: number | null): string {
  return `${userId}_${orgId ?? 0}`;
}

function queueKey(ns: string): string {
  return `${QUEUE_PREFIX}${ns}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export async function getQueue(ns: string): Promise<PendingMutation[]> {
  return (await get<PendingMutation[]>(queueKey(ns), store)) ?? [];
}

async function saveQueue(ns: string, q: PendingMutation[]): Promise<void> {
  await set(queueKey(ns), q, store);
}

export async function enqueue(
  ns: string,
  mutation: Omit<PendingMutation, 'id' | 'createdAt' | 'retries' | 'status'>
): Promise<void> {
  const q = await getQueue(ns);
  q.push({
    ...mutation,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    retries: 0,
    status: 'pending',
  });
  await saveQueue(ns, q);
  notifyQueueChanged();
}

export async function dequeue(ns: string, id: string): Promise<void> {
  const q = await getQueue(ns);
  await saveQueue(ns, q.filter(m => m.id !== id));
  notifyQueueChanged();
}

export async function markError(ns: string, id: string, error: string): Promise<void> {
  const q = await getQueue(ns);
  const idx = q.findIndex(m => m.id === id);
  if (idx >= 0) {
    q[idx].retries++;
    q[idx].lastError = error;
    q[idx].status = 'error';
    await saveQueue(ns, q);
    notifyQueueChanged();
  }
}

// ── Conflict handling ─────────────────────────────────────────────────────────
export async function markConflict(
  ns: string,
  id: string,
  serverState: Record<string, unknown>
): Promise<void> {
  const q = await getQueue(ns);
  const idx = q.findIndex(m => m.id === id);
  if (idx >= 0) {
    q[idx].status = 'conflict';
    q[idx].serverState = serverState;
    await saveQueue(ns, q);
    notifyQueueChanged();
  }
}

/**
 * Resolve a conflict:
 *   'apply'   → overwrite server (remove optimistic lock, re-queue as pending)
 *   'discard' → drop the local mutation entirely
 *   'edit'    → replace payload with user-edited values, then apply
 */
export async function resolveConflict(
  ns: string,
  id: string,
  action: 'apply' | 'discard' | 'edit',
  editedPayload?: Record<string, unknown>
): Promise<void> {
  if (action === 'discard') {
    await dequeue(ns, id);
    return;
  }
  const q = await getQueue(ns);
  const idx = q.findIndex(m => m.id === id);
  if (idx >= 0) {
    q[idx].status = 'pending';
    q[idx].retries = 0;
    q[idx].lastError = undefined;
    q[idx].serverState = undefined;
    // Remove the optimistic lock so the next sync overwrites unconditionally
    q[idx].capturedUpdatedAt = undefined;
    if (action === 'edit' && editedPayload) {
      q[idx].payload = editedPayload;
    }
    await saveQueue(ns, q);
    notifyQueueChanged();
  }
}

// ── Cross-user visibility ─────────────────────────────────────────────────────
/**
 * Returns queues belonging to OTHER users/orgs on this device that still have
 * pending items. Used to show the "otro usuario tiene cambios sin sincronizar"
 * admin notice at login.
 */
export async function getForeignQueues(
  currentNs: string
): Promise<Array<{ ns: string; count: number }>> {
  const allKeys = await idbKeys(store);
  const result: Array<{ ns: string; count: number }> = [];
  for (const k of allKeys) {
    const key = k as string;
    if (!key.startsWith(QUEUE_PREFIX)) continue;
    const ns = key.slice(QUEUE_PREFIX.length);
    if (ns === currentNs) continue;
    const items = await get<PendingMutation[]>(key, store);
    const count = (items ?? []).filter(m => m.status !== 'conflict').length;
    if (count > 0) result.push({ ns, count });
  }
  return result;
}

/** Dispatch a window event so all useSyncQueue instances refresh together. */
export function notifyQueueChanged(): void {
  window.dispatchEvent(new CustomEvent('prm-queue-changed'));
}
