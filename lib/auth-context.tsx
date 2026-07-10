import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';

export type UserRol = 'superadmin' | 'admin' | 'visor' | 'operativo' | 'lider';

/** Puede crear/editar/eliminar datos (no visor) */
export const puedeEditar = (rol?: UserRol | null) => rol !== 'visor';
/** Puede gestionar usuarios (superadmin o admin legacy) */
export const esSuperAdmin = (rol?: UserRol | null) => rol === 'superadmin' || rol === 'admin';

export type SesionApp = {
  userId: string;           // Supabase auth UUID — used for IndexedDB namespace isolation
  email: string;
  rol: UserRol;
  lider_id: number | null;
  nombre: string;
  organizacion_nombre: string;
  organizacion_id: number | null;
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
        .select('id, rol, lider_id, nombre')
        .eq('email', session.user.email)
        .maybeSingle();

      // Cargar organización activa (tabla creada en sprint0; silenciar error si aún no existe)
      let organizacion_nombre = 'Trabajo de Campo PRM';
      let organizacion_id: number | null = null;
      if (usuario?.id) {
        const { data: orgData } = await supabase
          .from('usuarios_organizacion')
          .select('organizacion_id, organizaciones(id, nombre)')
          .eq('usuario_id', usuario.id)
          .limit(1)
          .maybeSingle();
        if (orgData?.organizaciones) {
          const org = orgData.organizaciones as unknown as { id: number; nombre: string };
          organizacion_nombre = org.nombre;
          organizacion_id = org.id;
        }
      }

      setSesion({
        userId: session.user.id,
        email: session.user.email,
        rol: (usuario?.rol as UserRol) ?? 'admin',
        lider_id: usuario?.lider_id ?? null,
        nombre: usuario?.nombre ?? session.user.email,
        organizacion_nombre,
        organizacion_id,
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
