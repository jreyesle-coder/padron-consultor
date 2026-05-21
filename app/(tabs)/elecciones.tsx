import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSesion } from '@/lib/auth-context';

type Colab = {
  id: number;
  nombre: string;
  cedula: string;
  celular: string | null;
  colegio: string | null;
  municipio: string | null;
  voto_confirmado: boolean;
  necesita_transporte: boolean;
  lider_id: number;
};

type LiderConEquipo = {
  id: number;
  nombre: string;
  circunscripcion: number | null;
  municipio: string | null;
  equipo: Colab[];
};

export default function EleccionesScreen() {
  const { sesion, cerrarSesion } = useSesion();
  const [lideres, setLideres] = useState<LiderConEquipo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const esLider = sesion?.rol === 'lider' && sesion?.lider_id;

    const [rLideres, rColab] = await Promise.all([
      esLider
        ? supabase.from('lideres_campo').select('id, nombre, circunscripcion, municipio').eq('id', sesion!.lider_id!)
        : supabase.from('lideres_campo').select('id, nombre, circunscripcion, municipio').is('parent_lider_id', null).order('circunscripcion').order('nombre'),
      supabase.from('colaboradores_campo').select('id, nombre, cedula, celular, colegio, municipio, voto_confirmado, necesita_transporte, lider_id'),
    ]);

    const todosColab: Colab[] = rColab.data || [];
    setLideres((rLideres.data || []).map((l: any) => ({
      ...l,
      equipo: todosColab.filter(c => c.lider_id === l.id),
    })));
    setCargando(false);
  }, [sesion]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const toggleVoto = async (c: Colab) => {
    const nuevo = !c.voto_confirmado;
    await supabase.from('colaboradores_campo').update({ voto_confirmado: nuevo }).eq('id', c.id);
    setLideres(prev => prev.map(l => ({
      ...l,
      equipo: l.equipo.map(x => x.id === c.id ? { ...x, voto_confirmado: nuevo } : x),
    })));
  };

  const toggleTransporte = async (c: Colab) => {
    const nuevo = !c.necesita_transporte;
    await supabase.from('colaboradores_campo').update({ necesita_transporte: nuevo }).eq('id', c.id);
    setLideres(prev => prev.map(l => ({
      ...l,
      equipo: l.equipo.map(x => x.id === c.id ? { ...x, necesita_transporte: nuevo } : x),
    })));
  };

  const totalColab = lideres.reduce((s, l) => s + l.equipo.length, 0);
  const totalVotaron = lideres.reduce((s, l) => s + l.equipo.filter(c => c.voto_confirmado).length, 0);
  const totalTransporte = lideres.reduce((s, l) => s + l.equipo.filter(c => c.necesita_transporte).length, 0);
  const pct = totalColab > 0 ? Math.round(totalVotaron / totalColab * 100) : 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerBand}>
          <Image source={require('../../assets/images/logo-prm.png')} style={styles.logoPRM} resizeMode="contain" />
          <View style={styles.headerTextos}>
            <Text style={styles.headerProyecto}>Proyecto Presidencial David Collado</Text>
            <Text style={styles.headerEquipo}>Equipo de Trabajo · Victor Ogando</Text>
          </View>
          <TouchableOpacity onPress={cerrarSesion} style={styles.btnSalir}>
            <Text style={styles.btnSalirTxt}>Salir</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.titulo}>Día de Elecciones</Text>
        {sesion && (
          <Text style={styles.usuarioTxt}>
            {sesion.rol === 'admin' ? '👑 Admin' : '★ Líder'} · {sesion.nombre}
          </Text>
        )}
      </View>

      {cargando ? <ActivityIndicator color="#0a7ea4" style={{ marginTop: 40 }} /> : (
        <>
          {/* Contadores */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, styles.statTotal]}>
              <Text style={styles.statNum}>{totalColab}</Text>
              <Text style={styles.statLbl}>Total{'\n'}equipo</Text>
            </View>
            <View style={[styles.statCard, styles.statVotaron]}>
              <Text style={styles.statNum}>{totalVotaron}</Text>
              <Text style={styles.statLbl}>Confirmaron{'\n'}voto</Text>
            </View>
            <View style={[styles.statCard, styles.statFalta]}>
              <Text style={styles.statNum}>{totalColab - totalVotaron}</Text>
              <Text style={styles.statLbl}>Pendientes</Text>
            </View>
          </View>

          {/* Barra de progreso */}
          <View style={styles.progContainer}>
            <View style={styles.progBg}>
              <View style={[styles.progFill, { width: `${pct}%` as any }]} />
            </View>
            <Text style={styles.progTxt}>{pct}% del equipo confirmó su voto</Text>
          </View>

          {totalTransporte > 0 && (
            <View style={styles.transporteAviso}>
              <Text style={styles.transporteAvisoTxt}>
                🚗 {totalTransporte} persona{totalTransporte > 1 ? 's' : ''} necesitan transporte
              </Text>
            </View>
          )}

          {/* Lista por líder */}
          {lideres.map(l => {
            const isOpen = abierto === l.id;
            const votaron = l.equipo.filter(c => c.voto_confirmado).length;
            const transporte = l.equipo.filter(c => c.necesita_transporte).length;
            const pctL = l.equipo.length > 0 ? Math.round(votaron / l.equipo.length * 100) : 0;

            return (
              <View key={l.id} style={styles.liderCard}>
                <TouchableOpacity style={styles.liderRow} onPress={() => setAbierto(isOpen ? null : l.id)}>
                  <View style={styles.liderIcono}>
                    <Text style={styles.liderIconoTxt}>★</Text>
                  </View>
                  <View style={styles.liderInfo}>
                    <Text style={styles.liderNombre}>{l.nombre}</Text>
                    <Text style={styles.liderMeta}>
                      {[l.circunscripcion ? `CIR-${l.circunscripcion}` : null, l.municipio].filter(Boolean).join(' · ')}
                    </Text>
                    <View style={styles.miniProgBg}>
                      <View style={[styles.miniProgFill, { width: `${pctL}%` as any }]} />
                    </View>
                  </View>
                  <View style={styles.liderRight}>
                    <Text style={styles.liderCount}>{votaron}/{l.equipo.length}</Text>
                    {transporte > 0 && <Text style={styles.transportBadge}>🚗{transporte}</Text>}
                    <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
                  </View>
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.equipoList}>
                    {l.equipo.length === 0 ? (
                      <Text style={styles.vacio}>Sin colaboradores</Text>
                    ) : (
                      l.equipo.map(c => (
                        <View key={c.id} style={[styles.colabRow, c.voto_confirmado && styles.colabVoto]}>
                          <View style={styles.colabInfo}>
                            <Text style={[styles.colabNombre, c.voto_confirmado && styles.colabNombreVoto]}>
                              {c.voto_confirmado ? '✓ ' : ''}{c.nombre}
                            </Text>
                            <Text style={styles.colabMeta}>
                              {[c.cedula, c.colegio ? `Mesa ${c.colegio}` : null, c.celular].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                          <View style={styles.colabBtns}>
                            <TouchableOpacity
                              style={[styles.btnVoto, c.voto_confirmado && styles.btnVotoActivo]}
                              onPress={() => toggleVoto(c)}>
                              <Text style={[styles.btnVotoTxt, c.voto_confirmado && styles.btnVotoTxtActivo]}>
                                {c.voto_confirmado ? '✓ Votó' : 'Votó?'}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.btnTransporte, c.necesita_transporte && styles.btnTransporteActivo]}
                              onPress={() => toggleTransporte(c)}>
                              <Text style={styles.btnTransporteTxt}>🚗</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })}

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
  btnSalir: { backgroundColor: '#f0f0f0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  btnSalirTxt: { fontSize: 11, color: '#555', fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  statTotal: { backgroundColor: '#0a4f6e' },
  statVotaron: { backgroundColor: '#1a6e35' },
  statFalta: { backgroundColor: '#555' },
  statNum: { fontSize: 26, fontWeight: '800', color: '#fff' },
  statLbl: { fontSize: 10, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 3, lineHeight: 14 },
  progContainer: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10 },
  progBg: { height: 14, backgroundColor: '#e0e0e0', borderRadius: 7, overflow: 'hidden', marginBottom: 6 },
  progFill: { height: '100%', backgroundColor: '#1a6e35', borderRadius: 7 },
  progTxt: { fontSize: 12, color: '#555', fontWeight: '600', textAlign: 'center' },
  transporteAviso: { backgroundColor: '#fff8e6', borderRadius: 10, padding: 10, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#f5a623' },
  transporteAvisoTxt: { fontSize: 13, color: '#7a4f00', fontWeight: '600' },
  liderCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3 },
  liderRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  liderIcono: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#0a4f6e', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  liderIconoTxt: { color: '#fff', fontSize: 13 },
  liderInfo: { flex: 1 },
  liderNombre: { fontSize: 13, fontWeight: '700', color: '#111' },
  liderMeta: { fontSize: 11, color: '#888', marginTop: 1 },
  miniProgBg: { height: 5, backgroundColor: '#e0e0e0', borderRadius: 3, overflow: 'hidden', marginTop: 6, width: '100%' },
  miniProgFill: { height: '100%', backgroundColor: '#1a6e35', borderRadius: 3 },
  liderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liderCount: { fontSize: 14, fontWeight: '800', color: '#0a4f6e', minWidth: 38, textAlign: 'right' },
  transportBadge: { fontSize: 11, color: '#7a4f00' },
  chevron: { color: '#aaa', fontSize: 11 },
  equipoList: { borderTopWidth: 1, borderTopColor: '#f5f5f5', paddingHorizontal: 12, paddingBottom: 10, paddingTop: 8 },
  vacio: { fontSize: 12, color: '#bbb', textAlign: 'center', paddingVertical: 8 },
  colabRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f8f8f8' },
  colabVoto: { backgroundColor: '#f0faf2' },
  colabInfo: { flex: 1 },
  colabNombre: { fontSize: 13, fontWeight: '500', color: '#222' },
  colabNombreVoto: { color: '#1a6e35', fontWeight: '700' },
  colabMeta: { fontSize: 11, color: '#888', marginTop: 1 },
  colabBtns: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  btnVoto: { borderWidth: 1.5, borderColor: '#ccc', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 },
  btnVotoActivo: { backgroundColor: '#1a6e35', borderColor: '#1a6e35' },
  btnVotoTxt: { fontSize: 12, color: '#888', fontWeight: '600' },
  btnVotoTxtActivo: { color: '#fff' },
  btnTransporte: { borderWidth: 1.5, borderColor: '#ccc', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  btnTransporteActivo: { backgroundColor: '#f5a623', borderColor: '#f5a623' },
  btnTransporteTxt: { fontSize: 14 },
  btnRefresh: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  btnRefreshTxt: { color: '#0a7ea4', fontSize: 14 },
});
