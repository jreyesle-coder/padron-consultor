import { Tabs } from 'expo-router';
import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CustomTabBar } from '@/components/custom-tab-bar';
import { ConflictModal } from '@/components/conflict-modal';
import { useSyncQueue } from '@/hooks/use-sync-queue';

// ── Foreign-queue notice ──────────────────────────────────────────────────────
// Shown once at login when another user on this device has unsynced items.
function ForeignQueueBanner({
  queues,
  onDismiss,
}: {
  queues: { ns: string; count: number }[];
  onDismiss: () => void;
}) {
  if (queues.length === 0) return null;
  const total = queues.reduce((s, q) => s + q.count, 0);
  return (
    <View style={bannerStyles.container}>
      <Text style={bannerStyles.txt}>
        ℹ️ Otro usuario en este dispositivo tiene {total} cambio{total !== 1 ? 's' : ''} sin sincronizar.
        Pedile que inicie sesión y sincronice antes de cerrar el navegador.
      </Text>
      <TouchableOpacity onPress={onDismiss} style={bannerStyles.btn}>
        <Text style={bannerStyles.btnTxt}>Entendido</Text>
      </TouchableOpacity>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    backgroundColor: '#fff3cd',
    borderBottomWidth: 1,
    borderBottomColor: '#f5a623',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  txt: { flex: 1, fontSize: 12, color: '#7a4f00', lineHeight: 16 },
  btn: {
    backgroundColor: '#f5a623',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  btnTxt: { fontSize: 12, fontWeight: '700', color: '#fff' },
});

// ── Layout ────────────────────────────────────────────────────────────────────
export default function TabLayout() {
  const { firstConflict, foreignQueues, resolveConflict } = useSyncQueue();
  const [foreignDismissed, setForeignDismissed] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      {Platform.OS === 'web' && !foreignDismissed && (
        <ForeignQueueBanner
          queues={foreignQueues}
          onDismiss={() => setForeignDismissed(true)}
        />
      )}

      <Tabs
        tabBar={props => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index"      options={{ title: 'Búsqueda' }} />
        <Tabs.Screen name="campo"      options={{ title: 'Trabajo de Campo' }} />
        <Tabs.Screen name="recintos"   options={{ title: 'Recintos' }} />
        <Tabs.Screen name="explore"    options={{ title: 'Resumen' }} />
        <Tabs.Screen name="elecciones" options={{ title: 'Día D' }} />
      </Tabs>

      {/* ConflictModal appears as a full-screen overlay whenever firstConflict is set */}
      {firstConflict && (
        <ConflictModal conflict={firstConflict} onResolve={resolveConflict} />
      )}
    </View>
  );
}
