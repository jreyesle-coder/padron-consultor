import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useSesion, esSuperAdmin } from '@/lib/auth-context';

// Cliente temporal para crear usuarios sin afectar la sesión activa del admin
const crearAuthUsuario = async (email: string, password: string) => {
  const tmp = createClient(
    'https://mwddvwulxbxqtcdcyewh.supabase.co',
    'sb_publishable_P-_7j53-tV1gkZYJixh-0A_GnhA6zU5',
    { auth: { storageKey: `_tmp_${Date.now()}`, autoRefreshToken: false, persistSession: false } }
  );
  return tmp.auth.signUp({ email, password });
};

type Usuario = {
  id: number;
  email: string;
  rol: string;
  nombre: string | null;
  lider_id: number | null;
  lider_nombre?: string;
};

type Lider = { id: number; nombre: string; };

const ROLES = [
  { value: 'superadmin', label: 'Super Admin', desc: 'Acceso total + gestión de usuarios', color: '#0a4f6e' },
  { value: 'visor',      label: 'Visor',       desc: 'Solo lectura, ve todo',              color: '#c47f00' },
  { value: 'operativo',  label: 'Operativo',   desc: 'Busca, asigna líderes y colaboradores', color: '#1a6e35' },
  { value: 'lider',      label: 'Líder',       desc: 'Gestiona solo su propio equipo',    color: '#555' },
];

const ROL_COLOR: Record<string, string> = { superadmin: '#0a4f6e', admin: '#0a4f6e', visor: '#c47f00', operativo: '#1a6e35', lider: '#555' };
const ROL_LABEL: Record<string, string> = { superadmin: 'Super Admin', admin: 'Admin', visor: 'Visor', operativo: 'Operativo', lider: 'Líder' };

