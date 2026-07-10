/**
 * ConflictModal — shown when a queued UPDATE conflicts with a concurrent
 * server-side change detected via optimistic concurrency (updated_at check).
 *
 * Three resolution paths:
 *   1. Aplicar mi versión   → overwrites server (capturedUpdatedAt removed)
 *   2. Descartar mi cambio  → drops the local mutation
 *   3. Editar y resolver    → user tweaks payload fields before applying
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { PendingMutation } from '@/lib/sync-queue';

// ── Config ────────────────────────────────────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  notas: 'Notas',
  ultimo_contacto: 'Último contacto',
  padron_confirmado: 'Inscripción PRM confirmada',
  pendiente_padron: 'Pendiente de inscripción PRM',
  voto_confirmado: 'Voto confirmado',
  necesita_transporte: 'Necesita transporte',
  meta_votos: 'Meta de personas',
  celular: 'Teléfono',
  parent_lider_id: 'Sub-líder de (ID)',
  nombre: 'Nombre',
  municipio: 'Municipio',
  colegio: 'Mesa/Colegio',
};

/** Fields shown as editable TextInput; all others are display-only in edit mode */
const EDITABLE_FIELDS = new Set([
  'notas', 'ultimo_contacto', 'meta_votos', 'celular', 'municipio', 'colegio',
]);

// ── Component ─────────────────────────────────────────────────────────────────
type Props = {
  conflict: PendingMutation;
  onResolve: (
    id: string,
    action: 'apply' | 'discard' | 'edit',
    editedPayload?: Record<string, unknown>
  ) => Promise<void>;
};

