import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSyncQueue } from '@/hooks/use-sync-queue';

/** Banner shown when offline, when there are pending mutations, or when there are conflicts. */
export function SyncStatusBar() {
  const { pending, pendingCount, conflictCount, syncing, isOnline, syncAll } = useSyncQueue();

  if (Platform.OS !== 'web') return null;
  if (isOnline && pending.length === 0) return null;

  const errored = pending.filter(m => m.status === 'error').length;

  let color = '#0a7ea4'; // online + pending
  if (!isOnline) color = '#555';
  if (errored > 0) color = '#c0392b';
  if (conflictCount > 0) color = '#8e44ad'; // purple — needs manual resolution

  let statusText: string;
  if (conflictCount > 0) {
    statusText = `⚠️ ${conflictCount} conflicto${conflictCount !== 1 ? 's' : ''} de sincronización — revisá el aviso`;
  } else if (!isOnline) {
    statusText = pendingCount > 0
      ? `Sin conexión · ${pendingCount} cambio${pendingCount !== 1 ? 's' : ''} pendiente${pendingCount !== 1 ? 's' : ''}`
      : 'Sin conexión — modo offline';
  } else if (errored > 0) {
    statusText = `⚠️ ${errored} operación${errored !== 1 ? 'es' : ''} con error`;
  } else {
    statusText = `${pendingCount} cambio${pendingCount !== 1 ? 's' : ''} pendiente${pendingCount !== 1 ? 's' : ''} de sincronizar`;
  }

  return (
    <View style={[styles.bar, { backgroundColor: color }]}>
      <Text style={styles.statusTxt} numberOfLines={1}>{statusText}</Text>

      {conflictCount === 0 && pendingCount > 0 && isOnline && (
        <TouchableOpacity style={[styles.btn, syncing && styles.btnDisabled]} onPress={syncAll} disabled={syncing}>
          {syncing
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.btnTxt}>Sincronizar</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Expandable panel listing all pending mutations — place inside a ScrollView. */
export function SyncQueueDetail() {
  const { pending, syncing, isOnline, syncAll } = useSyncQueue();

  if (Platform.OS !== 'web' || pending.length === 0) return null;

  return (
    <View style={styles.detail}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailTitle}>Cambios pendientes ({pending.length})</Text>
        {isOnline && (
          <TouchableOpacity style={[styles.btn, styles.btnSmall, syncing && styles.btnDisabled]} onPress={syncAll} disabled={syncing}>
            {syncing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.btnTxt}>Sincronizar todo</Text>}
          </TouchableOpacity>
        )}
      </View>
      <ScrollView style={styles.detailList} nestedScrollEnabled>
        {pending.map(m => (
          <View key={m.id} style={[
            styles.detailItem,
            m.status === 'error' && styles.detailItemError,
            m.status === 'conflict' && styles.detailItemConflict,
          ]}>
            <Text style={styles.detailLabel} numberOfLines={1}>{m.label}</Text>
            <Text style={styles.detailMeta}>
              {m.table} · {m.operation} · {m.status}
              {m.lastError ? `\n⚠️ ${m.lastError}` : ''}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 10,
  },
  statusTxt: { color: '#fff', fontSize: 12, fontWeight: '600', flex: 1 },
  btn: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minWidth: 90,
    alignItems: 'center',
  },
  btnSmall: { paddingVertical: 3 },
  btnDisabled: { opacity: 0.5 },
  btnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  detail: {
    backgroundColor: '#fff8e6',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#f5a623',
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  detailTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#7a4f00' },
  detailList: { maxHeight: 200 },
  detailItem: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0e0b0',
  },
  detailItemError: { backgroundColor: '#fff0ee' },
  detailItemConflict: { backgroundColor: '#f8eeff' },
  detailLabel: { fontSize: 13, fontWeight: '600', color: '#333' },
  detailMeta: { fontSize: 11, color: '#888', marginTop: 1 },
});
