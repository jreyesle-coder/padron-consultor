import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
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

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RouteGuard />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
