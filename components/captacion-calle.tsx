import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import { SesionApp } from '@/lib/auth-context';
import { enqueue } from '@/lib/sync-queue';
import { dialogAlert } from '@/lib/dialog';
import { Lider } from '@/lib/types-campo';
import { buscarColegioPorCedula, ColegioPorCedula } from '@/lib/cedula-helper';

const normCed = (c: string) => c.replace(/\D/g, '').padStart(11, '0');

type GpsEstado = 'idle' | 'obteniendo' | 'ok' | 'error';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCaptured?: () => void;
  sesion: SesionApp | null;
  ns: string | null;
  lideres: Lider[];
};

export function CaptacionModal({ visible, onClose, onCaptured, sesion, ns, lideres }: Props) {
  const [nombre, setNombre] = useState('');
  const [cedula, setCedula] = useState('');
  const [celular, setCelular] = useState('');
  const [provincia, setProvincia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [sector, setSector] = useState('');
  const [direccion, setDireccion] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [gpsEstado, setGpsEstado] = useState<GpsEstado>('idle');
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [selectedLiderId, setSelectedLiderId] = useState<number | null>(
    sesion?.rol === 'lider' ? sesion?.lider_id ?? null : null
  );
  const [showLiderPicker, setShowLiderPicker] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [colegioJce, setColegioJce] = useState<ColegioPorCedula | null>(null);
  const [buscandoColegio, setBuscandoColegio] = useState(false);
  const fileInputRef = useRef<any>(null);

  // Lookup colegio JCE cuando la cédula llega a 11 dígitos
  useEffect(() => {
    const digits = cedula.replace(/\D/g, '');
    if (digits.length < 11) { setColegioJce(null); return; }
    let cancelled = false;
    setBuscandoColegio(true);
    buscarColegioPorCedula(digits).then(result => {
      if (!cancelled) {
        setColegioJce(result);
        setBuscandoColegio(false);
      }
    });
    return () => { cancelled = true; };
  }, [cedula]);

  const lideresRaiz = lideres.filter(l => !l.parent_lider_id);

  const reset = () => {
    setNombre(''); setCedula(''); setCelular('');
    setProvincia(''); setMunicipio(''); setSector(''); setDireccion('');
    setLat(null); setLng(null); setGpsEstado('idle');
    setFotoFile(null); setColegioJce(null); setBuscandoColegio(false);
    setSelectedLiderId(sesion?.rol === 'lider' ? sesion?.lider_id ?? null : null);
  };

  const handleClose = () => { reset(); onClose(); };

  const obtenerGPS = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      dialogAlert('GPS no disponible en este navegador.');
      return;
    }
    setGpsEstado('obteniendo');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGpsEstado('ok');
      },
      () => setGpsEstado('error'),
      { timeout: 12000, enableHighAccuracy: true }
    );
  };

  const guardar = async () => {
    if (!nombre.trim()) { await dialogAlert('El nombre es obligatorio.'); return; }
    const cedNorm = normCed(cedula);
    if (cedNorm.replace(/0/g, '') === '') { await dialogAlert('La cédula es obligatoria.'); return; }
    if (!sesion) { await dialogAlert('No hay sesión activa.'); return; }

    setGuardando(true);
    let fotoUrl: string | null = null;

    // Subir foto si existe
    if (fotoFile) {
      try {
        const ext = fotoFile.name.split('.').pop() ?? 'jpg';
        const path = `${sesion.organizacion_id ?? 0}/${Date.now()}-${cedNorm}.${ext}`;
        const { data: uploadData } = await supabase.storage
          .from('captacion-fotos')
          .upload(path, fotoFile, { upsert: false });
        if (uploadData) {
          const { data: urlData } = supabase.storage
            .from('captacion-fotos')
            .getPublicUrl(uploadData.path);
          fotoUrl = urlData.publicUrl;
        }
      } catch {}
    }

    const payload: Record<string, unknown> = {
      cedula: cedNorm,
      nombre: nombre.trim(),
      celular: celular.trim() || null,
      // Si el padrón JCE autocomplete, usar su provincia/municipio; si no, el valor manual
      provincia: (colegioJce?.provincia || provincia.trim()) || null,
      municipio: (colegioJce?.municipio || municipio.trim()) || null,
      sector: sector.trim() || null,
      direccion: direccion.trim() || null,
      lat: lat ?? null,
      lng: lng ?? null,
      foto_url: fotoUrl,
      lider_id: selectedLiderId,
      pendiente_padron: true,
      padron_confirmado: false,
      organizacion_id: sesion.organizacion_id,
      // FK al colegio JCE oficial (null si cédula no figura en padrón electoral)
      colegio_jce_id: colegioJce?.colegio_jce_id ?? null,
      // Campo texto colegio (compatibilidad con UI existente)
      colegio: colegioJce?.colegio_codigo ?? null,
    };

    const offline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (offline) {
      await enqueue(ns ?? '', {
        table: 'colaboradores_campo',
        operation: 'insert',
        payload,
        label: `📍 Captación: ${nombre.trim()}`,
      });
      setGuardando(false);
      reset();
      onClose();
      onCaptured?.();
      await dialogAlert(`✓ ${nombre.trim()} guardado localmente.\nSe sincronizará al recuperar conexión.`);
      return;
    }

    const { error } = await supabase.from('colaboradores_campo').insert(payload);
    if (error) {
      if (error.message?.includes('fetch') || error.message?.includes('NetworkError')) {
        await enqueue(ns ?? '', {
          table: 'colaboradores_campo',
          operation: 'insert',
          payload,
          label: `📍 Captación: ${nombre.trim()}`,
        });
        setGuardando(false);
        reset();
        onClose();
        onCaptured?.();
        await dialogAlert(`✓ ${nombre.trim()} guardado localmente.\nSe sincronizará al recuperar conexión.`);
        return;
      }
      setGuardando(false);
      await dialogAlert(`Error: ${error.message}`);
      return;
    }

    supabase.from('auditoria').insert({
      accion: 'app', tabla: 'campo', registro_id: null,
      descripcion: `📍 Captación en calle: ${nombre.trim()} (${cedNorm})`,
    }).then(() => {});

    setGuardando(false);
    reset();
    onClose();
    onCaptured?.();
    await dialogAlert(`✓ ${nombre.trim()} captado exitosamente.`);
  };

  const liderSeleccionado = lideresRaiz.find(l => l.id === selectedLiderId);

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitulo}>📍 Captación en calle</Text>
              <TouchableOpacity onPress={handleClose} style={styles.btnCerrar}>
                <Text style={styles.btnCerrarTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
              {/* Nombre */}
              <Text style={styles.label}>Nombre <Text style={styles.req}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={nombre}
                onChangeText={setNombre}
                placeholder="Nombre completo"
                placeholderTextColor="#bbb"
                autoCapitalize="words"
              />

              {/* Cédula */}
              <Text style={styles.label}>Cédula <Text style={styles.req}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={cedula}
                onChangeText={setCedula}
                placeholder="000-0000000-0"
                placeholderTextColor="#bbb"
                keyboardType="numeric"
                maxLength={13}
              />
              {/* Banner: colegio JCE encontrado en padrón */}
              {buscandoColegio && (
                <View style={styles.colegioBuscar}>
                  <ActivityIndicator size="small" color="#0a4f6e" />
                  <Text style={styles.colegioBuscarTxt}>Consultando padrón JCE...</Text>
                </View>
              )}
              {!buscandoColegio && colegioJce && (
                <View style={styles.colegioFound}>
                  <Text style={styles.colegioFoundIcon}>✓</Text>
                  <View>
                    <Text style={styles.colegioFoundTxt}>
                      Encontrado en padrón JCE · Mesa {colegioJce.colegio_codigo}
                    </Text>
                    <Text style={styles.colegioFoundSub}>
                      {colegioJce.recinto_nombre} · {colegioJce.municipio}
                    </Text>
                  </View>
                </View>
              )}
              {!buscandoColegio && !colegioJce && cedula.replace(/\D/g, '').length >= 11 && (
                <Text style={styles.colegioNotFound}>
                  Cédula no figura en el padrón electoral
                </Text>
              )}

              {/* Tel */}
              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                style={styles.input}
                value={celular}
                onChangeText={setCelular}
                placeholder="809-000-0000"
                placeholderTextColor="#bbb"
                keyboardType="phone-pad"
              />

              {/* Provincia + Municipio */}
              <View style={styles.row2}>
                <View style={styles.col}>
                  <Text style={styles.label}>Provincia</Text>
                  <TextInput style={styles.input} value={provincia} onChangeText={setProvincia} placeholder="Ej: La Altagracia" placeholderTextColor="#bbb" autoCapitalize="words" />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Municipio</Text>
                  <TextInput style={styles.input} value={municipio} onChangeText={setMunicipio} placeholder="Ej: Higüey" placeholderTextColor="#bbb" autoCapitalize="words" />
                </View>
              </View>

              {/* Sector */}
              <Text style={styles.label}>Sector / Barrio</Text>
              <TextInput style={styles.input} value={sector} onChangeText={setSector} placeholder="Ej: Los Americanos" placeholderTextColor="#bbb" autoCapitalize="words" />

              {/* Dirección */}
              <Text style={styles.label}>Dirección</Text>
              <TextInput style={styles.input} value={direccion} onChangeText={setDireccion} placeholder="Calle, número, referencias..." placeholderTextColor="#bbb" autoCapitalize="sentences" />

              {/* GPS */}
              <Text style={styles.label}>Ubicación GPS</Text>
              <TouchableOpacity
                style={[styles.btnGps, gpsEstado === 'ok' && styles.btnGpsOk, gpsEstado === 'error' && styles.btnGpsError]}
                onPress={obtenerGPS}
                disabled={gpsEstado === 'obteniendo'}>
                <Text style={[styles.btnGpsTxt, gpsEstado === 'ok' && styles.btnGpsTxtOk]}>
                  {gpsEstado === 'idle' && '📍 Obtener coordenadas'}
                  {gpsEstado === 'obteniendo' && '⏳ Obteniendo...'}
                  {gpsEstado === 'ok' && `✓ ${lat?.toFixed(5)}, ${lng?.toFixed(5)}`}
                  {gpsEstado === 'error' && '⚠️ No disponible — reintentar'}
                </Text>
              </TouchableOpacity>

              {/* Foto */}
              <Text style={styles.label}>Foto <Text style={styles.opt}>(opcional)</Text></Text>
              {Platform.OS === 'web' && (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={(e: any) => {
                      const file = e.target.files?.[0];
                      if (file) setFotoFile(file);
                    }}
                  />
                  <TouchableOpacity
                    style={[styles.btnFoto, fotoFile && styles.btnFotoOk]}
                    onPress={() => fileInputRef.current?.click()}>
                    <Text style={styles.btnFotoTxt}>
                      {fotoFile ? `📷 ${fotoFile.name}` : '📷 Adjuntar foto'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Asignar a líder */}
              {sesion?.rol !== 'lider' && lideresRaiz.length > 0 && (
                <>
                  <Text style={styles.label}>Asignar a líder</Text>
                  <TouchableOpacity
                    style={styles.btnPicker}
                    onPress={() => setShowLiderPicker(true)}>
                    <Text style={styles.btnPickerTxt}>
                      {liderSeleccionado ? `★ ${liderSeleccionado.nombre}` : 'Sin asignar (seleccionar)'}
                    </Text>
                    <Text style={styles.btnPickerArrow}>▼</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>

            {/* Botón guardar */}
            <View style={styles.sheetFooter}>
              <TouchableOpacity
                style={[styles.btnGuardar, guardando && styles.btnOff]}
                onPress={guardar}
                disabled={guardando}>
                {guardando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnGuardarTxt}>💾 Guardar militante</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Picker de líderes */}
      <Modal visible={showLiderPicker} animationType="slide" transparent onRequestClose={() => setShowLiderPicker(false)}>
        <View style={styles.overlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitulo}>Seleccionar líder</Text>
            <ScrollView>
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => { setSelectedLiderId(null); setShowLiderPicker(false); }}>
                <Text style={styles.pickerNombre}>Sin asignar</Text>
              </TouchableOpacity>
              {lideresRaiz.map(l => (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.pickerRow, selectedLiderId === l.id && styles.pickerRowActivo]}
                  onPress={() => { setSelectedLiderId(l.id); setShowLiderPicker(false); }}>
                  <Text style={[styles.pickerNombre, selectedLiderId === l.id && styles.pickerNombreActivo]}>
                    ★ {l.nombre}
                  </Text>
                  {l.circunscripcion && (
                    <Text style={styles.pickerDetalle}>CIR-{l.circunscripcion} · {l.municipio ?? ''}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCerrar} onPress={() => setShowLiderPicker(false)}>
              <Text style={styles.pickerCerrarTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  sheetTitulo: { fontSize: 16, fontWeight: '800', color: '#0a4f6e' },
  btnCerrar: { padding: 4 },
  btnCerrarTxt: { fontSize: 16, color: '#aaa', fontWeight: '700' },
  formScroll: { paddingHorizontal: 16 },
  label: { fontSize: 11, fontWeight: '700', color: '#555', textTransform: 'uppercase', marginTop: 12, marginBottom: 4, letterSpacing: 0.5 },
  req: { color: '#e05050' },
  opt: { color: '#bbb', fontWeight: '400', textTransform: 'none' },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#111', backgroundColor: '#fafafa' },
  row2: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  btnGps: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#f9f9f9', alignItems: 'center' },
  btnGpsOk: { backgroundColor: '#e6f4ea', borderColor: '#1a6e35' },
  btnGpsError: { backgroundColor: '#fff3cd', borderColor: '#f5a623' },
  btnGpsTxt: { fontSize: 13, color: '#555', fontWeight: '600' },
  btnGpsTxtOk: { color: '#1a6e35' },
  btnFoto: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#f9f9f9', alignItems: 'center' },
  btnFotoOk: { backgroundColor: '#e6f4ea', borderColor: '#1a6e35' },
  btnFotoTxt: { fontSize: 13, color: '#555', fontWeight: '600' },
  btnPicker: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fafafa', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  btnPickerTxt: { fontSize: 13, color: '#333', flex: 1 },
  btnPickerArrow: { fontSize: 10, color: '#aaa', marginLeft: 6 },
  sheetFooter: { padding: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  btnGuardar: { backgroundColor: '#0a4f6e', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnGuardarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnOff: { opacity: 0.5 },
  pickerSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', padding: 16 },
  pickerTitulo: { fontSize: 14, fontWeight: '700', color: '#0a4f6e', marginBottom: 12, textAlign: 'center' },
  pickerRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', paddingHorizontal: 4 },
  pickerRowActivo: { backgroundColor: '#e8f4f8' },
  pickerNombre: { fontSize: 13, fontWeight: '600', color: '#222' },
  pickerNombreActivo: { color: '#0a4f6e' },
  pickerDetalle: { fontSize: 11, color: '#888', marginTop: 1 },
  pickerCerrar: { marginTop: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8 },
  pickerCerrarTxt: { color: '#555', fontSize: 14 },
  // Colegio JCE autocomplete banners
  colegioBuscar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingVertical: 6 },
  colegioBuscarTxt: { fontSize: 11, color: '#888' },
  colegioFound: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#e6f4ea', borderRadius: 8, padding: 10, marginTop: 6 },
  colegioFoundIcon: { fontSize: 18, color: '#1a6e35', fontWeight: '700' },
  colegioFoundTxt: { fontSize: 12, fontWeight: '700', color: '#1a6e35' },
  colegioFoundSub: { fontSize: 11, color: '#2a7a45', marginTop: 1 },
  colegioNotFound: { fontSize: 11, color: '#e08000', marginTop: 6, backgroundColor: '#fff8e6', borderRadius: 6, padding: 7 },
});
