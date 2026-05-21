import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';

export type UserRol = 'admin' | 'lider';

export type SesionApp = {
  email: string;
  rol: UserRol;
  lider_id: number | null;
  nombre: string;
};

type AuthCtx = {
  sesion: SesionApp | null;
  cargandoSesion: boolean;
  cerrarSesion: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx>({
  sesion: null,
  cargandoSesion: true,
  cerrarSesion: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<SesionApp | null>(null);
  const [cargandoSesion, setCargando] = useState(true);

  const cargarRol = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { setSesion(null); setCargando(false); return; }

      const { data: usuario } = await supabase
        .from('usuarios_app')
        .select('rol, lider_id, nombre')
        .eq('email', session.user.email)
        .maybeSingle();

      setSesion({
        email: session.user.email,
        rol: (usuario?.rol as UserRol) ?? 'admin',
        lider_id: usuario?.lider_id ?? null,
        nombre: usuario?.nombre ?? session.user.email,
      });
    } catch {
      setSesion(null);
    }
    setCargando(false);
  };

  useEffect(() => {
    cargarRol();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setSesion(null); setCargando(false); }
      else cargarRol();
    });
    return () => subscription.unsubscribe();
  }, []);

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    setSesion(null);
  };

  return (
    <AuthContext.Provider value={{ sesion, cargandoSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useSesion = () => useContext(AuthContext);
