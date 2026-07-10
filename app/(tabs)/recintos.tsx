import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSesion, esSuperAdmin } from '@/lib/auth-context';
import { dialogAlert } from '@/lib/dialog';

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Provincia = { id: number; nombre: string; total: number; asignados: number };
type Municipio = { id: number; nombre: string; total: number; asignados: number };
type Recinto = {
  id: number;
  nombre: string;
  direccion: string | null;
  sector: string | null;
  asignacion?: AsignacionRecinto | null;
};
type Colegio = {
  id: number;
  codigo: string;
  asignacion?: AsignacionColegio | null;
};
type AsignacionRecinto = {
  id: number;
  direccion_casa_acopio: string | null;
  notas: string | null;
  coordinador?: string | null;
  gerente?: string | null;
  subgerente?: string | null;
  director_delegados?: string | null;
};
type AsignacionColegio = {
  id: number;
  notas: string | null;
  delegado_principal?: string | null;
  delegado_suplente?: string | null;
};
type MiembroOrg = { id: number; nombre: string | null; email: string };

type FiltroAsig = 'todos' | 'asignados' | 'no_asignados';

// ── Helpers ───────────────────────────────────────────────────────────────────
const PLACEHOLDER_NOMBRE = 'Nombre del miembro';

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function RecintosScreen() {
  const { sesion } = useSesion();
  const orgId = sesion?.organizacion_id ?? null;
  const puedeAsignar = esSuperAdmin(sesion?.rol);

  // ── Estado jerárquico ─────────────────────────────────────────────────────
  const [provincias, setProvincias] = useState<Provincia[]>([]);
  const [expandedProv, setExpandedProv] = useState<number | null>(null);
  const [municipiosByProv, setMunicipiosByProv] = useState<Record<number, Municipio[]>>({});
  const [expandedMuni, setExpandedMuni] = useState<number | null>(null);
  const [recintosByMuni, setRecintosByMuni] = useState<Record<number, Recinto[]>>({});

  // ── Búsqueda ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [searchResults, setSearchResults] = useState<Recinto[]>([]);
  const [searching, setSearching] = useState(false);

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [filtro, setFiltro] = useState<FiltroAsig>('todos');
  const [cargandoProv, setCargandoProv] = useState(false);

  // ── Progreso global ───────────────────────────────────────────────────────
  const [totalRecintos, setTotalRecintos] = useState(4286);
  const [asignadosTotal, setAsignadosTotal] = useState(0);

  // ── Modal recinto ─────────────────────────────────────────────────────────
  const [modalRecinto, setModalRecinto] = useState<Recinto | null>(null);
  const [colegios, setColegios] = useState<Colegio[]>([]);
  const [cargandoColegios, setCargandoColegios] = useState(false);
  const [miembros, setMiembros] = useState<MiembroOrg[]>([]);

  // Campos del form de asignación de recinto
  const [formCoord, setFormCoord] = useState('');
  const [formGerente, setFormGerente] = useState('');
  const [formSubgerente, setFormSubgerente] = useState('');
  const [formDirector, setFormDirector] = useState('');
  const [formCasaAcopio, setFormCasaAcopio] = useState('');
  const [formNotas, setFormNotas] = useState('');
  const [guardandoRec, setGuardandoRec] = useState(false);

  // ── Modal colegio ─────────────────────────────────────────────────────────
  const [modalColegio, setModalColegio] = useState<{
    colegio: Colegio;
    asignacionRecintoId: number;
  } | null>(null);
  const [formDelegadoPrincipal, setFormDelegadoPrincipal] = useState('');
  const [formDelegadoSuplente, setFormDelegadoSuplente] = useState('');
  const [formNotasColegio, setFormNotasColegio] = useState('');
  const [guardandoCol, setGuardandoCol] = useState(false);

  // ── Carga inicial ─────────────────────────────────────────────────────────
  const cargarProvincias = useCallback(async () => {
    if (!orgId) return;
    setCargandoProv(true);

    const [{ data: provData }, { count: asigCount }] = await Promise.all([
      supabase.rpc('get_provincias_con_conteo').then(r => r),
      supabase
        .from('asignaciones_recinto')
        .select('id', { count: 'exact', head: true })
        .eq('organizacion_id', orgId),
    ]);

    if (provData) {
      setProvincias(provData as Provincia[]);
    } else {
      // Fallback: carga simple sin conteos
      const { data } = await supabase
        .from('provincias')
        .select('id, nombre')
        .order('nombre');
      if (data) {
        setProvincias(data.map(p => ({ ...p, total: 0, asignados: 0 })));
      }
    }

    setAsignadosTotal(asigCount ?? 0);
    const { count: total } = await supabase
      .from('recintos_jce')
      .select('id', { count: 'exact', head: true });
    if (total) setTotalRecintos(total);

    setCargandoProv(false);
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      cargarProvincias();
      setExpandedProv(null);
      setExpandedMuni(null);
      setMunicipiosByProv({});
      setRecintosByMuni({});
    }, [cargarProvincias])
  );

  // ── Cargar municipios ─────────────────────────────────────────────────────
  const toggleProvincia = async (provId: number) => {
    if (expandedProv === provId) {
      setExpandedProv(null);
      return;
    }
    setExpandedProv(provId);
    setExpandedMuni(null);
    if (municipiosByProv[provId]) return;

    const { data } = await supabase
      .from('municipios')
      .select('id, nombre')
      .eq('provincia_id', provId)
      .order('nombre');
    if (data) {
      setMunicipiosByProv(prev => ({
        ...prev,
        [provId]: data.map(m => ({ ...m, total: 0, asignados: 0 })),
      }));
    }
  };

  // ── Cargar recintos ───────────────────────────────────────────────────────
  const toggleMunicipio = async (muniId: number) => {
    if (expandedMuni === muniId) {
      setExpandedMuni(null);
      return;
    }
    setExpandedMuni(muniId);
    if (recintosByMuni[muniId]) return;
    await cargarRecintosMunicipio(muniId);
  };

  const cargarRecintosMunicipio = async (muniId: number) => {
    if (!orgId) return;
    const [{ data: recData }, { data: asigData }] = await Promise.all([
      supabase
        .from('recintos_jce')
        .select('id, nombre, direccion, sector')
        .eq('municipio_id', muniId)
        .order('nombre'),
      supabase
        .from('asignaciones_recinto')
        .select('id, recinto_jce_id, direccion_casa_acopio, notas')
        .eq('organizacion_id', orgId),
    ]);

    if (recData) {
      const asigMap = new Map(
        (asigData ?? []).map(a => [a.recinto_jce_id, a as AsignacionRecinto])
      );
      setRecintosByMuni(prev => ({
        ...prev,
        [muniId]: recData.map(r => ({ ...r, asignacion: asigMap.get(r.id) ?? null })),
      }));
    }
  };

  // ── Búsqueda ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!debouncedSearch.trim() || !orgId) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const run = async () => {
      const [{ data: recData }, { data: asigData }] = await Promise.all([
        supabase
          .from('recintos_jce')
          .select('id, nombre, direccion, sector')
          .ilike('nombre', `%${debouncedSearch}%`)
          .limit(30),
        supabase
          .from('asignaciones_recinto')
          .select('id, recinto_jce_id, direccion_casa_acopio, notas')
          .eq('organizacion_id', orgId),
      ]);
      const asigMap = new Map(
        (asigData ?? []).map(a => [a.recinto_jce_id, a as AsignacionRecinto])
      );
      setSearchResults(
        (recData ?? []).map(r => ({ ...r, asignacion: asigMap.get(r.id) ?? null }))
      );
      setSearching(false);
    };
    run();
  }, [debouncedSearch, orgId]);

  // ── Abrir modal recinto ───────────────────────────────────────────────────
  const abrirRecinto = async (recinto: Recinto) => {
    setModalRecinto(recinto);
    setCargandoColegios(true);
    setColegios([]);

    // Precargar miembros de la org si no los tenemos
    if (miembros.length === 0 && orgId) {
      const { data } = await supabase
        .from('usuarios_organizacion')
        .select('usuarios_app(id, nombre, email)')
        .eq('organizacion_id', orgId);
      if (data) {
        setMiembros(
          data.flatMap(row => {
            const u = (row as any).usuarios_app;
            return u ? [{ id: u.id, nombre: u.nombre, email: u.email }] : [];
          })
        );
      }
    }

    // Cargar colegios del recinto + asignaciones
    const [{ data: colData }, { data: asigColData }] = await Promise.all([
      supabase
        .from('colegios_jce')
        .select('id, codigo')
        .eq('recinto_id', recinto.id)
        .order('codigo'),
      orgId
        ? supabase
            .from('asignaciones_colegio')
            .select('id, colegio_jce_id, notas')
            .eq('organizacion_id', orgId)
        : Promise.resolve({ data: [] }),
    ]);

    const asigColMap = new Map(
      ((asigColData as any[]) ?? []).map(a => [a.colegio_jce_id, a as AsignacionColegio])
    );
    setColegios(
      (colData ?? []).map(c => ({ ...c, asignacion: asigColMap.get(c.id) ?? null }))
    );
    setCargandoColegios(false);

    // Pre-rellenar form con asignación existente
    const a = recinto.asignacion;
    setFormCoord(a?.coordinador ?? '');
    setFormGerente(a?.gerente ?? '');
    setFormSubgerente(a?.subgerente ?? '');
    setFormDirector(a?.director_delegados ?? '');
    setFormCasaAcopio(a?.direccion_casa_acopio ?? '');
    setFormNotas(a?.notas ?? '');
  };

  // ── Guardar asignación de recinto ─────────────────────────────────────────
  const guardarAsignacionRecinto = async () => {
    if (!orgId || !modalRecinto) return;
    setGuardandoRec(true);

    const payload = {
      organizacion_id:       orgId,
      recinto_jce_id:        modalRecinto.id,
      direccion_casa_acopio: formCasaAcopio.trim() || null,
      notas:                 formNotas.trim() || null,
    };

    const { error } = modalRecinto.asignacion
      ? await supabase
          .from('asignaciones_recinto')
          .update(payload)
          .eq('id', modalRecinto.asignacion.id)
      : await supabase.from('asignaciones_recinto').insert(payload);

    setGuardandoRec(false);

    if (error) {
      await dialogAlert(`Error: ${error.message}`);
      return;
    }

    await dialogAlert('✓ Asignación guardada.');
    setModalRecinto(null);
    // Refrescar datos del municipio correspondiente
    if (expandedMuni) await cargarRecintosMunicipio(expandedMuni);
    cargarProvincias();
  };

  // ── Modal colegio: abrir ──────────────────────────────────────────────────
  const abrirModalColegio = (col: Colegio, asignacionRecintoId: number) => {
    if (!modalRecinto?.asignacion && !modalRecinto?.asignacion) {
      dialogAlert('Primero asigna el recinto a tu organización.');
      return;
    }
    setModalColegio({ colegio: col, asignacionRecintoId });
    setFormDelegadoPrincipal(col.asignacion?.delegado_principal ?? '');
    setFormDelegadoSuplente(col.asignacion?.delegado_suplente ?? '');
    setFormNotasColegio(col.asignacion?.notas ?? '');
  };

  // ── Guardar asignación de colegio ─────────────────────────────────────────
  const guardarAsignacionColegio = async () => {
    if (!orgId || !modalColegio) return;
    setGuardandoCol(true);

    const payload = {
      organizacion_id:       orgId,
      asignacion_recinto_id: modalColegio.asignacionRecintoId,
      colegio_jce_id:        modalColegio.colegio.id,
      notas:                 formNotasColegio.trim() || null,
    };

    const { error } = modalColegio.colegio.asignacion
      ? await supabase
          .from('asignaciones_colegio')
          .update(payload)
          .eq('id', modalColegio.colegio.asignacion.id)
      : await supabase.from('asignaciones_colegio').insert(payload);

    setGuardandoCol(false);
    if (error) {
      await dialogAlert(`Error: ${error.message}`);
      return;
    }

    await dialogAlert('✓ Colegio asignado.');
    setModalColegio(null);
    // Refrescar colegios en modal
    if (modalRecinto) {
      const { data } = await supabase
        .from('asignaciones_colegio')
        .select('id, colegio_jce_id, notas')
        .eq('organizacion_id', orgId);
      const map = new Map((data ?? []).map(a => [a.colegio_jce_id, a as AsignacionColegio]));
      setColegios(prev => prev.map(c => ({ ...c, asignacion: map.get(c.id) ?? null })));
    }
  };

  // ── Filtrar recintos ──────────────────────────────────────────────────────
  const filtrarRecintos = (list: Recinto[]) => {
    if (filtro === 'asignados')    return list.filter(r => !!r.asignacion);
    if (filtro === 'no_asignados') return list.filter(r => !r.asignacion);
    return list;
  };

  const pct = totalRecintos > 0 ? Math.round((asignadosTotal / totalRecintos) * 100) : 0;
  const showSearch = search.trim().length > 0;
  const listaActiva: Recinto[] = showSearch ? searchResults : [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Recintos electorales</Text>
        <Text style={s.headerSub}>Catálogo JCE · Elecciones 2024</Text>
      </View>

      {/* Buscador */}
      <View style={s.searchRow}>
        <TextInput
          style={s.searchInput}
          placeholder="Buscar recinto por nombre..."
          placeholderTextColor="#bbb"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Progreso global */}
      <View style={s.progressBar}>
        <View style={s.progressInner}>
          <View style={[s.progressFill, { width: `${pct}%` as any }]} />
        </View>
        <Text style={s.progressTxt}>
          {asignadosTotal} / {totalRecintos} recintos cubiertos ({pct}%)
        </Text>
      </View>

      {/* Chips de filtro */}
      {!showSearch && (
        <View style={s.chipsRow}>
          {(['todos', 'asignados', 'no_asignados'] as FiltroAsig[]).map(f => (
            <TouchableOpacity
              key={f}
              style={[s.chip, filtro === f && s.chipActivo]}
              onPress={() => setFiltro(f)}>
              <Text style={[s.chipTxt, filtro === f && s.chipTxtActivo]}>
                {f === 'todos' ? 'Todos' : f === 'asignados' ? '✓ Asignados' : 'Sin asignar'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Contenido */}
      {showSearch ? (
        <ScrollView contentContainerStyle={s.listContent}>
          {searching && <ActivityIndicator color="#0a4f6e" style={{ margin: 20 }} />}
          {!searching && searchResults.length === 0 && (
            <Text style={s.emptyTxt}>Sin resultados para "{search}"</Text>
          )}
          {searchResults.map(r => (
            <RecintoRow key={r.id} recinto={r} onPress={() => abrirRecinto(r)} />
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={s.listContent}>
          {cargandoProv && <ActivityIndicator color="#0a4f6e" style={{ margin: 20 }} />}
          {provincias.map(prov => (
            <View key={prov.id} style={s.provCard}>
              <TouchableOpacity style={s.provRow} onPress={() => toggleProvincia(prov.id)}>
                <Text style={s.provNombre}>{prov.nombre}</Text>
                <Text style={s.chevron}>{expandedProv === prov.id ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {expandedProv === prov.id && (
                <View style={s.muniContainer}>
                  {(municipiosByProv[prov.id] ?? []).length === 0 && (
                    <ActivityIndicator color="#0a4f6e" style={{ margin: 10 }} />
                  )}
                  {(municipiosByProv[prov.id] ?? []).map(muni => (
                    <View key={muni.id}>
                      <TouchableOpacity
                        style={s.muniRow}
                        onPress={() => toggleMunicipio(muni.id)}>
                        <Text style={s.muniNombre}>{muni.nombre}</Text>
                        <Text style={s.chevronSm}>
                          {expandedMuni === muni.id ? '▲' : '▼'}
                        </Text>
                      </TouchableOpacity>

                      {expandedMuni === muni.id && (
                        <View style={s.recintosContainer}>
                          {!recintosByMuni[muni.id] && (
                            <ActivityIndicator color="#0a4f6e" style={{ margin: 8 }} />
                          )}
                          {filtrarRecintos(recintosByMuni[muni.id] ?? []).map(r => (
                            <RecintoRow
                              key={r.id}
                              recinto={r}
                              onPress={() => abrirRecinto(r)}
                            />
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Modal: detalle + asignación de recinto ── */}
      <Modal
        visible={!!modalRecinto}
        transparent
        animationType="slide"
        onRequestClose={() => setModalRecinto(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitulo} numberOfLines={2}>
                  {modalRecinto?.nombre}
                </Text>
                {modalRecinto?.direccion ? (
                  <Text style={s.sheetSub}>{modalRecinto.direccion}</Text>
                ) : null}
                {modalRecinto?.sector ? (
                  <Text style={s.sheetSub}>Sector: {modalRecinto.sector}</Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setModalRecinto(null)} style={s.btnClose}>
                <Text style={s.btnCloseTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled">
              {/* Badge asignado */}
              {modalRecinto?.asignacion ? (
                <View style={s.asigBadge}>
                  <Text style={s.asigBadgeTxt}>✓ Asignado a tu organización</Text>
                </View>
              ) : (
                <View style={s.noAsigBadge}>
                  <Text style={s.noAsigBadgeTxt}>Sin asignar</Text>
                </View>
              )}

              {/* Colegios del recinto */}
              <Text style={s.secTitulo}>
                Colegios ({colegios.length})
              </Text>
              {cargandoColegios && <ActivityIndicator color="#0a4f6e" />}
              {colegios.map(col => (
                <TouchableOpacity
                  key={col.id}
                  style={[s.colegioRow, col.asignacion && s.colegioAsignado]}
                  onPress={() =>
                    puedeAsignar && modalRecinto?.asignacion
                      ? abrirModalColegio(col, modalRecinto.asignacion!.id)
                      : null
                  }>
                  <Text style={s.colegioCode}>Mesa {col.codigo}</Text>
                  {col.asignacion ? (
                    <Text style={s.delegadoTxt}>
                      ✓ {col.asignacion.delegado_principal ?? 'Asignado'}
                    </Text>
                  ) : (
                    puedeAsignar && modalRecinto?.asignacion && (
                      <Text style={s.asignarTxt}>+ Asignar delegado</Text>
                    )
                  )}
                </TouchableOpacity>
              ))}

              {/* Formulario de asignación del recinto */}
              {puedeAsignar && (
                <>
                  <Text style={[s.secTitulo, { marginTop: 16 }]}>
                    {modalRecinto?.asignacion ? 'Editar asignación' : 'Asignar a mi organización'}
                  </Text>

                  <Text style={s.fieldLabel}>Casa de acopio (dirección)</Text>
                  <TextInput
                    style={s.input}
                    value={formCasaAcopio}
                    onChangeText={setFormCasaAcopio}
                    placeholder="Dirección de la casa de acopio..."
                    placeholderTextColor="#bbb"
                    autoCapitalize="sentences"
                  />

                  <Text style={s.fieldLabel}>Notas</Text>
                  <TextInput
                    style={[s.input, { height: 64, textAlignVertical: 'top' }]}
                    value={formNotas}
                    onChangeText={setFormNotas}
                    placeholder="Observaciones..."
                    placeholderTextColor="#bbb"
                    multiline
                  />

                  <TouchableOpacity
                    style={s.btnGuardar}
                    onPress={guardarAsignacionRecinto}
                    disabled={guardandoRec}>
                    <Text style={s.btnGuardarTxt}>
                      {guardandoRec
                        ? 'Guardando...'
                        : modalRecinto?.asignacion
                        ? '💾 Actualizar asignación'
                        : '+ Asignar este recinto'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Modal: delegados de colegio ── */}
      <Modal
        visible={!!modalColegio}
        transparent
        animationType="slide"
        onRequestClose={() => setModalColegio(null)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { maxHeight: '55%' }]}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitulo}>
                Mesa {modalColegio?.colegio.codigo}
              </Text>
              <TouchableOpacity onPress={() => setModalColegio(null)} style={s.btnClose}>
                <Text style={s.btnCloseTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLabel}>Delegado principal</Text>
              <TextInput
                style={s.input}
                value={formDelegadoPrincipal}
                onChangeText={setFormDelegadoPrincipal}
                placeholder="Nombre del delegado principal"
                placeholderTextColor="#bbb"
                autoCapitalize="words"
              />
              <Text style={s.fieldLabel}>Delegado suplente</Text>
              <TextInput
                style={s.input}
                value={formDelegadoSuplente}
                onChangeText={setFormDelegadoSuplente}
                placeholder="Nombre del delegado suplente"
                placeholderTextColor="#bbb"
                autoCapitalize="words"
              />
              <Text style={s.fieldLabel}>Notas</Text>
              <TextInput
                style={s.input}
                value={formNotasColegio}
                onChangeText={setFormNotasColegio}
                placeholder="Observaciones..."
                placeholderTextColor="#bbb"
              />
              <TouchableOpacity
                style={s.btnGuardar}
                onPress={guardarAsignacionColegio}
                disabled={guardandoCol}>
                <Text style={s.btnGuardarTxt}>
                  {guardandoCol ? 'Guardando...' : '✓ Guardar delegados'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnCancelar}
                onPress={() => setModalColegio(null)}>
                <Text style={s.btnCancelarTxt}>Cancelar</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Sub-componente: fila de recinto ───────────────────────────────────────────
function RecintoRow({
  recinto,
  onPress,
}: {
  recinto: Recinto;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.recintoRow} onPress={onPress}>
      <View style={s.recintoInfo}>
        <Text style={s.recintoNombre} numberOfLines={1}>
          {recinto.nombre}
        </Text>
        {recinto.direccion ? (
          <Text style={s.recintoDireccion} numberOfLines={1}>
            {recinto.direccion}
          </Text>
        ) : null}
      </View>
      {recinto.asignacion ? (
        <View style={s.asigDot} />
      ) : (
        <View style={s.noAsigDot} />
      )}
    </TouchableOpacity>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: '#f0f2f5' },
  header:       { backgroundColor: '#0a4f6e', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  headerTitle:  { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerSub:    { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 },
  searchRow:    { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  searchInput:  { backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#222' },
  progressBar:  { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  progressInner:{ height: 6, backgroundColor: '#e0e0e0', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', backgroundColor: '#0a7ea4', borderRadius: 3 },
  progressTxt:  { fontSize: 11, color: '#666' },
  chipsRow:     { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  chip:         { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  chipActivo:   { backgroundColor: '#0a4f6e', borderColor: '#0a4f6e' },
  chipTxt:      { fontSize: 12, color: '#666' },
  chipTxtActivo:{ color: '#fff', fontWeight: '700' },
  listContent:  { padding: 8, paddingBottom: 100 },
  emptyTxt:     { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 14 },
  // Acordeón
  provCard:     { backgroundColor: '#fff', borderRadius: 10, marginBottom: 6, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2 },
  provRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  provNombre:   { flex: 1, fontSize: 14, fontWeight: '700', color: '#0a4f6e' },
  chevron:      { color: '#aaa', fontSize: 12 },
  muniContainer:{ borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingLeft: 12 },
  muniRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  muniNombre:   { flex: 1, fontSize: 13, color: '#333', fontWeight: '600' },
  chevronSm:    { color: '#ccc', fontSize: 11 },
  recintosContainer:{ paddingLeft: 8 },
  recintoRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f8f8f8' },
  recintoInfo:  { flex: 1 },
  recintoNombre:{ fontSize: 13, color: '#222', fontWeight: '600' },
  recintoDireccion: { fontSize: 11, color: '#999', marginTop: 1 },
  asigDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1a6e35' },
  noAsigDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ddd' },
  // Modal
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85%' },
  sheetHeader:  { flexDirection: 'row', alignItems: 'flex-start', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  sheetTitulo:  { fontSize: 15, fontWeight: '800', color: '#0a4f6e', flex: 1 },
  sheetSub:     { fontSize: 11, color: '#999', marginTop: 2 },
  sheetScroll:  { padding: 16 },
  btnClose:     { padding: 4 },
  btnCloseTxt:  { fontSize: 16, color: '#aaa' },
  asigBadge:    { backgroundColor: '#e6f4ea', borderRadius: 8, padding: 8, marginBottom: 12, alignSelf: 'flex-start' },
  asigBadgeTxt: { color: '#1a6e35', fontSize: 12, fontWeight: '700' },
  noAsigBadge:  { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 8, marginBottom: 12, alignSelf: 'flex-start' },
  noAsigBadgeTxt:{ color: '#999', fontSize: 12 },
  secTitulo:    { fontSize: 11, fontWeight: '800', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  colegioRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  colegioAsignado:{ backgroundColor: '#f8fff8' },
  colegioCode:  { fontSize: 13, color: '#222', fontWeight: '600', flex: 1 },
  delegadoTxt:  { fontSize: 11, color: '#1a6e35', fontWeight: '600' },
  asignarTxt:   { fontSize: 11, color: '#0a7ea4' },
  fieldLabel:   { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, marginBottom: 4 },
  input:        { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: '#222', backgroundColor: '#fafafa' },
  btnGuardar:   { backgroundColor: '#0a4f6e', borderRadius: 9, paddingVertical: 13, alignItems: 'center', marginTop: 16, marginBottom: 8 },
  btnGuardarTxt:{ color: '#fff', fontSize: 14, fontWeight: '800' },
  btnCancelar:  { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 9, paddingVertical: 11, alignItems: 'center' },
  btnCancelarTxt:{ color: '#666', fontSize: 13 },
});
