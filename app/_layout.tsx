import { useEffect } from 'react';
import { Platform } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useSesion } from '@/lib/auth-context';

export const unstable_settings = { anchor: '(tabs)' };

// Componente interno que tiene acceso al contexto de sesión
function RouteGuard() {
  const { sesion, cargandoSesion } = useSesion();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (cargandoSesion) return;
    const inLogin = segments[0] === 'login';
    if (!sesion && !inLogin) router.replace('/login');
    else if (sesion && inLogin) router.replace('/');
  }, [sesion, cargandoSesion, segments]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return (
    <AuthProvider>
      <Head>
        <meta name="theme-color" content="#0a4f6e" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Campo PRM" />
        <meta name="description" content="Gestión de líderes y colaboradores — Trabajo de Campo PRM" />
      </Head>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RouteGuard />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="usuarios" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
