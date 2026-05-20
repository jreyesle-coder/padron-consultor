import { useEffect, useState } from 'react';
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

const confirm = (msg: string) => window.confirm(msg);
const notify = (msg: string) => window.alert(msg);
import { supabase } from '../../lib/supabase';

export type Persona = {
  id: number;
  id_militante: number;
  id_recinto: number;
  cedula: string;
  numero_lista: number | null;
  direccion: string;
  celular: string;
  nombre_completo: string;
  provincia: string;
  municipio: string;
  colegio: string;
  en_concurrencia: boolean;
  es_militante: boolean;
};

export type RecintoInfo = {
  codigo_recinto: number;
  provincia: string;
  municipio: string;
  distrito: string;
  num_colegios: number;
  circunscripcion: number | null;
};

type Lider = { id: number; nombre: string; circunscripcion: number | null; parent_lider_id: number | null; };

const PAGE_SIZE = 50;
const MAX_RESULTS = 500;
const esCedula = (t: string) => /^[\d\-]+$/.test(t.trim());
export let recintosCache: Map<number, RecintoInfo> = new Map();

export default function HomeScreen() {
  const [busqueda, setBusqueda] = useState('');
  const [provinciaFiltro, setProvinciaFiltro] = useState('');
  const [municipioFiltro, setMunicipioFiltro] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [resultados, setResultados] = useState<Persona[]>([]);
  const [cargando, setCargando] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [modoBusqueda, setModoBusqueda] = useState<'nombre' | 'cedula' | null>(null);
  const [recintos, setRecintos] = useState<Map<number, RecintoInfo>>(new Map());
  const [expandido, setExpandido] = useState<number | null>(null);

  // Modal para elegir líder al asignar colaborador
  const [modalLideres, setModalLideres] = useState(false);
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [personaParaAsignar, setPersonaParaAsignar] = useState<Persona | null>(null);

  useEffect(() => {
    supabase.from('recintos')
      .select('id_recinto, codigo_recinto, provincia, municipio, distrito, num_colegios, circunscripcion')
      .then(({ data }) => {
        if (data) {
          const map = new Map<number, RecintoInfo>();
          data.forEach(r => map.set(r.id_recinto, r));
          setRecintos(map);
          recintosCache = map;
        }
      });
  }, []);

  const normalizarCedula = (c: string) => c.replace(/\D/g, '').padStart(11, '0');
  const formatearCedula = (v: string) => {
    const n = v.replace(/\D/g, '');
    return n.length === 11 ? `${n.slice(0,3)}-${n.slice(3,10)}-${n.slice(10)}` : v;
  };

  const electoralAPersona = (e: any): Persona => ({
    id: e.id, id_militante: 0, id_recinto: 0,
    cedula: formatearCedula(e.cedula), numero_lista: null,
    direccion: '', celular: '',
    nombre_completo: `${e.nombres} ${e.primer_apellido}${e.segundo_apellido ? ' ' + e.segundo_apellido : ''}`.trim(),
    provincia: e.provincia, municipio: e.municipio, colegio: e.colegio,
    en_concurrencia: false, es_militante: true,
  });

  const enriquecerConPadronElectoral = async (personas: Persona[]): Promise<Persona[]> => {
    const cedulas = personas.filter(p => !p.provincia).map(p => normalizarCedula(p.cedula));
    if (!cedulas.length) return personas;
    const { data: ed } = await supabase.from('padron_electoral')
      .select('cedula, nombres, primer_apellido, segundo_apellido, provincia, municipio, colegio').in('cedula', cedulas);
    if (!ed?.length) return personas;
    const mapa = new Map(ed.map(r => [r.cedula, r]));
    return personas.map(p => {
      const e = mapa.get(normalizarCedula(p.cedula));
      if (e) return { ...p, provincia: p.provincia || e.provincia, municipio: p.municipio || e.municipio, colegio: p.colegio || e.colegio };
      return p;
    });
  };

  const ejecutarBusqueda = async (nuevaBusqueda = true) => {
    const texto = busqueda.trim();
    if (!texto) { setResultados([]); return; }
    const modo: 'cedula' | 'nombre' = esCedula(texto) ? 'cedula' : 'nombre';
    setCargando(true);
    const paginaActual = nuevaBusqueda ? 0 : pagina + 1;
    const desde = paginaActual * PAGE_SIZE;
    const hasta = desde + PAGE_SIZE - 1;
    if (desde >= MAX_RESULTS) { setCargando(false); return; }

    if (modo === 'cedula') {
      const cedulaNorm = normalizarCedula(texto);
      const cedulaFmt = formatearCedula(texto);
      const esCompleta = texto.replace(/\D/g, '').length === 11;
      const [resPadron, resElectoral] = await Promise.all([
        esCompleta ? supabase.from('padron').select('*').eq('cedula', cedulaFmt)
          : supabase.from('padron').select('*').ilike('cedula', `${cedulaFmt}%`).range(desde, hasta),
        esCompleta ? supabase.from('padron_electoral').select('*').eq('cedula', cedulaNorm)
          : supabase.from('padron_electoral').select('*').ilike('cedula', `${cedulaNorm}%`).range(desde, hasta),
      ]);
      setCargando(false);
      const padronData: Persona[] = (resPadron.data || []).map(p => ({ ...p, es_militante: true }));
      const cedulasPadron = new Set(padronData.map(p => normalizarCedula(p.cedula)));
      const soloElectoral = (resElectoral.data || []).filter(e => !cedulasPadron.has(normalizarCedula(e.cedula))).map(electoralAPersona);
      let todos = [...padronData, ...soloElectoral];
      todos = await enriquecerConPadronElectoral(todos);
      if (nuevaBusqueda) { setResultados(todos); setPagina(0); setModoBusqueda(modo); setExpandido(null); }
      else { setResultados(prev => [...prev, ...todos]); setPagina(paginaActual); }
      return;
    }

    const palabras = texto.toUpperCase().split(/\s+/).filter(w => w.length > 1);
    const ancla = palabras[palabras.length - 1];
    const otras = palabras.slice(0, -1);
    const [resPadron, resElectoral] = await Promise.all([
      (() => {
        let q = supabase.from('padron').select('*').ilike('nombre_completo', `%${texto}%`);
        if (provinciaFiltro) q = q.ilike('provincia', `%${provinciaFiltro}%`);
        if (municipioFiltro) q = q.ilike('municipio', `%${municipioFiltro}%`);
        return q.range(desde, hasta);
      })(),
      (() => {
        if (!palabras.length) return Promise.resolve({ data: [], error: null });
        let q = supabase.from('padron_electoral').select('*').eq('primer_apellido', ancla);
        if (otras.length > 0) q = q.ilike('nombres', `%${otras.join(' ')}%`);
        return q.range(0, 999);
      })(),
    ]);
    setCargando(false);
    const padronData: Persona[] = (resPadron.data || []).map(p => ({ ...p, es_militante: true }));
    const electoralFiltrado = (resElectoral.data || []).filter(e => {
      const nc = `${e.nombres} ${e.primer_apellido} ${e.segundo_apellido || ''}`.toUpperCase();
      return palabras.every(w => nc.includes(w));
    });
    const cedulasPadron = new Set(padronData.map(p => normalizarCedula(p.cedula)));
    const soloElectoral = electoralFiltrado.filter(e => !cedulasPadron.has(normalizarCedula(e.cedula))).map(electoralAPersona);
    let todos = [...padronData, ...soloElectoral];
    todos = await enriquecerConPadronElectoral(todos);
    if (nuevaBusqueda) { setResultados(todos); setPagina(0); setModoBusqueda(modo); setExpandido(null); }
    else { setResultados(prev => [...prev, ...todos]); setPagina(paginaActual); }
  };

  const confirmarLider = async (p: Persona) => {
    if (!confirm(`★ ¿Asignar a ${p.nombre_completo} como líder de campo?`)) return;
    const rec = p.id_recinto ? recintos.get(p.id_recinto) : null;
    const { error } = await supabase.from('lideres_campo').insert({
      cedula: normalizarCedula(p.cedula), nombre: p.nombre_completo,
      celular: p.celular || null, provincia: p.provincia || rec?.provincia || null,
      municipio: p.municipio || rec?.municipio || null,
      circunscripcion: rec?.circunscripcion || null,
      id_recinto: p.id_recinto || null, colegio: p.colegio || null,
    });
    if (error) notify(error.code === '23505' ? `${p.nombre_completo} ya está registrado como líder.` : `Error: ${error.message}`);
    else notify(`✓ ${p.nombre_completo} asignado como líder de campo.`);
  };

  const iniciarAsignarColaborador = async (p: Persona) => {
    setPersonaParaAsignar(p);
    const { data } = await supabase
      .from('lideres_campo')
      .select('id, nombre, circunscripcion, parent_lider_id')
      .order('parent_lider_id', { nullsFirst: true })
      .order('nombre');
    setLideres(data || []);
    setModalLideres(true);
  };

  const confirmarColaborador = async (p: Persona, lider: Lider) => {
    setModalLideres(false);
    if (!confirm(`👥 ¿Agregar a ${p.nombre_completo} al equipo de ${lider.nombre}?`)) return;
    const rec = p.id_recinto ? recintos.get(p.id_recinto) : null;
    const { error } = await supabase.from('colaboradores_campo').insert({
      cedula: normalizarCedula(p.cedula), nombre: p.nombre_completo,
      celular: p.celular || null, provincia: p.provincia || rec?.provincia || null,
      municipio: p.municipio || rec?.municipio || null,
      circunscripcion: rec?.circunscripcion || null,
      id_recinto: p.id_recinto || null, colegio: p.colegio || null,
      lider_id: lider.id,
    });
    if (error) notify(error.code === '23505' ? `${p.nombre_completo} ya está registrado como colaborador.` : `Error: ${error.message}`);
    else notify(`✓ ${p.nombre_completo} agregado al equipo de ${lider.nombre}.`);
  };

  const limpiar = () => { setBusqueda(''); setProvinciaFiltro(''); setMunicipioFiltro(''); setResultados([]); setModoBusqueda(null); setExpandido(null); };
  const hayFiltros = !!(provinciaFiltro || municipioFiltro);
  const modoActual = busqueda.trim() ? (esCedula(busqueda) ? 'cedula' : 'nombre') : null;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.titulo}>Consultor de Padrón PRM</Text>
      </View>

      <View style={styles.searchCard}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput} placeholder="Nombre o cédula..."
            placeholderTextColor="#aaa" value={busqueda} onChangeText={setBusqueda}
            onSubmitEditing={() => ejecutarBusqueda(true)} returnKeyType="search" autoCapitalize="words"
          />
          <TouchableOpacity style={[styles.searchBtn, cargando && styles.btnDisabled]} onPress={() => ejecutarBusqueda(true)} disabled={cargando}>
            {cargando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.searchBtnText}>Buscar</Text>}
          </TouchableOpacity>
        </View>
        {modoActual && <Text style={styles.modoHint}>{modoActual === 'cedula' ? '🪪 Por cédula' : '👤 Por nombre'}</Text>}
      </View>

      <TouchableOpacity style={[styles.filtroBtn, hayFiltros && styles.filtroBtnActivo]} onPress={() => setMostrarFiltros(!mostrarFiltros)}>
        <Text style={[styles.filtroTxt, hayFiltros && styles.filtroTxtActivo]}>{hayFiltros ? '● Filtros activos' : '⚙ Filtrar'}</Text>
      </TouchableOpacity>

      {mostrarFiltros && (
        <View style={styles.filtroCard}>
          <TextInput style={styles.filtroInput} placeholder="Provincia" placeholderTextColor="#aaa" value={provinciaFiltro} onChangeText={setProvinciaFiltro} autoCapitalize="characters" />
          <TextInput style={[styles.filtroInput, { marginTop: 6 }]} placeholder="Municipio" placeholderTextColor="#aaa" value={municipioFiltro} onChangeText={setMunicipioFiltro} autoCapitalize="characters" />
          {hayFiltros && <TouchableOpacity onPress={() => { setProvinciaFiltro(''); setMunicipioFiltro(''); }}><Text style={styles.limpiarFiltros}>✕ Limpiar filtros</Text></TouchableOpacity>}
        </View>
      )}

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsCount}>{resultados.length > 0 ? `${resultados.length} resultados` : ''}</Text>
        {resultados.length > 0 && <TouchableOpacity onPress={limpiar}><Text style={styles.limpiarTxt}>Limpiar</Text></TouchableOpacity>}
      </View>

      {resultados.length === 0 && !cargando ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTxt}>Ingresá un nombre o cédula</Text>
        </View>
      ) : (
        <>
          {resultados.map((p, i) => {
            const rec = p.id_recinto ? recintos.get(p.id_recinto) : null;
            const isOpen = expandido === (p.id || i);
            return (
              <TouchableOpacity key={p.id || i} onPress={() => setExpandido(isOpen ? null : (p.id || i))} activeOpacity={0.85}>
                <View style={styles.tarjeta}>
                  <View style={styles.tarjetaHeader}>
                    <Text style={styles.nombre} numberOfLines={1}>{p.nombre_completo}</Text>
                    <View style={[styles.badge, p.id_militante > 0 ? styles.badgeVerde : styles.badgeAzul]}>
                      <Text style={[styles.badgeTxt, p.id_militante > 0 ? styles.badgeTxtVerde : styles.badgeTxtAzul]}>
                        {p.id_militante > 0 ? 'Activo' : 'Militante'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.inlineRow}>
                    <Text style={styles.inlineVal}>{p.cedula || '—'}</Text>
                    {p.celular ? <><Text style={styles.inlineSep}> · </Text><Text style={styles.inlineVal}>{p.celular}</Text></> : null}
                  </View>
                  {(p.provincia || rec) ? (
                    <View style={styles.inlineRow}>
                      <Text style={styles.zonaResumen}>
                        {[p.provincia, rec?.circunscripcion ? `CIR-${rec.circunscripcion}` : null, p.colegio ? `Mesa ${p.colegio.trim()}` : null].filter(Boolean).join('  ·  ')}
                      </Text>
                    </View>
                  ) : null}

                  {isOpen && (
                    <View style={styles.detalle}>
                      <View style={styles.detalleGrid}>
                        {p.municipio ? <View style={styles.detalleItem}><Text style={styles.detalleLabel}>Municipio</Text><Text style={styles.detalleVal}>{p.municipio}</Text></View> : null}
                        {rec?.circunscripcion ? <View style={styles.detalleItem}><Text style={styles.detalleLabel}>Circunscripción</Text><Text style={styles.detalleVal}>{rec.circunscripcion}</Text></View> : null}
                        {rec ? <View style={styles.detalleItem}><Text style={styles.detalleLabel}>Recinto</Text><Text style={styles.detalleVal}>REC-{String(rec.codigo_recinto).padStart(5,'0')}</Text></View> : null}
                        {p.colegio ? <View style={styles.detalleItem}><Text style={styles.detalleLabel}>Mesa</Text><Text style={[styles.detalleVal, styles.colegioVal]}>{p.colegio.trim()}</Text></View> : null}
                        {p.numero_lista != null && p.numero_lista > 0 ? <View style={styles.detalleItem}><Text style={styles.detalleLabel}>N° Lista</Text><Text style={styles.detalleVal}>{p.numero_lista}</Text></View> : null}
                        {p.en_concurrencia ? <View style={styles.detalleItem}><Text style={styles.detalleLabel}>Concurrencia</Text><Text style={[styles.detalleVal, { color: '#1a6e35' }]}>✓ Participó</Text></View> : null}
                      </View>
                      {p.direccion ? (
                        <View style={styles.direccionRow}><Text style={styles.detalleLabel}>Dirección</Text><Text style={styles.detalleVal}>{p.direccion}</Text></View>
                      ) : null}
                      <View style={styles.accionesRow}>
                        <TouchableOpacity style={styles.btnLider} onPress={() => confirmarLider(p)}>
                          <Text style={styles.btnAccionTxt}>★ Líder</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.btnColaborador} onPress={() => iniciarAsignarColaborador(p)}>
                          <Text style={styles.btnAccionTxt}>👥 Colaborador</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                  {!isOpen && <Text style={styles.expandHint}>▾</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
          {resultados.length < MAX_RESULTS && resultados.length === (pagina + 1) * PAGE_SIZE && (
            <TouchableOpacity style={[styles.cargarMasBtn, cargando && styles.btnDisabled]} onPress={() => ejecutarBusqueda(false)} disabled={cargando}>
              {cargando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.searchBtnText}>Cargar más</Text>}
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Modal selección de líder para colaborador */}
      <Modal visible={modalLideres} transparent animationType="slide" onRequestClose={() => setModalLideres(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>Asignar al equipo de...</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {lideres.length === 0 && <Text style={styles.sinLideres}>No hay líderes registrados aún.{'\n'}Primero asigná un líder.</Text>}
              {lideres.filter(l => !l.parent_lider_id).length > 0 && (
                <Text style={styles.modalSeccion}>Líderes</Text>
              )}
              {lideres.filter(l => !l.parent_lider_id).map(l => (
                <TouchableOpacity key={l.id} style={styles.liderOpcion} onPress={() => personaParaAsignar && confirmarColaborador(personaParaAsignar, l)}>
                  <View style={styles.liderOpcionIcon}><Text style={{ color: '#fff', fontSize: 11 }}>★</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liderOpcionNombre}>{l.nombre}</Text>
                    {l.circunscripcion ? <Text style={styles.liderOpcionZona}>CIR-{l.circunscripcion}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
              {lideres.filter(l => !!l.parent_lider_id).length > 0 && (
                <Text style={styles.modalSeccion}>Sub-líderes</Text>
              )}
              {lideres.filter(l => !!l.parent_lider_id).map(l => {
                const padre = lideres.find(x => x.id === l.parent_lider_id);
                return (
                  <TouchableOpacity key={l.id} style={styles.liderOpcionSub} onPress={() => personaParaAsignar && confirmarColaborador(personaParaAsignar, l)}>
                    <View style={styles.liderOpcionIconSub}><Text style={{ color: '#fff', fontSize: 10 }}>★</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.liderOpcionNombreSub}>{l.nombre}</Text>
                      <Text style={styles.liderOpcionZona}>
                        Sub-líder de {padre?.nombre ?? '—'}{l.circunscripcion ? ` · CIR-${l.circunscripcion}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalLideres(false)}>
              <Text style={styles.modalCancelarTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, paddingBottom: 50, backgroundColor: '#f0f2f5' },
  header: { alignItems: 'center', marginBottom: 10, paddingTop: 6 },
  titulo: { fontSize: 17, fontWeight: 'bold', color: '#0a4f6e' },
  searchCard: { backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#222', backgroundColor: '#fafafa' },
  searchBtn: { backgroundColor: '#0a7ea4', paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
  modoHint: { fontSize: 11, color: '#888', marginTop: 4 },
  filtroBtn: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 8, alignItems: 'center', backgroundColor: '#fff' },
  filtroBtnActivo: { borderColor: '#0a7ea4', backgroundColor: '#e8f4f8' },
  filtroTxt: { color: '#888', fontSize: 13 },
  filtroTxtActivo: { color: '#0a7ea4', fontWeight: '600' },
  filtroCard: { backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 8 },
  filtroInput: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: '#222', backgroundColor: '#fafafa' },
  limpiarFiltros: { color: '#e05050', fontSize: 12, marginTop: 6, textAlign: 'center' },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingHorizontal: 2 },
  resultsCount: { fontSize: 13, fontWeight: '600', color: '#555' },
  limpiarTxt: { color: '#0a7ea4', fontSize: 13 },
  emptyState: { alignItems: 'center', paddingVertical: 50 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyTxt: { color: '#999', fontSize: 14 },
  tarjeta: { backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  tarjetaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  nombre: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111', marginRight: 8 },
  badge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeVerde: { backgroundColor: '#e6f4ea' },
  badgeAzul: { backgroundColor: '#dbeeff' },
  badgeTxt: { fontSize: 10, fontWeight: '700' },
  badgeTxtVerde: { color: '#1a6e35' },
  badgeTxtAzul: { color: '#0a4f6e' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap' },
  inlineVal: { fontSize: 12, color: '#555' },
  inlineSep: { fontSize: 11, color: '#ccc', marginHorizontal: 2 },
  zonaResumen: { fontSize: 11, color: '#0a4f6e', marginTop: 1 },
  expandHint: { fontSize: 10, color: '#ccc', textAlign: 'center', marginTop: 3 },
  detalle: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 8 },
  detalleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  detalleItem: { backgroundColor: '#f8f9fa', borderRadius: 6, padding: 6, minWidth: '45%', flex: 1 },
  detalleLabel: { fontSize: 10, color: '#999', fontWeight: '600', textTransform: 'uppercase' },
  detalleVal: { fontSize: 12, color: '#222', fontWeight: '500', marginTop: 1 },
  colegioVal: { fontWeight: '700', color: '#0a7ea4' },
  direccionRow: { backgroundColor: '#f8f9fa', borderRadius: 6, padding: 7, marginBottom: 8 },
  accionesRow: { flexDirection: 'row', gap: 8 },
  btnLider: { flex: 1, backgroundColor: '#0a4f6e', borderRadius: 7, paddingVertical: 9, alignItems: 'center' },
  btnColaborador: { flex: 1, backgroundColor: '#0a7ea4', borderRadius: 7, paddingVertical: 9, alignItems: 'center' },
  btnAccionTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cargarMasBtn: { backgroundColor: '#555', paddingVertical: 11, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: '#0a4f6e', marginBottom: 10 },
  modalSeccion: { fontSize: 10, fontWeight: '800', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 2 },
  liderOpcion: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 10 },
  liderOpcionSub: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 10, paddingLeft: 8, backgroundColor: '#fffbf0' },
  liderOpcionIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#0a4f6e', justifyContent: 'center', alignItems: 'center' },
  liderOpcionIconSub: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#f5a623', justifyContent: 'center', alignItems: 'center' },
  liderOpcionNombre: { fontSize: 14, fontWeight: '600', color: '#111' },
  liderOpcionNombreSub: { fontSize: 13, fontWeight: '600', color: '#0a4f6e' },
  liderOpcionZona: { fontSize: 11, color: '#888', marginTop: 1 },
  sinLideres: { textAlign: 'center', color: '#999', fontSize: 13, paddingVertical: 20, lineHeight: 20 },
  modalCancelar: { marginTop: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8 },
  modalCancelarTxt: { color: '#666', fontSize: 14 },
});
