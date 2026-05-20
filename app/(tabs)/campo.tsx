import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';

const confirm = (msg: string) => window.confirm(msg);
const notify = (msg: string) => window.alert(msg);
const normCed = (c: string) => c.replace(/\D/g, '').padStart(11, '0');

type Lider = {
  id: number;
  cedula: string;
  nombre: string;
  celular: string | null;
  provincia: string | null;
  municipio: string | null;
  circunscripcion: number | null;
  colegio: string | null;
  parent_lider_id: number | null;
};

type Colaborador = {
  id: number;
  cedula: string;
  nombre: string;
  celular: string | null;
  colegio: string | null;
  municipio: string | null;
  lider_id: number | null;
};

type RedItem = {
  id: number;
  cedula: string;
  nombre: string;
  colegio: string | null;
  esLider: boolean;
  liderNombre: string;
};

export default function CampoScreen() {
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [liderByCedula, setLiderByCedula] = useState<Map<string, Lider>>(new Map());
  const [colaboradores, setColaboradores] = useState<{ [id: number]: Colaborador[] }>({});
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [filtroCirc, setFiltroCirc] = useState<number | 'todos'>('todos');
  const [modalRed, setModalRed] = useState<{ lider: Lider; items: RedItem[]; cargando: boolean } | null>(null);

  const cargarLideres = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase.from('lideres_campo').select('*').order('circunscripcion').order('nombre');
    setCargando(false);
    if (data) {
      setLideres(data);
      const map = new Map<string, Lider>();
      data.forEach(l => map.set(normCed(l.cedula), l));
      setLiderByCedula(map);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarLideres();
      setColaboradores({});
      setAbierto(null);
    }, [cargarLideres])
  );

  const cargarColaboradores = useCallback(async (liderId: number) => {
    const { data } = await supabase
      .from('colaboradores_campo').select('*').eq('lider_id', liderId).order('nombre');
    if (data) setColaboradores(prev => ({ ...prev, [liderId]: data }));
  }, []);

  const toggleLider = (id: number) => {
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    cargarColaboradores(id);
  };

  const eliminarLider = async (l: Lider) => {
    if (!confirm(`¿Quitar a ${l.nombre} como líder?\n\nSus colaboradores quedarán sin líder asignado.`)) return;
    const { error } = await supabase.from('lideres_campo').delete().eq('id', l.id);
    if (error) { notify(`Error: ${error.message}`); return; }
    setAbierto(null);
    setColaboradores(prev => { const next = { ...prev }; delete next[l.id]; return next; });
    cargarLideres();
  };

  const eliminarColaborador = async (liderId: number, c: Colaborador) => {
    if (!confirm(`¿Quitar a ${c.nombre} del equipo?`)) return;
    const { error } = await supabase.from('colaboradores_campo').delete().eq('id', c.id);
    if (error) { notify(`Error: ${error.message}`); return; }
    cargarColaboradores(liderId);
  };

  const promoverALider = async (c: Colaborador, parentLider: Lider) => {
    if (!confirm(`★ ¿Vincular a ${c.nombre} como sub-líder bajo ${parentLider.nombre}?\n\nPodrá tener su propio equipo y seguirá apareciendo como colaborador.`)) return;

    const liderExistente = liderByCedula.get(normCed(c.cedula));

    if (liderExistente) {
      // Ya es líder → solo actualizarle el parent_lider_id
      const { error } = await supabase.from('lideres_campo')
        .update({ parent_lider_id: parentLider.id })
        .eq('id', liderExistente.id);
      if (error) { notify(`Error: ${error.message}`); return; }
    } else {
      // No es líder todavía → insertar como sub-líder
      const { error } = await supabase.from('lideres_campo').insert({
        cedula: normCed(c.cedula),
        nombre: c.nombre,
        celular: c.celular || null,
        municipio: c.municipio || null,
        colegio: c.colegio || null,
        parent_lider_id: parentLider.id,
      });
      if (error) { notify(`Error: ${error.message}`); return; }
    }

    notify(`✓ ${c.nombre} vinculado como sub-líder de ${parentLider.nombre}.`);
    cargarLideres();
    cargarColaboradores(parentLider.id);
  };

  const verRedCompleta = async (l: Lider, allLideres: Lider[]) => {
    setModalRed({ lider: l, items: [], cargando: true });

    // BFS para encontrar todos los líderes descendientes
    const liderIds: number[] = [l.id];
    const visitados = new Set<number>([l.id]);
    let queue = [l.id];
    while (queue.length > 0) {
      const siguiente: number[] = [];
      for (const lid of queue) {
        for (const sl of allLideres) {
          if (sl.parent_lider_id === lid && !visitados.has(sl.id)) {
            visitados.add(sl.id);
            liderIds.push(sl.id);
            siguiente.push(sl.id);
          }
        }
      }
      queue = siguiente;
    }

    // Cargar todos los colaboradores de la red
    const { data } = await supabase
      .from('colaboradores_campo').select('*').in('lider_id', liderIds).order('nombre');

    const liderById = new Map(allLideres.map(x => [x.id, x]));
    const map = new Map<string, Lider>();
    allLideres.forEach(x => map.set(normCed(x.cedula), x));

    const items: RedItem[] = (data || []).map(c => ({
      id: c.id,
      cedula: c.cedula,
      nombre: c.nombre,
      colegio: c.colegio,
      esLider: map.has(normCed(c.cedula)),
      liderNombre: liderById.get(c.lider_id)?.nombre || '',
    }));

    setModalRed({ lider: l, items, cargando: false });
  };

  const getSubLideres = (lid: number) => lideres.filter(l => l.parent_lider_id === lid);

  // Solo líderes raíz en la lista principal
  const lideresRaiz = lideres.filter(l => !l.parent_lider_id);
  const circs = [...new Set(lideresRaiz.map(l => l.circunscripcion).filter((c): c is number => c !== null))].sort((a, b) => a - b);
  const lideresFiltrados = filtroCirc === 'todos' ? lideresRaiz : lideresRaiz.filter(l => l.circunscripcion === filtroCirc);
  const totalSubLideres = lideres.length - lideresRaiz.length;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.titulo}>Equipos de Trabajo</Text>
        <Text style={styles.subtitulo}>
          {lideresRaiz.length} líder{lideresRaiz.length !== 1 ? 'es' : ''}
          {totalSubLideres > 0 ? ` · ${totalSubLideres} sub-líder${totalSubLideres !== 1 ? 'es' : ''}` : ''}
        </Text>
      </View>

      {circs.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <TouchableOpacity
            style={[styles.chip, filtroCirc === 'todos' && styles.chipActivo]}
            onPress={() => setFiltroCirc('todos')}>
            <Text style={[styles.chipTxt, filtroCirc === 'todos' && styles.chipTxtActivo]}>Todos</Text>
          </TouchableOpacity>
          {circs.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, filtroCirc === c && styles.chipActivo]}
              onPress={() => setFiltroCirc(c)}>
              <Text style={[styles.chipTxt, filtroCirc === c && styles.chipTxtActivo]}>CIR-{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {cargando && <ActivityIndicator color="#0a7ea4" style={{ marginTop: 30 }} />}

      {!cargando && lideresFiltrados.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTxt}>Sin líderes asignados</Text>
          <Text style={styles.emptySubtxt}>Buscá un militante y usá "★ Líder" para asignarlo</Text>
        </View>
      )}

      {lideresFiltrados.map(l => {
        const isOpen = abierto === l.id;
        const equipo = colaboradores[l.id] || [];
        const subLids = getSubLideres(l.id);

        return (
          <View key={l.id} style={styles.liderCard}>
            <TouchableOpacity onPress={() => toggleLider(l.id)} style={styles.liderRow}>
              <View style={styles.iconoCirculo}>
                <Text style={styles.iconoTxt}>★</Text>
              </View>
              <View style={styles.liderInfo}>
                <Text style={styles.liderNombre}>{l.nombre}</Text>
                <Text style={styles.liderMeta}>
                  {[l.circunscripcion ? `CIR-${l.circunscripcion}` : null, l.municipio, l.colegio ? `Mesa ${l.colegio}` : null].filter(Boolean).join(' · ')}
                </Text>
                {subLids.length > 0 && (
                  <Text style={styles.redHint}>🔗 {subLids.length} sub-líder{subLids.length > 1 ? 'es' : ''} en su red</Text>
                )}
              </View>
              <View style={styles.rightCol}>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeTxt}>{colaboradores[l.id]?.length ?? '—'}</Text>
                </View>
                <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
              </View>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.equipoBox}>
                {l.celular ? <Text style={styles.liderContacto}>📱 {l.celular}</Text> : null}

                {/* Sub-líderes directos */}
                {subLids.length > 0 && (
                  <View style={styles.subLideresBox}>
                    <Text style={styles.subLideresTitulo}>Sub-líderes en su red ({subLids.length})</Text>
                    {subLids.map(sl => (
                      <View key={sl.id} style={styles.subLiderRow}>
                        <Text style={styles.subLiderStar}>★</Text>
                        <View style={styles.subLiderInfo}>
                          <Text style={styles.subLiderNombre}>{sl.nombre}</Text>
                          {sl.circunscripcion ? <Text style={styles.subLiderDetalle}>CIR-{sl.circunscripcion}</Text> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Colaboradores directos */}
                <Text style={styles.seccionLabel}>Colaboradores directos ({equipo.length})</Text>
                {equipo.length === 0 ? (
                  <Text style={styles.equipoVacio}>Sin colaboradores asignados aún</Text>
                ) : (
                  equipo.map((c, ci) => {
                    const esLider = liderByCedula.has(normCed(c.cedula));
                    return (
                      <View key={c.id} style={[styles.colab, esLider && styles.colabEsLider]}>
                        <View style={[styles.colabNumBox, esLider && styles.colabNumBoxLider]}>
                          <Text style={[styles.colabNumTxt, esLider && styles.colabNumTxtLider]}>
                            {esLider ? '★' : ci + 1}
                          </Text>
                        </View>
                        <View style={styles.colabInfo}>
                          <View style={styles.colabNameRow}>
                            <Text style={[styles.colabNombre, esLider && styles.colabNombreLider]} numberOfLines={1}>
                              {c.nombre}
                            </Text>
                            {esLider && (
                              <View style={styles.esLiderBadge}>
                                <Text style={styles.esLiderBadgeTxt}>Sub-líder</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.colabMeta}>{c.cedula}{c.colegio ? ` · Mesa ${c.colegio}` : ''}</Text>
                        </View>
                        <View style={styles.colabBtns}>
                          {!esLider && (
                            <TouchableOpacity onPress={() => promoverALider(c, l)} style={styles.btnPromover}>
                              <Text style={styles.btnPromoverTxt}>★</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={() => eliminarColaborador(l.id, c)} style={styles.btnX}>
                            <Text style={styles.btnXTxt}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}

                <View style={styles.footerBtns}>
                  <TouchableOpacity style={styles.btnVerRed} onPress={() => verRedCompleta(l, lideres)}>
                    <Text style={styles.btnVerRedTxt}>🔗 Ver red completa</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnEliminarLider} onPress={() => eliminarLider(l)}>
                    <Text style={styles.btnEliminarLiderTxt}>Quitar como líder</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}

      {/* Modal: red completa */}
      <Modal
        visible={!!modalRed}
        transparent
        animationType="slide"
        onRequestClose={() => setModalRed(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {modalRed && (
              <>
                <Text style={styles.modalTitulo}>Red de {modalRed.lider.nombre}</Text>
                {modalRed.cargando ? (
                  <ActivityIndicator color="#0a7ea4" style={{ marginVertical: 30 }} />
                ) : (
                  <>
                    <Text style={styles.modalSubtitulo}>
                      {modalRed.items.length} persona{modalRed.items.length !== 1 ? 's' : ''} en la red
                      {modalRed.items.filter(i => i.esLider).length > 0
                        ? ` · ${modalRed.items.filter(i => i.esLider).length} sub-líder${modalRed.items.filter(i => i.esLider).length > 1 ? 'es' : ''}`
                        : ''}
                    </Text>
                    <ScrollView style={{ maxHeight: 400 }}>
                      {modalRed.items.length === 0 ? (
                        <Text style={styles.sinPersonas}>Sin personas en la red aún</Text>
                      ) : (
                        modalRed.items.map((item, i) => (
                          <View key={item.id} style={[styles.redRow, item.esLider && styles.redRowLider]}>
                            <Text style={styles.redNum}>{i + 1}.</Text>
                            <View style={styles.redInfoCol}>
                              <Text style={[styles.redNombre, item.esLider && styles.redNombreLider]}>
                                {item.esLider ? '★ ' : ''}{item.nombre}
                              </Text>
                              <Text style={styles.redMeta}>
                                Equipo: {item.liderNombre}{item.colegio ? ` · Mesa ${item.colegio}` : ''}
                              </Text>
                            </View>
                          </View>
                        ))
                      )}
                    </ScrollView>
                  </>
                )}
                <TouchableOpacity style={styles.modalCerrar} onPress={() => setModalRed(null)}>
                  <Text style={styles.modalCerrarTxt}>Cerrar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, paddingBottom: 60, backgroundColor: '#f0f2f5' },
  header: { alignItems: 'center', marginBottom: 12, paddingTop: 6 },
  titulo: { fontSize: 18, fontWeight: 'bold', color: '#0a4f6e' },
  subtitulo: { fontSize: 12, color: '#888', marginTop: 2 },
  chipsScroll: { marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginRight: 6, backgroundColor: '#fff' },
  chipActivo: { backgroundColor: '#0a4f6e', borderColor: '#0a4f6e' },
  chipTxt: { fontSize: 12, color: '#666' },
  chipTxtActivo: { color: '#fff', fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyTxt: { color: '#666', fontSize: 15, fontWeight: '600' },
  emptySubtxt: { color: '#999', fontSize: 13, textAlign: 'center', marginTop: 6, paddingHorizontal: 20 },
  liderCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3 },
  liderRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  iconoCirculo: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0a4f6e', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  iconoTxt: { color: '#fff', fontSize: 14 },
  liderInfo: { flex: 1 },
  liderNombre: { fontSize: 14, fontWeight: '700', color: '#111' },
  liderMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  redHint: { fontSize: 11, color: '#0a7ea4', marginTop: 2, fontWeight: '600' },
  rightCol: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: { backgroundColor: '#f0f0f0', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  countBadgeTxt: { fontSize: 12, fontWeight: '700', color: '#444' },
  chevron: { color: '#aaa', fontSize: 11 },
  equipoBox: { borderTopWidth: 1, borderTopColor: '#f5f5f5', padding: 12 },
  liderContacto: { fontSize: 12, color: '#555', marginBottom: 10 },
  subLideresBox: { backgroundColor: '#f0f7ff', borderRadius: 8, padding: 10, marginBottom: 10 },
  subLideresTitulo: { fontSize: 10, fontWeight: '800', color: '#0a4f6e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  subLiderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  subLiderStar: { color: '#f5a623', fontSize: 15, marginRight: 8 },
  subLiderInfo: { flex: 1 },
  subLiderNombre: { fontSize: 13, fontWeight: '600', color: '#0a4f6e' },
  subLiderDetalle: { fontSize: 11, color: '#888' },
  seccionLabel: { fontSize: 10, fontWeight: '800', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  equipoVacio: { fontSize: 13, color: '#bbb', textAlign: 'center', paddingVertical: 12 },
  colab: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f8f8f8' },
  colabEsLider: { backgroundColor: '#fffbf0' },
  colabNumBox: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#e8f4f8', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  colabNumBoxLider: { backgroundColor: '#f5a623' },
  colabNumTxt: { fontSize: 11, color: '#0a7ea4', fontWeight: '700' },
  colabNumTxtLider: { color: '#fff' },
  colabInfo: { flex: 1 },
  colabNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  colabNombre: { fontSize: 13, fontWeight: '600', color: '#222', flexShrink: 1 },
  colabNombreLider: { color: '#0a4f6e' },
  colabMeta: { fontSize: 11, color: '#888', marginTop: 1 },
  esLiderBadge: { backgroundColor: '#f5a623', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  esLiderBadgeTxt: { fontSize: 9, fontWeight: '800', color: '#fff' },
  colabBtns: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btnPromover: { padding: 6, backgroundColor: '#fff9e6', borderRadius: 6, borderWidth: 1, borderColor: '#f5a623' },
  btnPromoverTxt: { color: '#f5a623', fontSize: 12, fontWeight: '700' },
  btnX: { padding: 6 },
  btnXTxt: { color: '#ddd', fontSize: 14, fontWeight: '700' },
  footerBtns: { marginTop: 12, gap: 8 },
  btnVerRed: { borderWidth: 1, borderColor: '#0a7ea4', borderRadius: 7, paddingVertical: 9, alignItems: 'center' },
  btnVerRedTxt: { color: '#0a7ea4', fontSize: 13, fontWeight: '600' },
  btnEliminarLider: { borderWidth: 1, borderColor: '#ffcccc', borderRadius: 7, paddingVertical: 9, alignItems: 'center' },
  btnEliminarLiderTxt: { color: '#e05050', fontSize: 13 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: '#0a4f6e', marginBottom: 4 },
  modalSubtitulo: { fontSize: 12, color: '#888', marginBottom: 14 },
  sinPersonas: { textAlign: 'center', color: '#999', fontSize: 13, paddingVertical: 20 },
  redRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  redRowLider: { backgroundColor: '#fffbf0' },
  redNum: { fontSize: 12, color: '#aaa', width: 26 },
  redInfoCol: { flex: 1 },
  redNombre: { fontSize: 13, fontWeight: '600', color: '#222' },
  redNombreLider: { color: '#0a4f6e' },
  redMeta: { fontSize: 11, color: '#888', marginTop: 1 },
  modalCerrar: { marginTop: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8 },
  modalCerrarTxt: { color: '#555', fontSize: 14 },
});
