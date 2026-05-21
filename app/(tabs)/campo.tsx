import { useCallback, useState } from 'react';
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
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSesion, puedeEditar } from '@/lib/auth-context';

const confirm = (msg: string) => window.confirm(msg);
const notify = (msg: string) => window.alert(msg);
const normCed = (c: string) => c.replace(/\D/g, '').padStart(11, '0');

// Auditoría: fire-and-forget
const auditar = (descripcion: string, registro_id: number | null = null) => {
  supabase.from('auditoria').insert({ accion: 'app', tabla: 'campo', registro_id, descripcion }).then(() => {});
};

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
  meta_votos?: number;
};

type Colaborador = {
  id: number;
  cedula: string;
  nombre: string;
  celular: string | null;
  colegio: string | null;
  municipio: string | null;
  lider_id: number | null;
  pendiente_padron?: boolean;
  padron_confirmado?: boolean;
  ultimo_contacto?: string | null;
  notas?: string | null;
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
  const { sesion, cerrarSesion } = useSesion();
  const editar = puedeEditar(sesion?.rol);
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [liderByCedula, setLiderByCedula] = useState<Map<string, Lider>>(new Map());
  const [colaboradores, setColaboradores] = useState<{ [id: number]: Colaborador[] }>({});
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [filtroCirc, setFiltroCirc] = useState<number | 'todos'>('todos');
  const [modalRed, setModalRed] = useState<{ lider: Lider; items: RedItem[]; cargando: boolean } | null>(null);
  const [modalCompartir, setModalCompartir] = useState<{ lider: Lider; texto: string } | null>(null);
  const [modalDetColab, setModalDetColab] = useState<{ colab: Colaborador; liderId: number } | null>(null);
  const [editNotas, setEditNotas] = useState('');
  const [guardandoColab, setGuardandoColab] = useState(false);

  const cargarLideres = useCallback(async () => {
    setCargando(true);
    let q = supabase.from('lideres_campo').select('*').order('circunscripcion').order('nombre');
    // Si es líder (no admin), solo ve sus propios datos
    if (sesion?.rol === 'lider' && sesion?.lider_id) {
      q = supabase.from('lideres_campo').select('*').eq('id', sesion.lider_id);
    }
    const { data } = await q;
    setCargando(false);
    if (data) {
      setLideres(data);
      const map = new Map<string, Lider>();
      data.forEach(l => map.set(normCed(l.cedula), l));
      setLiderByCedula(map);
    }
  }, [sesion]);

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
    auditar(`Líder eliminado: ${l.nombre}`, l.id);
    setAbierto(null);
    setColaboradores(prev => { const next = { ...prev }; delete next[l.id]; return next; });
    cargarLideres();
  };

  const eliminarColaborador = async (liderId: number, c: Colaborador) => {
    if (!confirm(`¿Quitar a ${c.nombre} del equipo?`)) return;
    const { error } = await supabase.from('colaboradores_campo').delete().eq('id', c.id);
    if (error) { notify(`Error: ${error.message}`); return; }
    auditar(`Colaborador eliminado: ${c.nombre}`, c.id);
    cargarColaboradores(liderId);
  };

  const promoverALider = async (c: Colaborador, parentLider: Lider) => {
    if (!confirm(`★ ¿Vincular a ${c.nombre} como sub-líder bajo ${parentLider.nombre}?\n\nPodrá tener su propio equipo y seguirá apareciendo como colaborador.`)) return;

    const liderExistente = liderByCedula.get(normCed(c.cedula));
    if (liderExistente) {
      const { error } = await supabase.from('lideres_campo')
        .update({ parent_lider_id: parentLider.id })
        .eq('id', liderExistente.id);
      if (error) { notify(`Error: ${error.message}`); return; }
    } else {
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
    auditar(`Sub-líder vinculado: ${c.nombre} bajo ${parentLider.nombre}`, c.id);
    notify(`✓ ${c.nombre} vinculado como sub-líder de ${parentLider.nombre}.`);
    cargarLideres();
    cargarColaboradores(parentLider.id);
  };

  const editarMeta = async (l: Lider) => {
    const actual = l.meta_votos?.toString() || '0';
    const nueva = window.prompt(`Meta de personas movilizadas para ${l.nombre}:`, actual);
    if (nueva === null) return;
    const meta = parseInt(nueva) || 0;
    await supabase.from('lideres_campo').update({ meta_votos: meta }).eq('id', l.id);
    cargarLideres();
  };

  const abrirDetColab = (c: Colaborador, liderId: number) => {
    setModalDetColab({ colab: c, liderId });
    setEditNotas(c.notas || '');
  };

  const guardarContactoHoy = async () => {
    if (!modalDetColab) return;
    setGuardandoColab(true);
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: updated } = await supabase
      .from('colaboradores_campo')
      .update({ ultimo_contacto: hoy, notas: editNotas || null })
      .eq('id', modalDetColab.colab.id)
      .select()
      .single();
    if (updated) {
      setColaboradores(prev => ({
        ...prev,
        [modalDetColab.liderId]: (prev[modalDetColab.liderId] || []).map(x =>
          x.id === updated.id ? updated : x
        ),
      }));
    }
    setGuardandoColab(false);
    setModalDetColab(null);
    notify('✓ Contacto registrado hoy.');
  };

  const guardarNotas = async () => {
    if (!modalDetColab) return;
    setGuardandoColab(true);
    const { data: updated } = await supabase
      .from('colaboradores_campo')
      .update({ notas: editNotas || null })
      .eq('id', modalDetColab.colab.id)
      .select()
      .single();
    if (updated) {
      setColaboradores(prev => ({
        ...prev,
        [modalDetColab.liderId]: (prev[modalDetColab.liderId] || []).map(x =>
          x.id === updated.id ? updated : x
        ),
      }));
    }
    setGuardandoColab(false);
    setModalDetColab(null);
  };

  const confirmarPRMColab = async () => {
    if (!modalDetColab) return;
    if (!confirm(`¿Confirmar que ${modalDetColab.colab.nombre} ya está inscrito en el padrón PRM?`)) return;
    setGuardandoColab(true);
    const { data: updated } = await supabase
      .from('colaboradores_campo')
      .update({ padron_confirmado: true, pendiente_padron: false })
      .eq('id', modalDetColab.colab.id)
      .select()
      .single();
    if (updated) {
      setColaboradores(prev => ({
        ...prev,
        [modalDetColab.liderId]: (prev[modalDetColab.liderId] || []).map(x =>
          x.id === updated.id ? updated : x
        ),
      }));
      auditar(`PRM confirmado: ${modalDetColab.colab.nombre}`, modalDetColab.colab.id);
    }
    setGuardandoColab(false);
    setModalDetColab(null);
    notify('✓ Inscripción PRM confirmada.');
  };

  const verRedCompleta = async (l: Lider, allLideres: Lider[]) => {
    setModalRed({ lider: l, items: [], cargando: true });
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
    const { data } = await supabase
      .from('colaboradores_campo').select('*').in('lider_id', liderIds).order('nombre');
    const liderById = new Map(allLideres.map(x => [x.id, x]));
    const map = new Map<string, Lider>();
    allLideres.forEach(x => map.set(normCed(x.cedula), x));
    const items: RedItem[] = (data || []).map(c => ({
      id: c.id, cedula: c.cedula, nombre: c.nombre, colegio: c.colegio,
      esLider: map.has(normCed(c.cedula)),
      liderNombre: liderById.get(c.lider_id)?.nombre || '',
    }));
    setModalRed({ lider: l, items, cargando: false });
  };

  const imprimirEquipo = async (l: Lider) => {
    let equipo = colaboradores[l.id];
    if (!equipo) {
      const { data } = await supabase.from('colaboradores_campo').select('*').eq('lider_id', l.id).order('nombre');
      equipo = data || [];
      setColaboradores(prev => ({ ...prev, [l.id]: equipo }));
    }
    const logoUrl = 'https://vectorseek.com/wp-content/uploads/2023/09/Partido-Revolucionario-Moderno-Republica-Dominican-Logo-Vector.svg-.png';
    const fecha = new Date().toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });
    const pendientes = equipo.filter((c: Colaborador) => c.pendiente_padron && !c.padron_confirmado).length;
    const filas = equipo.map((c: Colaborador, i: number) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${c.nombre}${(c.pendiente_padron && !c.padron_confirmado) ? ' <span class="pend">⚠️</span>' : (c.padron_confirmado ? ' <span class="conf">✓</span>' : '')}</td>
        <td>${c.cedula}</td>
        <td style="text-align:center">${c.colegio ? c.colegio.trim() : '—'}</td>
        <td>${c.municipio || '—'}</td>
        <td style="text-align:center">${c.celular || '<span style="color:#e08000">Sin tel</span>'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Equipo de ${l.nombre}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:Arial,sans-serif; color:#111; padding:30px; }
      .header { text-align:center; padding-bottom:18px; border-bottom:3px solid #0a4f6e; margin-bottom:22px; }
      .logo { width:110px; height:110px; object-fit:contain; }
      .proyecto { font-size:11px; color:#888; text-transform:uppercase; letter-spacing:1.5px; margin-top:10px; }
      .david { font-size:26px; font-weight:900; color:#0a4f6e; margin:3px 0; }
      .victor { font-size:14px; font-weight:700; color:#0a7ea4; }
      .lider-box { background:#f0f7ff; border-left:5px solid #0a4f6e; border-radius:6px; padding:14px 18px; margin-bottom:22px; }
      .lider-label { font-size:10px; color:#888; text-transform:uppercase; letter-spacing:1px; }
      .lider-nombre { font-size:20px; font-weight:800; color:#0a4f6e; margin:4px 0; }
      .lider-tel { font-size:13px; color:#555; margin-top:4px; }
      .zona-grid { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
      .zona-item { background:#fff; border-radius:6px; padding:6px 10px; min-width:110px; }
      .zona-key { display:block; font-size:9px; color:#888; text-transform:uppercase; letter-spacing:1px; }
      .zona-val { display:block; font-size:13px; font-weight:700; color:#0a4f6e; margin-top:2px; }
      .tabla-titulo { font-size:13px; font-weight:700; color:#333; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px; }
      table { width:100%; border-collapse:collapse; }
      th { background:#0a4f6e; color:#fff; padding:10px 8px; font-size:12px; text-align:left; }
      td { padding:8px; font-size:12px; border-bottom:1px solid #eee; vertical-align:middle; }
      tr:nth-child(even) td { background:#f8f9fa; }
      .pend { font-size:10px; }
      .conf { font-size:10px; color:#1a6e35; }
      .nota-pend { margin-top:10px; font-size:11px; color:#9a6500; background:#fff8e6; border-left:3px solid #f5a623; padding:6px 10px; border-radius:4px; }
      .footer { margin-top:24px; display:flex; justify-content:space-between; font-size:10px; color:#aaa; border-top:1px solid #eee; padding-top:10px; }
      @media print { body { padding:15px; } }
    </style></head><body>
    <div class="header">
      <img src="${logoUrl}" class="logo" />
      <div class="proyecto">Proyecto Presidencial</div>
      <div class="david">David Collado</div>
      <div class="victor">Equipo de Trabajo · Victor Ogando</div>
    </div>
    <div class="lider-box">
      <div class="lider-label">Líder de equipo</div>
      <div class="lider-nombre">★ ${l.nombre}</div>
      ${l.celular ? `<div class="lider-tel">📱 ${l.celular}</div>` : ''}
      <div class="zona-grid">
        ${l.provincia ? `<div class="zona-item"><span class="zona-key">Provincia</span><span class="zona-val">${l.provincia}</span></div>` : ''}
        ${l.circunscripcion ? `<div class="zona-item"><span class="zona-key">Circunscripción</span><span class="zona-val">${l.circunscripcion}</span></div>` : ''}
        ${l.municipio ? `<div class="zona-item"><span class="zona-key">Municipio</span><span class="zona-val">${l.municipio}</span></div>` : ''}
        ${l.colegio ? `<div class="zona-item"><span class="zona-key">Mesa</span><span class="zona-val">${l.colegio.trim()}</span></div>` : ''}
        ${l.meta_votos ? `<div class="zona-item"><span class="zona-key">Meta</span><span class="zona-val">${l.meta_votos} votos</span></div>` : ''}
      </div>
    </div>
    <div class="tabla-titulo">Equipo de trabajo (${equipo.length} colaboradores)</div>
    <table>
      <thead><tr>
        <th style="width:36px">#</th>
        <th>Nombre</th>
        <th>Cédula</th>
        <th style="width:60px">Mesa</th>
        <th>Municipio</th>
        <th style="width:100px">Teléfono</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    ${pendientes > 0 ? `<div class="nota-pend">⚠️ ${pendientes} persona${pendientes > 1 ? 's' : ''} pendiente${pendientes > 1 ? 's' : ''} de inscripción en el padrón PRM. Inscribir en: <strong>verificate.prm.do</strong></div>` : ''}
    <div class="footer">
      <span>Total: ${equipo.length} colaboradores${l.meta_votos ? ` · Meta: ${l.meta_votos}` : ''}</span>
      <span>Generado el ${fecha}</span>
    </div>
    <script>window.onload=function(){ window.print(); }</script>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const compartirEquipo = async (l: Lider) => {
    let equipo = colaboradores[l.id];
    if (!equipo) {
      const { data } = await supabase.from('colaboradores_campo').select('*').eq('lider_id', l.id).order('nombre');
      equipo = data || [];
      setColaboradores(prev => ({ ...prev, [l.id]: equipo }));
    }
    const zonaLider = [
      l.provincia || null,
      l.circunscripcion ? `CIR-${l.circunscripcion}` : null,
      l.municipio || null,
      l.colegio ? `Mesa ${l.colegio}` : null,
      l.celular ? `📱 ${l.celular}` : null,
    ].filter(Boolean).join(' · ');

    const lineas = equipo.map((c: Colaborador, i: number) => {
      const bits = [c.nombre];
      if (c.colegio) bits.push(`Mesa ${c.colegio}`);
      if (c.celular) bits.push(c.celular);
      if (c.pendiente_padron && !c.padron_confirmado) bits.push('⚠️ pend. PRM');
      return `${i + 1}. ${bits.join(' · ')}`;
    }).join('\n');

    const pendientesShare = equipo.filter((c: Colaborador) => c.pendiente_padron && !c.padron_confirmado).length;
    const fecha = new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });

    const texto = [
      `★ Equipo de ${l.nombre}`,
      `Proyecto Presidencial David Collado`,
      `Equipo de Trabajo · Victor Ogando`,
      zonaLider || null,
      l.meta_votos ? `Meta: ${l.meta_votos} personas` : null,
      `──────────────────────`,
      lineas || 'Sin colaboradores aún',
      `──────────────────────`,
      `Total: ${equipo.length} colaboradores`,
      pendientesShare > 0 ? `⚠️ ${pendientesShare} pend. de inscripción PRM` : null,
      `Generado el ${fecha}`,
    ].filter(Boolean).join('\n');

    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: `Equipo de ${l.nombre}`, text: texto });
        return;
      } catch (_) {}
    }
    setModalCompartir({ lider: l, texto });
  };

  const getSubLideres = (lid: number) => lideres.filter(l => l.parent_lider_id === lid);

  const lideresRaiz = lideres.filter(l => !l.parent_lider_id);
  const circs = [...new Set(lideresRaiz.map(l => l.circunscripcion).filter((c): c is number => c !== null))].sort((a, b) => a - b);
  const lideresFiltrados = filtroCirc === 'todos' ? lideresRaiz : lideresRaiz.filter(l => l.circunscripcion === filtroCirc);
  const totalSubLideres = lideres.length - lideresRaiz.length;

  const diasDesdeContacto = (fecha: string | null | undefined): string => {
    if (!fecha) return 'Nunca contactado';
    const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
    if (dias === 0) return 'Hoy';
    if (dias === 1) return 'Ayer';
    return `Hace ${dias} días`;
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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
        <Text style={styles.titulo}>Equipos de Trabajo</Text>
        <Text style={styles.subtitulo}>
          {lideresRaiz.length} líder{lideresRaiz.length !== 1 ? 'es' : ''}
          {totalSubLideres > 0 ? ` · ${totalSubLideres} sub-líder${totalSubLideres !== 1 ? 'es' : ''}` : ''}
          {sesion && <Text style={styles.rolTxt}> · {sesion.rol === 'admin' ? '👑 Admin' : '★ ' + sesion.nombre}</Text>}
        </Text>
      </View>

      {circs.length > 1 && (
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
        const meta = l.meta_votos || 0;
        const pctMeta = meta > 0 ? Math.min(100, Math.round(equipo.length / meta * 100)) : 0;

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
                {meta > 0 && (
                  <View style={styles.metaRow}>
                    <View style={styles.metaProgBg}>
                      <View style={[styles.metaProgFill, { width: `${pctMeta}%` as any }]} />
                    </View>
                    <Text style={styles.metaTxt}>{equipo.length || '—'}/{meta}</Text>
                  </View>
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

                <View style={styles.seccionHeaderRow}>
                  <Text style={styles.seccionLabel}>Colaboradores directos ({equipo.length})</Text>
                  {editar && (
                    <TouchableOpacity onPress={() => editarMeta(l)} style={styles.btnEditMeta}>
                      <Text style={styles.btnEditMetaTxt}>✏️ Meta{meta > 0 ? `: ${meta}` : ''}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {equipo.length === 0 ? (
                  <Text style={styles.equipoVacio}>Sin colaboradores asignados aún</Text>
                ) : (
                  equipo.map((c, ci) => {
                    const esLider = liderByCedula.has(normCed(c.cedula));
                    const esPendiente = c.pendiente_padron && !c.padron_confirmado;
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
                            {esLider && <View style={styles.esLiderBadge}><Text style={styles.esLiderBadgeTxt}>Sub-líder</Text></View>}
                            {esPendiente && <View style={styles.pendienteBadge}><Text style={styles.pendienteBadgeTxt}>⚠️ PRM</Text></View>}
                            {c.padron_confirmado && <View style={styles.confirmadoBadge}><Text style={styles.confirmadoBadgeTxt}>✓ PRM</Text></View>}
                          </View>
                          <Text style={styles.colabMeta}>
                            {c.cedula}{c.colegio ? ` · Mesa ${c.colegio}` : ''}
                            {!c.celular ? '  · ⚠️ Sin tel' : ''}
                          </Text>
                          {c.ultimo_contacto && (
                            <Text style={styles.colabContactoTxt}>📞 {diasDesdeContacto(c.ultimo_contacto)}</Text>
                          )}
                        </View>
                        <View style={styles.colabBtns}>
                          <TouchableOpacity onPress={() => abrirDetColab(c, l.id)} style={styles.btnDetalle}>
                            <Text style={styles.btnDetalleTxt}>📋</Text>
                          </TouchableOpacity>
                          {editar && !esLider && (
                            <TouchableOpacity onPress={() => promoverALider(c, l)} style={styles.btnPromover}>
                              <Text style={styles.btnPromoverTxt}>★</Text>
                            </TouchableOpacity>
                          )}
                          {editar && (
                            <TouchableOpacity onPress={() => eliminarColaborador(l.id, c)} style={styles.btnX}>
                              <Text style={styles.btnXTxt}>✕</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}

                <View style={styles.footerBtns}>
                  <TouchableOpacity style={styles.btnVerRed} onPress={() => verRedCompleta(l, lideres)}>
                    <Text style={styles.btnVerRedTxt}>🔗 Ver red completa</Text>
                  </TouchableOpacity>
                  <View style={styles.btnRow}>
                    <TouchableOpacity style={[styles.btnImprimir, { flex: 1 }]} onPress={() => imprimirEquipo(l)}>
                      <Text style={styles.btnImprimirTxt}>🖨 Imprimir PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btnCompartir, { flex: 1 }]} onPress={() => compartirEquipo(l)}>
                      <Text style={styles.btnCompartirTxt}>📤 Compartir</Text>
                    </TouchableOpacity>
                  </View>
                  {editar && (
                    <TouchableOpacity style={styles.btnEliminarLider} onPress={() => eliminarLider(l)}>
                      <Text style={styles.btnEliminarLiderTxt}>Quitar como líder</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        );
      })}

      {/* Modal: detalle de colaborador */}
      <Modal
        visible={!!modalDetColab}
        transparent
        animationType="slide"
        onRequestClose={() => setModalDetColab(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {modalDetColab && (
              <>
                <Text style={styles.modalTitulo}>{modalDetColab.colab.nombre}</Text>
                <Text style={styles.modalSubtitulo}>
                  {modalDetColab.colab.cedula}
                  {modalDetColab.colab.colegio ? ` · Mesa ${modalDetColab.colab.colegio}` : ''}
                </Text>

                <View style={styles.contactoInfo}>
                  <Text style={styles.contactoLabel}>Último contacto</Text>
                  <Text style={styles.contactoVal}>{diasDesdeContacto(modalDetColab.colab.ultimo_contacto)}</Text>
                </View>

                <Text style={styles.notasLabel}>Notas</Text>
                <TextInput
                  style={styles.notasInput}
                  placeholder="Observaciones sobre este colaborador..."
                  placeholderTextColor="#bbb"
                  value={editNotas}
                  onChangeText={setEditNotas}
                  multiline
                  numberOfLines={3}
                />

                <TouchableOpacity
                  style={styles.btnContactoHoy}
                  onPress={guardarContactoHoy}
                  disabled={guardandoColab}>
                  <Text style={styles.btnContactoHoyTxt}>
                    {guardandoColab ? 'Guardando...' : '📞 Marcar contacto de hoy + guardar notas'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnGuardarNotas}
                  onPress={guardarNotas}
                  disabled={guardandoColab}>
                  <Text style={styles.btnGuardarNotasTxt}>💾 Guardar notas sin marcar contacto</Text>
                </TouchableOpacity>

                {modalDetColab.colab.pendiente_padron && !modalDetColab.colab.padron_confirmado && (
                  <TouchableOpacity
                    style={styles.btnConfirmarPRM}
                    onPress={confirmarPRMColab}
                    disabled={guardandoColab}>
                    <Text style={styles.btnConfirmarPRMTxt}>✓ Confirmar inscripción en PRM</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.modalCerrar} onPress={() => setModalDetColab(null)}>
                  <Text style={styles.modalCerrarTxt}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal: compartir */}
      <Modal
        visible={!!modalCompartir}
        transparent
        animationType="slide"
        onRequestClose={() => setModalCompartir(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {modalCompartir && (
              <>
                <Text style={styles.modalTitulo}>Compartir equipo</Text>
                <Text style={styles.modalSubtitulo}>
                  Elegí cómo compartir el equipo de {modalCompartir.lider.nombre}
                </Text>
                <TouchableOpacity
                  style={styles.btnWhatsapp}
                  onPress={() => {
                    window.open(`https://wa.me/?text=${encodeURIComponent(modalCompartir.texto)}`, '_blank');
                    setModalCompartir(null);
                  }}>
                  <Text style={styles.btnWhatsappTxt}>💬  Enviar por WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnEmail}
                  onPress={() => {
                    const asunto = encodeURIComponent(`Equipo de ${modalCompartir.lider.nombre}`);
                    const cuerpo = encodeURIComponent(modalCompartir.texto);
                    window.open(`mailto:?subject=${asunto}&body=${cuerpo}`, '_blank');
                    setModalCompartir(null);
                  }}>
                  <Text style={styles.btnEmailTxt}>✉️  Enviar por correo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalCerrar} onPress={() => setModalCompartir(null)}>
                  <Text style={styles.modalCerrarTxt}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

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
  header: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3 },
  headerBand: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  logoPRM: { width: 44, height: 44, marginRight: 10 },
  headerTextos: { flex: 1 },
  headerProyecto: { fontSize: 12, fontWeight: '700', color: '#0a4f6e' },
  headerEquipo: { fontSize: 11, color: '#0a7ea4', fontWeight: '600', marginTop: 1 },
  btnSalir: { backgroundColor: '#f0f0f0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  btnSalirTxt: { fontSize: 11, color: '#555', fontWeight: '700' },
  titulo: { fontSize: 16, fontWeight: 'bold', color: '#0a4f6e', textAlign: 'center' },
  subtitulo: { fontSize: 12, color: '#888', marginTop: 2, textAlign: 'center' },
  rolTxt: { fontSize: 11, color: '#0a7ea4' },
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
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 6 },
  metaProgBg: { flex: 1, height: 5, backgroundColor: '#e0e0e0', borderRadius: 3, overflow: 'hidden' },
  metaProgFill: { height: '100%', backgroundColor: '#0a7ea4', borderRadius: 3 },
  metaTxt: { fontSize: 10, color: '#0a7ea4', fontWeight: '700', minWidth: 40 },
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
  seccionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  seccionLabel: { fontSize: 10, fontWeight: '800', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5 },
  btnEditMeta: { backgroundColor: '#e8f4f8', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  btnEditMetaTxt: { fontSize: 11, color: '#0a4f6e', fontWeight: '700' },
  equipoVacio: { fontSize: 13, color: '#bbb', textAlign: 'center', paddingVertical: 12 },
  colab: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f8f8f8' },
  colabEsLider: { backgroundColor: '#fffbf0' },
  colabNumBox: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#e8f4f8', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  colabNumBoxLider: { backgroundColor: '#f5a623' },
  colabNumTxt: { fontSize: 11, color: '#0a7ea4', fontWeight: '700' },
  colabNumTxtLider: { color: '#fff' },
  colabInfo: { flex: 1 },
  colabNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  colabNombre: { fontSize: 13, fontWeight: '600', color: '#222', flexShrink: 1 },
  colabNombreLider: { color: '#0a4f6e' },
  colabMeta: { fontSize: 11, color: '#888', marginTop: 1 },
  colabContactoTxt: { fontSize: 10, color: '#0a7ea4', marginTop: 1 },
  esLiderBadge: { backgroundColor: '#f5a623', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  esLiderBadgeTxt: { fontSize: 9, fontWeight: '800', color: '#fff' },
  pendienteBadge: { backgroundColor: '#fff3cd', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#f5a623' },
  pendienteBadgeTxt: { fontSize: 9, fontWeight: '700', color: '#7a4f00' },
  confirmadoBadge: { backgroundColor: '#e6f4ea', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  confirmadoBadgeTxt: { fontSize: 9, fontWeight: '700', color: '#1a6e35' },
  colabBtns: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btnDetalle: { padding: 5, backgroundColor: '#f0f7ff', borderRadius: 6 },
  btnDetalleTxt: { fontSize: 13 },
  btnPromover: { padding: 6, backgroundColor: '#fff9e6', borderRadius: 6, borderWidth: 1, borderColor: '#f5a623' },
  btnPromoverTxt: { color: '#f5a623', fontSize: 12, fontWeight: '700' },
  btnX: { padding: 6 },
  btnXTxt: { color: '#ddd', fontSize: 14, fontWeight: '700' },
  footerBtns: { marginTop: 12, gap: 8 },
  btnVerRed: { borderWidth: 1, borderColor: '#0a7ea4', borderRadius: 7, paddingVertical: 9, alignItems: 'center' },
  btnVerRedTxt: { color: '#0a7ea4', fontSize: 13, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 8 },
  btnImprimir: { backgroundColor: '#0a4f6e', borderRadius: 7, paddingVertical: 10, alignItems: 'center' },
  btnImprimirTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnCompartir: { backgroundColor: '#0a7ea4', borderRadius: 7, paddingVertical: 10, alignItems: 'center' },
  btnCompartirTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnEliminarLider: { borderWidth: 1, borderColor: '#ffcccc', borderRadius: 7, paddingVertical: 9, alignItems: 'center' },
  btnEliminarLiderTxt: { color: '#e05050', fontSize: 13 },
  // Modal compartir
  btnWhatsapp: { backgroundColor: '#25D366', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  btnWhatsappTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnEmail: { backgroundColor: '#0a4f6e', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  btnEmailTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Modal detalle colaborador
  contactoInfo: { backgroundColor: '#f0f7ff', borderRadius: 8, padding: 10, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contactoLabel: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase' },
  contactoVal: { fontSize: 13, color: '#0a4f6e', fontWeight: '700' },
  notasLabel: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase', marginBottom: 6 },
  notasInput: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 13, color: '#222', backgroundColor: '#fafafa', height: 80, textAlignVertical: 'top', marginBottom: 12 },
  btnContactoHoy: { backgroundColor: '#0a4f6e', borderRadius: 9, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  btnContactoHoyTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnGuardarNotas: { borderWidth: 1, borderColor: '#0a7ea4', borderRadius: 9, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  btnGuardarNotasTxt: { color: '#0a7ea4', fontSize: 13, fontWeight: '600' },
  btnConfirmarPRM: { backgroundColor: '#1a6e35', borderRadius: 9, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  btnConfirmarPRMTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Modal base
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
  modalCerrar: { marginTop: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8 },
  modalCerrarTxt: { color: '#555', fontSize: 14 },
});
