import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useSesion, esSuperAdmin } from '@/lib/auth-context';

type ResumenLider = {
  id: number;
  nombre: string;
  circunscripcion: number | null;
  municipio: string | null;
  colegio: string | null;
  celular: string | null;
  parent_lider_id: number | null;
  meta_votos: number | null;
  colaboradores: { id: number; nombre: string; colegio: string | null; }[];
  subLideresCount: number;
  totalRed: number;
};

export default function ResumenScreen() {
  const { sesion, cerrarSesion } = useSesion();
  const router = useRouter();
  const [totalMilitantes, setTotalMilitantes] = useState<number | null>(null);
  const [totalElectoral, setTotalElectoral] = useState<number | null>(null);
  const [lideres, setLideres] = useState<ResumenLider[]>([]);
  const [totalColaboradores, setTotalColaboradores] = useState(0);
  const [totalSubLideres, setTotalSubLideres] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const esLider = sesion?.rol === 'lider' && sesion?.lider_id;

    const [rMil, rElec, rLideres, rColab] = await Promise.all([
      supabase.from('padron').select('id_militante', { count: 'exact', head: true }),
      supabase.from('padron_electoral').select('id', { count: 'exact', head: true }),
      esLider
        ? supabase.from('lideres_campo').select('id, nombre, circunscripcion, municipio, colegio, celular, parent_lider_id, meta_votos').eq('id', sesion!.lider_id!)
        : supabase.from('lideres_campo').select('id, nombre, circunscripcion, municipio, colegio, celular, parent_lider_id, meta_votos').order('circunscripcion').order('nombre'),
      supabase.from('colaboradores_campo').select('id, nombre, colegio, lider_id'),
    ]);

    setTotalMilitantes(rMil.count);
    setTotalElectoral(rElec.count);
    setTotalColaboradores(rColab.data?.length || 0);

    const todosLideres = rLideres.data || [];
    const todosColab = rColab.data || [];

    const colabPorLider: { [id: number]: any[] } = {};
    for (const c of todosColab) {
      if (!colabPorLider[c.lider_id]) colabPorLider[c.lider_id] = [];
      colabPorLider[c.lider_id].push(c);
    }

    const getDescendants = (lid: number): number[] => {
      const hijos = todosLideres.filter(l => l.parent_lider_id === lid).map(l => l.id);
      return [...hijos, ...hijos.flatMap(h => getDescendants(h))];
    };

    // If lider role: show themselves as the only "root", skip the parent_lider_id filter
    const raices = esLider
      ? todosLideres
      : todosLideres.filter(l => !l.parent_lider_id);

    setTotalSubLideres(esLider ? 0 : todosLideres.length - raices.length);

    setLideres(raices.map(l => {
      const descendantIds = getDescendants(l.id);
      const todosIds = [l.id, ...descendantIds];
      const totalRed = todosIds.reduce((sum, id) => sum + (colabPorLider[id]?.length || 0), 0);
      return {
        ...l,
        colaboradores: colabPorLider[l.id] || [],
        subLideresCount: descendantIds.length,
        totalRed,
      };
    }));

    setCargando(false);
  }, [sesion]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const fmt = (n: number | null) => n != null ? n.toLocaleString('es-DO') : '—';

  const totalMetaGlobal = lideres.reduce((s, l) => s + (l.meta_votos || 0), 0);
  const totalRedGlobal = lideres.reduce((s, l) => s + l.totalRed, 0);
  const pctGlobal = totalMetaGlobal > 0 ? Math.min(100, Math.round(totalRedGlobal / totalMetaGlobal * 100)) : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerBand}>
          <Image source={require('../../assets/images/logo-prm.png')} style={styles.logoPRM} resizeMode="contain" />
          <View style={styles.headerTextos}>
            <Text style={styles.headerProyecto}>Proyecto Presidencial David Collado</Text>
            <Text style={styles.headerEquipo}>Equipo de Trabajo · Victor Ogando</Text>
          </View>
          {esSuperAdmin(sesion?.rol) && (
            <TouchableOpacity onPress={() => router.push('/usuarios')} style={styles.btnUsuarios}>
              <Text style={styles.btnUsuariosTxt}>⚙ Usuarios</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={cerrarSesion} style={styles.btnSalir}>
            <Text style={styles.btnSalirTxt}>Salir</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.titulo}>Resumen General</Text>
        {sesion && (
          <Text style={styles.usuarioTxt}>
            {sesion.rol === 'admin' ? '👑 Admin' : '★ Líder'} · {sesion.nombre}
          </Text>
        )}
      </View>

      {cargando ? <ActivityIndicator color="#0a7ea4" style={{ marginTop: 40 }} /> : (
        <>
          {/* Padrón stats — only admin sees these */}
          {sesion?.rol === 'admin' && (
            <View style={styles.metricasRow}>
              <View style={[styles.metricaCard, styles.metricaAzul]}>
                <Text style={styles.metricaNum}>{fmt(totalElectoral)}</Text>
                <Text style={styles.metricaLabel}>Militantes{'\n'}registrados</Text>
              </View>
              <View style={[styles.metricaCard, styles.metricaVerde]}>
                <Text style={styles.metricaNum}>{fmt(totalMilitantes)}</Text>
                <Text style={styles.metricaLabel}>Militantes{'\n'}activos</Text>
              </View>
            </View>
          )}

          <View style={styles.metricasRow}>
            <View style={[styles.metricaCard, styles.metricaOscuro]}>
              <Text style={styles.metricaNum}>{lideres.length}</Text>
              <Text style={styles.metricaLabel}>Líderes{'\n'}principales</Text>
            </View>
            {sesion?.rol === 'admin' && (
              <View style={[styles.metricaCard, styles.metricaDorado]}>
                <Text style={styles.metricaNum}>{totalSubLideres}</Text>
                <Text style={styles.metricaLabel}>Sub-líderes{'\n'}activos</Text>
              </View>
            )}
            <View style={[styles.metricaCard, styles.metricaGris]}>
              <Text style={styles.metricaNum}>{totalColaboradores}</Text>
              <Text style={styles.metricaLabel}>Colaboradores{'\n'}asignados</Text>
            </View>
          </View>

          {/* Meta global progress */}
          {pctGlobal !== null && (
            <View style={styles.metaGlobalCard}>
              <View style={styles.metaGlobalHeader}>
                <Text style={styles.metaGlobalTitulo}>🎯 Avance hacia meta global</Text>
                <Text style={styles.metaGlobalPct}>{pctGlobal}%</Text>
              </View>
              <View style={styles.progBg}>
                <View style={[styles.progFill, { width: `${pctGlobal}%` as any }]} />
              </View>
              <Text style={styles.metaGlobalSub}>{totalRedGlobal.toLocaleString('es-DO')} de {totalMetaGlobal.toLocaleString('es-DO')} personas movilizadas</Text>
            </View>
          )}

          {lideres.length > 0 && (
            <>
              <Text style={styles.seccionTitulo}>Líderes principales</Text>
              {lideres.map(l => {
                const isOpen = abierto === l.id;
                const meta = l.meta_votos || 0;
                const pctLider = meta > 0 ? Math.min(100, Math.round(l.totalRed / meta * 100)) : null;

                return (
                  <View key={l.id} style={styles.liderCard}>
                    <TouchableOpacity onPress={() => setAbierto(isOpen ? null : l.id)} style={styles.liderRow}>
                      <View style={styles.liderIcono}>
                        <Text style={styles.liderIconoTxt}>★</Text>
                      </View>
                      <View style={styles.liderInfo}>
                        <Text style={styles.liderNombre}>{l.nombre}</Text>
                        <Text style={styles.liderMeta}>
                          {[l.circunscripcion ? `CIR-${l.circunscripcion}` : null, l.municipio, l.colegio ? `Mesa ${l.colegio}` : null].filter(Boolean).join(' · ')}
                        </Text>
                        {pctLider !== null && (
                          <View style={styles.miniMetaRow}>
                            <View style={styles.miniProgBg}>
                              <View style={[styles.miniProgFill, { width: `${pctLider}%` as any }]} />
                            </View>
                            <Text style={styles.miniMetaTxt}>{l.totalRed}/{meta}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.liderRight}>
                        <View style={styles.statsBox}>
                          {l.subLideresCount > 0 && (
                            <View style={styles.statChip}>
                              <Text style={styles.statNum}>{l.subLideresCount}</Text>
                              <Text style={styles.statLabel}>sub</Text>
                            </View>
                          )}
                          <View style={[styles.statChip, styles.statChipRed]}>
                            <Text style={[styles.statNum, styles.statNumRed]}>{l.totalRed}</Text>
                            <Text style={[styles.statLabel, styles.statLabelRed]}>red</Text>
                          </View>
                        </View>
                        <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
                      </View>
                    </TouchableOpacity>

                    {isOpen && (
                      <View style={styles.equipoList}>
                        {l.subLideresCount > 0 && (
                          <Text style={styles.equipoResumenRed}>
                            🔗 {l.subLideresCount} sub-líder{l.subLideresCount > 1 ? 'es' : ''} · {l.totalRed} personas en toda la red
                          </Text>
                        )}
                        {meta > 0 && (
                          <View style={styles.metaDetalle}>
                            <Text style={styles.metaDetalleTxt}>
                              🎯 Meta: {meta} · Alcanzado: {l.totalRed} · {pctLider}%
                            </Text>
                          </View>
                        )}
                        <Text style={styles.equipoSeccion}>Equipo directo ({l.colaboradores.length})</Text>
                        {l.colaboradores.length === 0 ? (
                          <Text style={styles.equipoVacio}>Sin colaboradores aún</Text>
                        ) : (
                          l.colaboradores.map((c, ci) => (
                            <View key={c.id} style={styles.colabRow}>
                              <Text style={styles.colabNum}>{ci + 1}.</Text>
                              <View style={styles.colabInfo}>
                                <Text style={styles.colabNombre}>{c.nombre}</Text>
                                {c.colegio ? <Text style={styles.colabMeta}>Mesa {c.colegio}</Text> : null}
                              </View>
                            </View>
                          ))
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}

          {lideres.length === 0 && (
            <View style={styles.emptyLideres}>
              <Text style={styles.emptyTxt}>Aún no hay líderes registrados</Text>
              <Text style={styles.emptySubtxt}>Asignalos desde la búsqueda usando "★ Líder"</Text>
            </View>
          )}

          <TouchableOpacity style={styles.btnRefresh} onPress={cargar}>
            <Text style={styles.btnRefreshTxt}>↻ Actualizar</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 14, paddingBottom: 60, backgroundColor: '#f0f2f5' },
  header: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 14, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3 },
  headerBand: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  logoPRM: { width: 44, height: 44, marginRight: 10 },
  headerTextos: { flex: 1 },
  headerProyecto: { fontSize: 12, fontWeight: '700', color: '#0a4f6e' },
  headerEquipo: { fontSize: 11, color: '#0a7ea4', fontWeight: '600', marginTop: 1 },
  titulo: { fontSize: 18, fontWeight: 'bold', color: '#0a4f6e', textAlign: 'center' },
  usuarioTxt: { fontSize: 11, color: '#888', textAlign: 'center', marginTop: 2 },
  btnUsuarios: { backgroundColor: '#0a4f6e', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginRight: 5 },
  btnUsuariosTxt: { fontSize: 11, color: '#fff', fontWeight: '700' },
  btnSalir: { backgroundColor: '#f0f0f0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  btnSalirTxt: { fontSize: 11, color: '#555', fontWeight: '700' },
  metricasRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  metricaCard: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  metricaAzul: { backgroundColor: '#0a7ea4' },
  metricaVerde: { backgroundColor: '#1a6e35' },
  metricaOscuro: { backgroundColor: '#0a4f6e' },
  metricaDorado: { backgroundColor: '#c47f00' },
  metricaGris: { backgroundColor: '#555' },
  metricaNum: { fontSize: 26, fontWeight: '800', color: '#fff' },
  metricaLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 4, lineHeight: 15 },
  metaGlobalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3 },
  metaGlobalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  metaGlobalTitulo: { fontSize: 13, fontWeight: '700', color: '#0a4f6e' },
  metaGlobalPct: { fontSize: 18, fontWeight: '800', color: '#1a6e35' },
  progBg: { height: 10, backgroundColor: '#e0e0e0', borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  progFill: { height: '100%', backgroundColor: '#1a6e35', borderRadius: 5 },
  metaGlobalSub: { fontSize: 11, color: '#888', textAlign: 'center' },
  seccionTitulo: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 8 },
  liderCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 7, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3 },
  liderRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  liderIcono: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#0a4f6e', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  liderIconoTxt: { color: '#fff', fontSize: 13 },
  liderInfo: { flex: 1 },
  liderNombre: { fontSize: 13, fontWeight: '700', color: '#111' },
  liderMeta: { fontSize: 11, color: '#888', marginTop: 1 },
  miniMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  miniProgBg: { flex: 1, height: 5, backgroundColor: '#e0e0e0', borderRadius: 3, overflow: 'hidden' },
  miniProgFill: { height: '100%', backgroundColor: '#1a6e35', borderRadius: 3 },
  miniMetaTxt: { fontSize: 10, color: '#1a6e35', fontWeight: '700', minWidth: 36, textAlign: 'right' },
  liderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statsBox: { flexDirection: 'row', gap: 5 },
  statChip: { alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, minWidth: 36 },
  statChipRed: { backgroundColor: '#e8f4f8' },
  statNum: { fontSize: 13, fontWeight: '800', color: '#555' },
  statNumRed: { color: '#0a4f6e' },
  statLabel: { fontSize: 9, color: '#aaa', fontWeight: '600', textTransform: 'uppercase' },
  statLabelRed: { color: '#0a7ea4' },
  chevron: { color: '#aaa', fontSize: 11 },
  equipoList: { borderTopWidth: 1, borderTopColor: '#f5f5f5', paddingHorizontal: 12, paddingBottom: 10, paddingTop: 8 },
  equipoResumenRed: { fontSize: 12, color: '#0a7ea4', fontWeight: '600', marginBottom: 8 },
  metaDetalle: { backgroundColor: '#f0faf2', borderRadius: 7, padding: 8, marginBottom: 8 },
  metaDetalleTxt: { fontSize: 12, color: '#1a6e35', fontWeight: '600' },
  equipoSeccion: { fontSize: 10, fontWeight: '800', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  equipoVacio: { fontSize: 12, color: '#bbb', textAlign: 'center', paddingVertical: 8 },
  colabRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  colabNum: { fontSize: 12, color: '#aaa', width: 22 },
  colabInfo: { flex: 1 },
  colabNombre: { fontSize: 13, color: '#222', fontWeight: '500' },
  colabMeta: { fontSize: 11, color: '#aaa' },
  emptyLideres: { alignItems: 'center', paddingVertical: 30 },
  emptyTxt: { fontSize: 14, color: '#888', fontWeight: '600' },
  emptySubtxt: { fontSize: 12, color: '#bbb', marginTop: 4 },
  btnRefresh: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  btnRefreshTxt: { color: '#0a7ea4', fontSize: 14 },
});
