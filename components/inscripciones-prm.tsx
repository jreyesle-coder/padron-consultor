import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { SesionApp } from '@/lib/auth-context';
import { enqueue } from '@/lib/sync-queue';
import { dialogAlert, dialogConfirm } from '@/lib/dialog';

type InscripcionItem = {
  id: number;
  cedula: string;
  nombre: string;
  celular: string | null;
  lider_id: number | null;
  lider_nombre: string | null;
  lider_circunscripcion: number | null;
  ultimo_contacto: string | null;
  updated_at: string | null;
};

type DiasFiltro = 'todos' | '3' | '7' | '30';

type Props = {
  sesion: SesionApp | null;
  ns: string | null;
  refreshKey?: number;
};

const auditar = (desc: string, id: number) => {
  supabase.from('auditoria').insert({ accion: 'app', tabla: 'campo', registro_id: id, descripcion: desc }).then(() => {});
};

export function InscripcionesPRM({ sesion, ns, refreshKey }: Props) {
  const [items, setItems] = useState<InscripcionItem[]>([]);
  const [cargando, setCargando] = useState(false);
  const [filtroLider, setFiltroLider] = useState<number | 'todos'>('todos');
  const [filtroCirc, setFiltroCirc] = useState<number | 'todos'>('todos');
  const [filtroDias, setFiltroDias] = useState<DiasFiltro>('todos');
  const [marcando, setMarcando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    if (!sesion) return;
    setCargando(true);
    try {
      let q = (supabase
        .from('colaboradores_campo')
        .select('id, cedula, nombre, celular, lider_id, ultimo_contacto, updated_at, lideres_campo!lider_id(nombre, circunscripcion)')
        .eq('pendiente_padron', true)
        .eq('padron_confirmado', false)
        .order('nombre') as any);

      if (sesion.rol === 'lider' && sesion.lider_id) {
        q = q.eq('lider_id', sesion.lider_id);
      }

      const { data } = await q;
      if (data) {
        setItems(data.map((row: any) => ({
          id: row.id,
          cedula: row.cedula,
          nombre: row.nombre,
          celular: row.celular,
          lider_id: row.lider_id,
          lider_nombre: row.lideres_campo?.nombre ?? null,
          lider_circunscripcion: row.lideres_campo?.circunscripcion ?? null,
          ultimo_contacto: row.ultimo_contacto,
          updated_at: row.updated_at,
        })));
      }
    } finally {
      setCargando(false);
    }
  }, [sesion]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  useEffect(() => {
    if (refreshKey) cargar(); // 0 falsy → skip mount, only fire on manual refresh
  }, [refreshKey]);

  // Opciones de filtro derivadas de los datos
  const lideresOpts = [
    ...new Map(
      items
        .filter(i => i.lider_id !== null)
        .map(i => [i.lider_id, { id: i.lider_id!, nombre: i.lider_nombre ?? 'Sin nombre' }])
    ).values(),
  ];
  const circsOpts = [
    ...new Set(
      items.map(i => i.lider_circunscripcion).filter((c): c is number => c !== null)
    ),
  ].sort((a, b) => a - b);

  const pasaDias = (item: InscripcionItem): boolean => {
    if (filtroDias === 'todos') return true;
    if (!item.ultimo_contacto) return true;
    const dias = Math.floor((Date.now() - new Date(item.ultimo_contacto).getTime()) / 86400000);
    return dias >= parseInt(filtroDias);
  };

  const filtrados = items.filter(item => {
    if (filtroLider !== 'todos' && item.lider_id !== filtroLider) return false;
    if (filtroCirc !== 'todos' && item.lider_circunscripcion !== filtroCirc) return false;
    return pasaDias(item);
  });

  const abrirVerificate = async (cedula: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(cedula);
      } catch {}
    }
    Linking.openURL('https://verificate.prm.do');
  };

  const marcarInscrito = async (item: InscripcionItem) => {
    if (!await dialogConfirm(`¿Confirmar que ${item.nombre} ya está inscrito en el padrón PRM?`)) return;
    setMarcando(item.id);
    const payload = { padron_confirmado: true, pendiente_padron: false };

    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (offline) {
      await enqueue(ns ?? '', { table: 'colaboradores_campo', operation: 'update', payload, filter: { id: item.id }, capturedUpdatedAt: item.updated_at ?? undefined, label: `✓ PRM: ${item.nombre}` });
      setItems(prev => prev.filter(x => x.id !== item.id));
      setMarcando(null);
      await dialogAlert('✓ Guardado localmente. Se sincronizará con conexión.');
      return;
    }

    const { error } = await supabase.from('colaboradores_campo').update(payload).eq('id', item.id);
    if (error) {
      await enqueue(ns ?? '', { table: 'colaboradores_campo', operation: 'update', payload, filter: { id: item.id }, capturedUpdatedAt: item.updated_at ?? undefined, label: `✓ PRM: ${item.nombre}` });
      setItems(prev => prev.filter(x => x.id !== item.id));
      setMarcando(null);
      await dialogAlert('✓ Guardado localmente. Se sincronizará con conexión.');
      return;
    }

    auditar(`PRM confirmado: ${item.nombre}`, item.id);
    setItems(prev => prev.filter(x => x.id !== item.id));
    setMarcando(null);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* KPI */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiNum}>{items.length}</Text>
          <Text style={styles.kpiLabel}>Total pendientes</Text>
        </View>
        <View style={[styles.kpiCard, { borderColor: '#0a7ea4' }]}>
          <Text style={[styles.kpiNum, { color: '#0a7ea4' }]}>{filtrados.length}</Text>
          <Text style={styles.kpiLabel}>Con filtros</Text>
        </View>
        <TouchableOpacity style={styles.kpiReload} onPress={cargar}>
          <Text style={styles.kpiReloadTxt}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Filtro por líder */}
      {lideresOpts.length > 1 && (
        <View style={styles.filterBlock}>
          <Text style={styles.filterLabel}>POR LÍDER</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, filtroLider === 'todos' && styles.chipActivo]}
                onPress={() => setFiltroLider('todos')}>
                <Text style={[styles.chipTxt, filtroLider === 'todos' && styles.chipTxtActivo]}>Todos</Text>
              </TouchableOpacity>
              {lideresOpts.map(l => (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.chip, filtroLider === l.id && styles.chipActivo]}
                  onPress={() => setFiltroLider(l.id)}>
                  <Text style={[styles.chipTxt, filtroLider === l.id && styles.chipTxtActivo]} numberOfLines={1}>
                    {l.nombre.split(' ').slice(0, 2).join(' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Filtro circunscripción */}
      {circsOpts.length > 1 && (
        <View style={styles.filterBlock}>
          <Text style={styles.filterLabel}>CIRCUNSCRIPCIÓN</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, filtroCirc === 'todos' && styles.chipActivo]}
                onPress={() => setFiltroCirc('todos')}>
                <Text style={[styles.chipTxt, filtroCirc === 'todos' && styles.chipTxtActivo]}>Todos</Text>
              </TouchableOpacity>
              {circsOpts.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, filtroCirc === c && styles.chipActivo]}
                  onPress={() => setFiltroCirc(c)}>
                  <Text style={[styles.chipTxt, filtroCirc === c && styles.chipTxtActivo]}>CIR-{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Filtro días */}
      <View style={styles.filterBlock}>
        <Text style={styles.filterLabel}>DÍAS SIN CONTACTO</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {(['todos', '3', '7', '30'] as DiasFiltro[]).map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.chip, filtroDias === d && styles.chipActivo]}
                onPress={() => setFiltroDias(d)}>
                <Text style={[styles.chipTxt, filtroDias === d && styles.chipTxtActivo]}>
                  {d === 'todos' ? 'Todos' : `+${d}d`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {cargando && <ActivityIndicator color="#0a7ea4" style={{ marginVertical: 20 }} />}

      {!cargando && filtrados.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>{items.length === 0 ? '✅' : '🔍'}</Text>
          <Text style={styles.emptyTxt}>
            {items.length === 0 ? '¡Sin inscripciones pendientes!' : 'Sin resultados con estos filtros'}
          </Text>
        </View>
      )}

      {filtrados.map(item => (
        <View key={item.id} style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardNombre}>{item.nombre}</Text>
              <Text style={styles.cardCedula}>{item.cedula}</Text>
              {item.lider_nombre && (
                <Text style={styles.cardLider}>
                  ★ {item.lider_nombre}
                  {item.lider_circunscripcion ? ` · CIR-${item.lider_circunscripcion}` : ''}
                </Text>
              )}
              {item.ultimo_contacto && (
                <Text style={styles.cardContacto}>
                  📞 Últ. contacto: {new Date(item.ultimo_contacto).toLocaleDateString('es-DO')}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.cardBtns}>
            <TouchableOpacity
              style={styles.btnVerificate}
              onPress={() => abrirVerificate(item.cedula)}>
              <Text style={styles.btnVerificateTxt}>🌐 Verificate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnInscrito, marcando === item.id && styles.btnOff]}
              onPress={() => marcarInscrito(item)}
              disabled={marcando === item.id}>
              <Text style={styles.btnInscritoTxt}>
                {marcando === item.id ? '...' : '✓ Inscrito'}
              </Text>
            </TouchableOpacity>
            {item.celular ? (
              <TouchableOpacity
                style={styles.btnLlamar}
                onPress={() => Linking.openURL(`tel:${item.celular}`)}>
                <Text style={styles.btnLlamarTxt}>📞</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.btnLlamar, styles.btnOff]}>
                <Text style={[styles.btnLlamarTxt, { color: '#ccc' }]}>📵</Text>
              </View>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 10, paddingBottom: 100 },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'center' },
  kpiCard: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#f5a623', elevation: 1 },
  kpiNum: { fontSize: 22, fontWeight: '900', color: '#f5a623' },
  kpiLabel: { fontSize: 10, color: '#888', marginTop: 2, textAlign: 'center' },
  kpiReload: { backgroundColor: '#e8f4f8', borderRadius: 8, width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  kpiReloadTxt: { fontSize: 16, color: '#0a4f6e', fontWeight: '700' },
  filterBlock: { marginBottom: 8 },
  filterLabel: { fontSize: 9, fontWeight: '800', color: '#bbb', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, marginLeft: 2 },
  chipRow: { flexDirection: 'row', gap: 6, paddingRight: 10 },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#fff' },
  chipActivo: { backgroundColor: '#0a4f6e', borderColor: '#0a4f6e' },
  chipTxt: { fontSize: 11, color: '#666' },
  chipTxtActivo: { color: '#fff', fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 36, marginBottom: 10 },
  emptyTxt: { fontSize: 14, color: '#888', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 8, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2 },
  cardTop: { padding: 12, paddingBottom: 8 },
  cardInfo: {},
  cardNombre: { fontSize: 14, fontWeight: '700', color: '#111' },
  cardCedula: { fontSize: 11, color: '#888', marginTop: 1 },
  cardLider: { fontSize: 11, color: '#0a7ea4', marginTop: 3, fontWeight: '600' },
  cardContacto: { fontSize: 10, color: '#999', marginTop: 2 },
  cardBtns: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f5f5f5' },
  btnVerificate: { flex: 2, paddingVertical: 9, alignItems: 'center', backgroundColor: '#f0f7ff', borderRightWidth: 1, borderRightColor: '#e0e0e0' },
  btnVerificateTxt: { fontSize: 12, fontWeight: '700', color: '#0a4f6e' },
  btnInscrito: { flex: 2, paddingVertical: 9, alignItems: 'center', backgroundColor: '#e6f4ea', borderRightWidth: 1, borderRightColor: '#e0e0e0' },
  btnInscritoTxt: { fontSize: 12, fontWeight: '700', color: '#1a6e35' },
  btnLlamar: { flex: 1, paddingVertical: 9, alignItems: 'center', backgroundColor: '#fff9e6' },
  btnLlamarTxt: { fontSize: 14, color: '#7a4f00' },
  btnOff: { opacity: 0.4 },
});