export function ConflictModal({ conflict, onResolve }: Props) {
  const [mode, setMode] = useState<'compare' | 'edit'>('compare');
  const [editedPayload, setEditedPayload] = useState<Record<string, unknown>>(
    () => ({ ...conflict.payload })
  );
  const [resolving, setResolving] = useState(false);

  const changedFields = Object.keys(conflict.payload);
  const server = conflict.serverState ?? {};

  const handle = async (action: 'apply' | 'discard' | 'edit') => {
    setResolving(true);
    try {
      await onResolve(
        conflict.id,
        action,
        action === 'edit' ? editedPayload : undefined
      );
    } finally {
      setResolving(false);
    }
  };

  const fmt = (val: unknown): string => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Sí ✓' : 'No ✗';
    return String(val);
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.box}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerEmoji}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Conflicto de sincronización</Text>
              <Text style={styles.subtitle} numberOfLines={2}>{conflict.label}</Text>
            </View>
          </View>

          <Text style={styles.desc}>
            Este registro fue modificado por otro usuario mientras estabas sin conexión.
            Comparás tu versión offline con la versión actual del servidor.
          </Text>

          {/* ── Compare mode ── */}
          {mode === 'compare' && (
            <>
              <View style={styles.colHeads}>
                <Text style={[styles.colHead, { color: '#0a4f6e' }]}>Tu versión (offline)</Text>
                <Text style={[styles.colHead, { color: '#c0392b' }]}>Versión del servidor</Text>
              </View>
              <ScrollView style={styles.list} nestedScrollEnabled>
                {changedFields.map(field => {
                  const mine = fmt(conflict.payload[field]);
                  const theirs = fmt(server[field]);
                  const differs = mine !== theirs;
                  return (
                    <View key={field} style={styles.compareRow}>
                      <Text style={styles.fieldLabel}>
                        {FIELD_LABELS[field] ?? field}
                      </Text>
                      <View style={styles.valuesRow}>
                        <View style={[styles.valueBox, styles.valueMine, differs && styles.valueDiffers]}>
                          <Text style={styles.valueTxt}>{mine}</Text>
                        </View>
                        <Text style={styles.arrow}>→</Text>
                        <View style={[styles.valueBox, styles.valueServer, differs && styles.valueDiffers]}>
                          <Text style={styles.valueTxt}>{theirs}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnApply]}
                  onPress={() => handle('apply')}
                  disabled={resolving}>
                  {resolving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.btnTxt}>✓ Aplicar mi versión</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btn, styles.btnEdit]}
                  onPress={() => setMode('edit')}
                  disabled={resolving}>
                  <Text style={styles.btnTxt}>✏️ Editar y resolver</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btn, styles.btnDiscard]}
                  onPress={() => handle('discard')}
                  disabled={resolving}>
                  <Text style={[styles.btnTxt, { color: '#c0392b' }]}>
                    ✕ Descartar mi cambio
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Edit mode ── */}
          {mode === 'edit' && (
            <>
              <Text style={styles.editHint}>
                Modificá los valores y luego guardá. La versión del servidor se muestra como referencia.
              </Text>
              <ScrollView style={styles.list} nestedScrollEnabled>
                {changedFields.map(field => (
                  <View key={field} style={styles.editRow}>
                    <Text style={styles.fieldLabel}>{FIELD_LABELS[field] ?? field}</Text>
                    <Text style={styles.serverRef}>Servidor: {fmt(server[field])}</Text>
                    {EDITABLE_FIELDS.has(field) ? (
                      <TextInput
                        style={[styles.editInput, field === 'notas' && styles.editInputMulti]}
                        value={editedPayload[field] != null ? String(editedPayload[field]) : ''}
                        onChangeText={v =>
                          setEditedPayload(prev => ({ ...prev, [field]: v || null }))
                        }
                        placeholder={`Valor para ${FIELD_LABELS[field] ?? field}`}
                        placeholderTextColor="#bbb"
                        multiline={field === 'notas'}
                        numberOfLines={field === 'notas' ? 3 : 1}
                      />
                    ) : (
                      <Text style={styles.nonEditable}>
                        {fmt(editedPayload[field])}
                        {'  '}
                        <Text style={{ color: '#aaa', fontSize: 10 }}>(no editable aquí)</Text>
                      </Text>
                    )}
                  </View>
                ))}
              </ScrollView>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnApply]}
                  onPress={() => handle('edit')}
                  disabled={resolving}>
                  {resolving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.btnTxt}>✓ Guardar edición</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnEdit]}
                  onPress={() => setMode('compare')}
                  disabled={resolving}>
                  <Text style={styles.btnTxt}>← Volver a comparar</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  headerEmoji: { fontSize: 22, marginTop: 1 },
  title: { fontSize: 15, fontWeight: '800', color: '#0a4f6e' },
  subtitle: { fontSize: 12, color: '#888', marginTop: 2 },
  desc: {
    fontSize: 12,
    color: '#555',
    lineHeight: 17,
    marginBottom: 12,
    backgroundColor: '#fff8e6',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#f5a623',
  },
  colHeads: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  colHead: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  list: { maxHeight: 260, marginBottom: 12 },
  compareRow: { marginBottom: 10 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  valuesRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  valueBox: { flex: 1, borderRadius: 6, padding: 7, minHeight: 30, justifyContent: 'center' },
  valueMine: { backgroundColor: '#e8f4f8' },
  valueServer: { backgroundColor: '#fde8e8' },
  valueDiffers: { borderWidth: 1.5, borderColor: '#f5a623' },
  valueTxt: { fontSize: 12, color: '#222' },
  arrow: { fontSize: 14, color: '#aaa' },
  editHint: { fontSize: 12, color: '#555', marginBottom: 10 },
  editRow: { marginBottom: 12 },
  serverRef: { fontSize: 11, color: '#aaa', marginBottom: 4 },
  editInput: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#222',
    backgroundColor: '#fafafa',
  },
  editInputMulti: { height: 70, textAlignVertical: 'top' },
  nonEditable: { fontSize: 12, color: '#555', paddingVertical: 4 },
  actions: { gap: 8 },
  btn: {
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnApply: { backgroundColor: '#0a4f6e' },
  btnEdit: { backgroundColor: '#0a7ea4' },
  btnDiscard: { borderWidth: 1, borderColor: '#ffcccc', backgroundColor: '#fff' },
  btnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
