import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const iniciarSesion = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Ingresá tu correo y contraseña.');
      return;
    }
    setCargando(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password.trim(),
    });
    setCargando(false);
    if (authError) setError('Correo o contraseña incorrectos.');
    // Si es exitoso, RouteGuard redirige automáticamente a las tabs
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.card}>
        <Image
          source={require('../assets/images/logo-prm.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.proyectoLabel}>Proyecto Presidencial</Text>
        <Text style={styles.proyectoNombre}>David Collado</Text>
        <Text style={styles.equipoTxt}>Equipo de Trabajo · Victor Ogando</Text>

        <View style={styles.sep} />

        <Text style={styles.labelAcceso}>Acceso privado al sistema</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTxt}>{error}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor="#aaa"
          value={email}
          onChangeText={v => { setEmail(v); setError(''); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#aaa"
          value={password}
          onChangeText={v => { setPassword(v); setError(''); }}
          secureTextEntry
          onSubmitEditing={iniciarSesion}
          returnKeyType="go"
        />

        <TouchableOpacity
          style={[styles.btnLogin, cargando && styles.btnDisabled]}
          onPress={iniciarSesion}
          disabled={cargando}>
          {cargando
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnLoginTxt}>Ingresar</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a4f6e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  logo: { width: 110, height: 110, marginBottom: 10 },
  proyectoLabel: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  proyectoNombre: { fontSize: 24, fontWeight: '900', color: '#0a4f6e', marginTop: 2 },
  equipoTxt: { fontSize: 13, color: '#0a7ea4', fontWeight: '700', marginTop: 3 },
  sep: { width: '100%', height: 1, backgroundColor: '#f0f0f0', marginVertical: 18 },
  labelAcceso: { fontSize: 13, color: '#666', marginBottom: 14, fontWeight: '600' },
  errorBox: { width: '100%', backgroundColor: '#fff0f0', borderRadius: 8, padding: 10, marginBottom: 10 },
  errorTxt: { color: '#e05050', fontSize: 13, textAlign: 'center' },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    color: '#222',
    backgroundColor: '#fafafa',
    marginBottom: 10,
  },
  btnLogin: {
    width: '100%',
    backgroundColor: '#0a4f6e',
    borderRadius: 11,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  btnLoginTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },
});
