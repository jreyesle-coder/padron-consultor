import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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

  // Modal: elegir líder para colaborador
  const [modalLideres, setModalLideres] = useState(false);
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [personaParaAsignar, setPersonaParaAsignar] = useState<Persona | null>(null);

  // Modal: registro manual (persona no encontrada en padrón)
  const [modalRegistroManual, setModalRegistroManual] = useState(false);
  const [regNombre, setRegNombre] = useState('');
  const [regCelular, setRegCelular] = useState('');
  const [regMunicipio, setRegMunicipio] = useState('');
  const [regCirc, setRegCirc] = useState('');
  const [regLideres, setRegLideres] = useState<Lider[]>([]);

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
    let celularFinal = p.celular;
    if (!celularFinal) {
      const tel = window.prompt(`⚠️ ${p.nombre_completo} no tiene teléfono registrado.\nIngresá su número (recomendado para el equipo):`);
      if (tel && tel.trim()) celularFinal = tel.trim();
    }
    if (!confirm(`★ ¿Asignar a ${p.nombre_completo} como líder de campo?`)) return;
    const rec = p.id_recinto ? recintos.get(p.id_recinto) : null;
    const { error } = await supabase.from('lideres_campo').insert({
      cedula: normalizarCedula(p.cedula), nombre: p.nombre_completo,
      celular: celularFinal || null, provincia: p.provincia || rec?.provincia || null,
      municipio: p.municipio || rec?.municipio || null,
      circunscripcion: rec?.circunscripcion || null,
      id_recinto: p.id_recinto || null, colegio: p.colegio || null,
    });
    if (error) notify(error.code === '23505' ? `${p.nombre_completo} ya está registrado como líder.` : `Error: ${error.message}`);
    else notify(`✓ ${p.nombre_completo} asignado como líder de campo.`);
  };

  const iniciarAsignarColaborador = async (p: Persona) => {
    let celularFinal = p.celular;
    if (!celularFinal) {
      const tel = window.prompt(`⚠️ ${p.nombre_completo} no tiene teléfono registrado.\nIngresá su número (recomendado para el equipo):`);
      if (tel && tel.trim()) celularFinal = tel.trim();
    }
    const personaConTel = celularFinal !== p.celular ? { ...p, celular: celularFinal } : p;
    setPersonaParaAsignar(personaConTel);
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

  const abrirRegistroManual = async () => {
    setRegNombre('');
    setRegCelular('');
    setRegMunicipio('');
    setRegCirc('');
    const { data } = await supabase
      .from('lideres_campo')
      .select('id, nombre, circunscripcion, parent_lider_id')
      .order('parent_lider_id', { nullsFirst: true })
      .order('nombre');
    setRegLideres(data || []);
    setModalRegistroManual(true);
  };

  const guardarRegistroManual = async (lider: Lider) => {
    if (!regNombre.trim()) { notify('El nombre completo es obligatorio.'); return; }
    if (!regCelular.trim()) { notify('El teléfono es obligatorio para el equipo.'); return; }
    const cedula = normalizarCedula(busqueda);
    const { error } = await supabase.from('colaboradores_campo').insert({
      cedula,
      nombre: regNombre.trim().toUpperCase(),
      celular: regCelular.trim(),
      municipio: regMunicipio.trim() || null,
      circunscripcion: regCirc.trim() ? parseInt(regCirc) : null,
      lider_id: lider.id,
      pendiente_padron: true,
    });
    if (error) {
      notify(error.code === '23505' ? 'Esta cédula ya está registrada en el sistema.' : `Error: ${error.message}`);
      return;
    }
    setModalRegistroManual(false);
    notify(`✓ ${regNombre.trim()} agregado al equipo de ${lider.nombre}.\n\n⚠️ Recordá inscribirlo en el padrón PRM:\nverificate.prm.do`);
  };

  const limpiar = () => { setBusqueda(''); setProvinciaFiltro(''); setMunicipioFiltro(''); setResultados([]); setModoBusqueda(null); setExpandido(null); };
  const hayFiltros = !!(provinciaFiltro || municipioFiltro);
  const modoActual = busqueda.trim() ? (esCedula(busqueda) ? 'cedula' : 'nombre') : null;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/logo-prm.png')}
          style={styles.logoPRM}
          resizeMode="contain"
        />
        <Text style={styles.proyectoTitulo}>Proyecto Presidencial</Text>
        <Text style={styles.proyectoNombre}>David Collado</Text>
        <View style={styles.equipoRow}>
          <View style={styles.divider} />
          <Text style={styles.equipoTxt}>Equipo de Trabajo · Victor Ogando</Text>
          <View style={styles.divider} />
        </View>
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
        modoBusqueda === null ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTxt}>Ingresá un nombre o cédula</Text>
          </View>
        ) : (
          <View>
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTxt}>No encontrado en el padrón</Text>
            </View>
            {modoBusqueda === 'cedula' && (
              <View style={styles.noEncontradoCard}>
                <Text style={styles.noEncontradoTitulo}>⚠️ Cédula no encontrada en el padrón PRM</Text>
                <Text style={styles.noEncontradoDesc}>
                  Esta persona puede no estar inscrita en el PRM. Podés agregarla a tu equipo igualmente y luego registrarla en el partido.
                </Text>
                <View style={styles.noEncontradoBtns}>
                  <TouchableOpacity style={styles.btnRegistrar} onPress={abrirRegistroManual}>
                    <Text style={styles.btnRegistrarTxt}>📝 Agregar al equipo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnPRM}
                    onPress={() => window.open('https://verificate.prm.do/', '_blank')}>
                    <Text style={styles.btnPRMTxt}>🔗 Inscribir en PRM</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )
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
                    {p.celular
                      ? <><Text style={styles.inlineSep}> · </Text><Text style={styles.inlineVal}>{p.celular}</Text></>
                      : <Text style={styles.sinTelTxt}> · ⚠️ Sin teléfono</Text>
                    }
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

      {/* Modal: selección de líder para colaborador existente */}
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

      {/* Modal: registro manual de persona no encontrada en padrón */}
      <Modal visible={modalRegistroManual} transparent animationType="slide" onRequestClose={() => setModalRegistroManual(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalBoxScroll} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.modalTitulo}>📝 Registrar en el equipo</Text>
            <View style={styles.pendienteAviso}>
              <Text style={styles.pendienteAvisoTxt}>
                ⚠️ Esta persona no está en el padrón PRM. Será marcada como pendiente de inscripción al partido.
              </Text>
            </View>

            <Text style={styles.regLabel}>Cédula</Text>
            <View style={styles.regInputReadonly}>
              <Text style={styles.regInputReadonlyTxt}>{formatearCedula(busqueda)}</Text>
            </View>

            <Text style={styles.regLabel}>Nombre completo <Text style={styles.regReq}>*</Text></Text>
            <TextInput
              style={styles.regInput}
              placeholder="Ej: JUAN PÉREZ GARCÍA"
              placeholderTextColor="#bbb"
              value={regNombre}
              onChangeText={setRegNombre}
              autoCapitalize="characters"
            />

            <Text style={styles.regLabel}>Teléfono <Text style={styles.regReq}>* obligatorio</Text></Text>
            <TextInput
              style={styles.regInput}
              placeholder="Ej: 809-555-0000"
              placeholderTextColor="#bbb"
              value={regCelular}
              onChangeText={setRegCelular}
              keyboardType="phone-pad"
            />

            <Text style={styles.regLabel}>Municipio</Text>
            <TextInput
              style={styles.regInput}
              placeholder="Ej: DISTRITO NACIONAL"
              placeholderTextColor="#bbb"
              value={regMunicipio}
              onChangeText={setRegMunicipio}
              autoCapitalize="characters"
            />

            <Text style={styles.regLabel}>Circunscripción</Text>
            <TextInput
              style={styles.regInput}
              placeholder="Ej: 1"
              placeholderTextColor="#bbb"
              value={regCirc}
              onChangeText={setRegCirc}
              keyboardType="number-pad"
            />

            <Text style={[styles.modalSeccion, { marginTop: 16, marginBottom: 6 }]}>Asignar al equipo de:</Text>
            {regLideres.length === 0 && (
              <Text style={styles.sinLideres}>No hay líderes registrados aún.</Text>
            )}
            {regLideres.filter(l => !l.parent_lider_id).map(l => (
              <TouchableOpacity key={l.id} style={styles.liderOpcion} onPress={() => guardarRegistroManual(l)}>
                <View style={styles.liderOpcionIcon}><Text style={{ color: '#fff', fontSize: 11 }}>★</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.liderOpcionNombre}>{l.nombre}</Text>
                  {l.circunscripcion ? <Text style={styles.liderOpcionZona}>CIR-{l.circunscripcion}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
            {regLideres.filter(l => !!l.parent_lider_id).length > 0 && (
              <Text style={styles.modalSeccion}>Sub-líderes</Text>
            )}
            {regLideres.filter(l => !!l.parent_lider_id).map(l => {
              const padre = regLideres.find(x => x.id === l.parent_lider_id);
              return (
                <TouchableOpacity key={l.id} style={styles.liderOpcionSub} onPress={() => guardarRegistroManual(l)}>
                  <View style={styles.liderOpcionIconSub}><Text style={{ color: '#fff', fontSize: 10 }}>★</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liderOpcionNombreSub}>{l.nombre}</Text>
                    <Text style={styles.liderOpcionZona}>Sub-líder de {padre?.nombre ?? '—'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.btnPRMGrande}
              onPress={() => window.open('https://verificate.prm.do/', '_blank')}>
              <Text style={styles.btnPRMGrandeTxt}>🔗 Inscribir en el padrón PRM → verificate.prm.do</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalRegistroManual(false)}>
              <Text style={styles.modalCancelarTxt}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, paddingBottom: 50, backgroundColor: '#f0f2f5' },
  header: { alignItems: 'center', marginBottom: 10, paddingTop: 10, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#fff', borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  logoPRM: { width: 160, height: 160, marginTop: 8, marginBottom: 10 },
  proyectoTitulo: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  proyectoNombre: { fontSize: 22, fontWeight: '900', color: '#0a4f6e', marginTop: 1, letterSpacing: 0.3 },
  equipoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  divider: { flex: 1, height: 1, backgroundColor: '#e0e0e0' },
  equipoTxt: { fontSize: 13, color: '#0a4f6e', fontWeight: '700' },
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
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyTxt: { color: '#999', fontSize: 14 },
  // Panel "no encontrado"
  noEncontradoCard: { backgroundColor: '#fff8e6', borderRadius: 12, padding: 14, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#f5a623' },
  noEncontradoTitulo: { fontSize: 14, fontWeight: '700', color: '#7a4f00', marginBottom: 6 },
  noEncontradoDesc: { fontSize: 12, color: '#9a6500', lineHeight: 18, marginBottom: 12 },
  noEncontradoBtns: { flexDirection: 'row', gap: 8 },
  btnRegistrar: { flex: 1, backgroundColor: '#0a4f6e', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  btnRegistrarTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnPRM: { flex: 1, borderWidth: 1.5, borderColor: '#0a4f6e', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  btnPRMTxt: { color: '#0a4f6e', fontSize: 13, fontWeight: '700' },
  // Tarjeta de resultado
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
  sinTelTxt: { fontSize: 11, color: '#e08000', fontWeight: '600' },
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
  // Modal base
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 },
  modalBoxScroll: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '90%' },
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
  // Registro manual
  pendienteAviso: { backgroundColor: '#fff8e6', borderRadius: 8, padding: 10, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#f5a623' },
  pendienteAvisoTxt: { fontSize: 12, color: '#7a4f00', lineHeight: 17 },
  regLabel: { fontSize: 11, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, marginTop: 10 },
  regReq: { color: '#e05050', fontWeight: '700', textTransform: 'none' },
  regInput: { borderWidth: 1, borderColor: '#d0d0d0', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9, fontSize: 14, color: '#222', backgroundColor: '#fafafa' },
  regInputReadonly: { borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: '#f5f5f5' },
  regInputReadonlyTxt: { fontSize: 14, color: '#888', fontWeight: '600' },
  btnPRMGrande: { marginTop: 16, borderWidth: 1.5, borderColor: '#0a4f6e', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnPRMGrandeTxt: { color: '#0a4f6e', fontSize: 13, fontWeight: '700' },
});