export default function UsuariosScreen() {
  const { sesion } = useSesion();
  const router = useRouter();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [cargando, setCargando] = useState(true);

  // Crear usuario
  const [mostrarForm, setMostrarForm] = useState(false);
  const [fNombre, setFNombre] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fPassword, setFPassword] = useState('');
  const [fRol, setFRol] = useState('operativo');
  const [fLiderId, setFLiderId] = useState<number | null>(null);
  const [fLiderBusca, setFLiderBusca] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Cambiar rol inline
  const [editandoRolId, setEditandoRolId] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [rU, rL] = await Promise.all([
      supabase.from('usuarios_app').select('id, email, rol, nombre, lider_id').order('nombre'),
      supabase.from('lideres_campo').select('id, nombre').order('nombre'),
    ]);
    const lids = rL.data || [];
    setLideres(lids);
    setUsuarios((rU.data || []).map(u => ({
      ...u,
      lider_nombre: lids.find((l: Lider) => l.id === u.lider_id)?.nombre,
    })));
    setCargando(false);
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  // Solo superadmin/admin puede usar esta pantalla
  if (sesion && !esSuperAdmin(sesion.rol)) {
    return (
      <View style={styles.denegado}>
        <Text style={styles.denegadoTxt}>🔒 Acceso restringido</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.btnBack}>
          <Text style={styles.btnBackTxt}>← Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const crearUsuario = async () => {
    if (!fNombre.trim() || !fEmail.trim() || !fPassword.trim()) {
      setError('Nombre, email y contraseña son requeridos'); return;
    }
    if (fRol === 'lider' && !fLiderId) {
      setError('Debes seleccionar el líder asignado'); return;
    }
    setGuardando(true); setError('');
    try {
      const { error: authErr } = await crearAuthUsuario(fEmail.trim().toLowerCase(), fPassword);
      if (authErr && !authErr.message.includes('already registered')) {
        setError(authErr.message); setGuardando(false); return;
      }
      const { error: dbErr } = await supabase.from('usuarios_app').insert({
        email: fEmail.trim().toLowerCase(),
        rol: fRol,
        nombre: fNombre.trim(),
        lider_id: fRol === 'lider' ? fLiderId : null,
      });
      if (dbErr) { setError(dbErr.message); setGuardando(false); return; }
      setFNombre(''); setFEmail(''); setFPassword(''); setFRol('operativo');
      setFLiderId(null); setFLiderBusca(''); setMostrarForm(false);
      cargar();
    } catch (e: any) { setError(e.message || 'Error desconocido'); }
    setGuardando(false);
  };

  const cambiarRol = async (u: Usuario, nuevoRol: string) => {
    await supabase.from('usuarios_app').update({ rol: nuevoRol }).eq('id', u.id);
    setEditandoRolId(null);
    cargar();
  };

  const eliminarAcceso = async (u: Usuario) => {
    if (!window.confirm(`¿Quitar acceso a ${u.nombre || u.email}?\n\nEsto solo elimina su acceso a la app.`)) return;
    await supabase.from('usuarios_app').delete().eq('id', u.id);
    cargar();
  };

  const lidersFiltrados = lideres.filter(l =>
    l.nombre.toLowerCase().includes(fLiderBusca.toLowerCase())
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerBand}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnTxt}>← Volver</Text>
          </TouchableOpacity>
          <Image source={require('../assets/images/logo-prm.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.headerProyecto}>Proyecto Presidencial David Collado</Text>
        </View>
        <Text style={styles.titulo}>Gestión de Usuarios</Text>
        <Text style={styles.subtitulo}>Solo visible para Super Admin</Text>
      </View>

      {cargando ? <ActivityIndicator color="#0a7ea4" style={{ marginTop: 40 }} /> : (
        <>
          {/* Botón nuevo usuario */}
          <TouchableOpacity
            style={[styles.btnAgregar, mostrarForm && styles.btnAgregarCancelar]}
            onPress={() => { setMostrarForm(!mostrarForm); setError(''); }}>
            <Text style={styles.btnAgregarTxt}>{mostrarForm ? '✕ Cancelar' : '+ Nuevo usuario'}</Text>
          </TouchableOpacity>

          {/* Formulario crear usuario */}
          {mostrarForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitulo}>Crear nuevo acceso</Text>

              <Text style={styles.lbl}>Nombre completo</Text>
              <TextInput style={styles.input} value={fNombre} onChangeText={setFNombre}
                placeholder="Ej: Charles Beriguete" placeholderTextColor="#bbb" />

              <Text style={styles.lbl}>Email</Text>
              <TextInput style={styles.input} value={fEmail} onChangeText={setFEmail}
                placeholder="correo@ejemplo.com" placeholderTextColor="#bbb"
                autoCapitalize="none" keyboardType="email-address" />

              <Text style={styles.lbl}>Contraseña (mínimo 6 caracteres)</Text>
              <TextInput style={styles.input} value={fPassword} onChangeText={setFPassword}
                placeholder="••••••••" placeholderTextColor="#bbb" secureTextEntry />

              <Text style={styles.lbl}>Rol</Text>
              <View style={styles.rolesGrid}>
                {ROLES.map(r => (
                  <TouchableOpacity key={r.value}
                    style={[styles.rolOpcion, fRol === r.value && { backgroundColor: r.color, borderColor: r.color }]}
                    onPress={() => { setFRol(r.value); if (r.value !== 'lider') { setFLiderId(null); setFLiderBusca(''); } }}>
                    <Text style={[styles.rolOpcionLabel, fRol === r.value && { color: '#fff' }]}>{r.label}</Text>
                    <Text style={[styles.rolOpcionDesc, fRol === r.value && { color: 'rgba(255,255,255,0.8)' }]}>{r.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {fRol === 'lider' && (
                <>
                  <Text style={styles.lbl}>Líder asignado</Text>
                  <TextInput style={styles.input} value={fLiderBusca} onChangeText={setFLiderBusca}
                    placeholder="Buscar líder por nombre..." placeholderTextColor="#bbb" />
                  <View style={styles.liderLista}>
                    {lidersFiltrados.slice(0, 8).map(l => (
                      <TouchableOpacity key={l.id}
                        style={[styles.liderOpcion, fLiderId === l.id && styles.liderOpcionActivo]}
                        onPress={() => { setFLiderId(l.id); setFLiderBusca(l.nombre); }}>
                        <Text style={[styles.liderOpcionTxt, fLiderId === l.id && { color: '#fff' }]}>★ {l.nombre}</Text>
                      </TouchableOpacity>
                    ))}
                    {lidersFiltrados.length === 0 && <Text style={styles.sinLideres}>Sin resultados</Text>}
                  </View>
                </>
              )}

              {!!error && <Text style={styles.errorTxt}>⚠️ {error}</Text>}

              <TouchableOpacity style={styles.btnGuardar} onPress={crearUsuario} disabled={guardando}>
                {guardando
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.btnGuardarTxt}>Crear usuario →</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* Lista de usuarios */}
          <Text style={styles.seccionTitulo}>{usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} con acceso</Text>

          {usuarios.map(u => (
            <View key={u.id} style={styles.userCard}>
              <View style={styles.userInfo}>
                <View style={styles.userTopRow}>
                  <Text style={styles.userNombre} numberOfLines={1}>{u.nombre || u.email}</Text>
                  <View style={[styles.rolBadge, { backgroundColor: ROL_COLOR[u.rol] || '#555' }]}>
                    <Text style={styles.rolBadgeTxt}>{ROL_LABEL[u.rol] || u.rol}</Text>
                  </View>
                  {u.email === sesion?.email && (
                    <View style={styles.tuCuentaBadge}><Text style={styles.tuCuentaTxt}>Tú</Text></View>
                  )}
                </View>
                <Text style={styles.userEmail}>{u.email}</Text>
                {u.lider_nombre && <Text style={styles.userLider}>★ {u.lider_nombre}</Text>}
              </View>

              {u.email !== sesion?.email && (
                <View style={styles.userBtns}>
                  <TouchableOpacity
                    style={[styles.btnRol, editandoRolId === u.id && styles.btnRolActivo]}
                    onPress={() => setEditandoRolId(editandoRolId === u.id ? null : u.id)}>
                    <Text style={styles.btnRolTxt}>Rol</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnElim} onPress={() => eliminarAcceso(u)}>
                    <Text style={styles.btnElimTxt}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Selector de rol inline */}
              {editandoRolId === u.id && (
                <View style={styles.rolSelectorRow}>
                  {ROLES.map(r => (
                    <TouchableOpacity key={r.value}
                      style={[styles.rolChip, u.rol === r.value && { backgroundColor: ROL_COLOR[r.value] }]}
                      onPress={() => cambiarRol(u, r.value)}>
                      <Text style={[styles.rolChipTxt, u.rol === r.value && { color: '#fff' }]}>{r.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ))}

          {/* Nota explicativa */}
          <View style={styles.nota}>
            <Text style={styles.notaTitulo}>ℹ️ Roles de acceso</Text>
            <Text style={styles.notaLinea}><Text style={styles.notaBold}>Super Admin</Text> — todo + esta pantalla de usuarios</Text>
            <Text style={styles.notaLinea}><Text style={styles.notaBold}>Operativo</Text> — busca, asigna líderes y colaboradores</Text>
            <Text style={styles.notaLinea}><Text style={styles.notaBold}>Visor</Text> — solo lectura, ve todos los datos sin poder editar</Text>
            <Text style={styles.notaLinea}><Text style={styles.notaBold}>Líder</Text> — ve y gestiona solo su propio equipo</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 14, paddingBottom: 60, backgroundColor: '#f0f2f5' },
  denegado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  denegadoTxt: { fontSize: 18, fontWeight: '700', color: '#555', marginBottom: 20 },
  header: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 14, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3 },
  headerBand: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 8 },
  backBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  backBtnTxt: { fontSize: 13, color: '#0a7ea4', fontWeight: '700' },
  btnBack: { marginTop: 12, backgroundColor: '#0a7ea4', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  btnBackTxt: { color: '#fff', fontWeight: '700' },
  logo: { width: 32, height: 32 },
  headerProyecto: { flex: 1, fontSize: 11, fontWeight: '700', color: '#0a4f6e' },
  titulo: { fontSize: 18, fontWeight: 'bold', color: '#0a4f6e', textAlign: 'center' },
  subtitulo: { fontSize: 11, color: '#888', textAlign: 'center', marginTop: 2 },
  btnAgregar: { backgroundColor: '#0a4f6e', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12 },
  btnAgregarCancelar: { backgroundColor: '#888' },
  btnAgregarTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  formCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3 },
  formTitulo: { fontSize: 14, fontWeight: '700', color: '#0a4f6e', marginBottom: 12 },
  lbl: { fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 5, marginTop: 12 },
  input: { borderWidth: 1.5, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14, color: '#111', backgroundColor: '#fafafa' },
  rolesGrid: { gap: 8 },
  rolOpcion: { borderWidth: 1.5, borderColor: '#ddd', borderRadius: 9, padding: 10 },
  rolOpcionLabel: { fontSize: 13, fontWeight: '700', color: '#333' },
  rolOpcionDesc: { fontSize: 11, color: '#888', marginTop: 2 },
  liderLista: { gap: 5, marginTop: 6 },
  liderOpcion: { borderWidth: 1, borderColor: '#ddd', borderRadius: 7, padding: 9 },
  liderOpcionActivo: { backgroundColor: '#0a4f6e', borderColor: '#0a4f6e' },
  liderOpcionTxt: { fontSize: 13, color: '#333' },
  sinLideres: { fontSize: 12, color: '#aaa', textAlign: 'center', paddingVertical: 8 },
  errorTxt: { color: '#c0392b', fontSize: 12, marginTop: 10, fontWeight: '600' },
  btnGuardar: { backgroundColor: '#0a7ea4', borderRadius: 9, padding: 13, alignItems: 'center', marginTop: 16 },
  btnGuardarTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  seccionTitulo: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 8 },
  userCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  userInfo: { flex: 1, marginBottom: 2 },
  userTopRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 },
  userNombre: { flex: 1, fontSize: 13, fontWeight: '700', color: '#111' },
  rolBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  rolBadgeTxt: { fontSize: 9, color: '#fff', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  tuCuentaBadge: { backgroundColor: '#e8f4f8', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  tuCuentaTxt: { fontSize: 9, color: '#0a7ea4', fontWeight: '700' },
  userEmail: { fontSize: 11, color: '#888' },
  userLider: { fontSize: 11, color: '#0a4f6e', fontWeight: '600', marginTop: 2 },
  userBtns: { flexDirection: 'row', gap: 6, marginTop: 8 },
  btnRol: { backgroundColor: '#f0f0f0', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  btnRolActivo: { backgroundColor: '#0a7ea4' },
  btnRolTxt: { fontSize: 11, color: '#555', fontWeight: '700' },
  btnElim: { backgroundColor: '#fde8e8', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  btnElimTxt: { fontSize: 11, color: '#c0392b', fontWeight: '700' },
  rolSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  rolChip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  rolChipTxt: { fontSize: 11, color: '#555', fontWeight: '600' },
  nota: { backgroundColor: '#fff8e6', borderRadius: 10, padding: 14, marginTop: 8, borderLeftWidth: 3, borderLeftColor: '#f5a623' },
  notaTitulo: { fontSize: 12, fontWeight: '700', color: '#7a4f00', marginBottom: 6 },
  notaLinea: { fontSize: 11, color: '#7a4f00', lineHeight: 20 },
  notaBold: { fontWeight: '700' },
});
