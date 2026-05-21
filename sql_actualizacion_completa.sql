-- ============================================================
-- ACTUALIZACIÓN COMPLETA - Padrón Consultor
-- Correr en Supabase → SQL Editor
-- ============================================================

-- 1. Meta de votos por líder
ALTER TABLE public.lideres_campo
ADD COLUMN IF NOT EXISTS meta_votos INT DEFAULT 0;

-- 2. Seguimiento de contacto por colaborador
ALTER TABLE public.colaboradores_campo
ADD COLUMN IF NOT EXISTS ultimo_contacto DATE;

ALTER TABLE public.colaboradores_campo
ADD COLUMN IF NOT EXISTS notas TEXT;

-- 3. Día de elecciones
ALTER TABLE public.colaboradores_campo
ADD COLUMN IF NOT EXISTS voto_confirmado BOOLEAN DEFAULT FALSE;

ALTER TABLE public.colaboradores_campo
ADD COLUMN IF NOT EXISTS necesita_transporte BOOLEAN DEFAULT FALSE;

-- 4. Confirmación de inscripción PRM (cierra el ciclo del pendiente_padron)
ALTER TABLE public.colaboradores_campo
ADD COLUMN IF NOT EXISTS padron_confirmado BOOLEAN DEFAULT FALSE;

-- 5. Tabla de auditoría (historial de acciones)
CREATE TABLE IF NOT EXISTS public.auditoria (
  id        BIGSERIAL PRIMARY KEY,
  accion    TEXT NOT NULL,
  tabla     TEXT,
  registro_id BIGINT,
  descripcion TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabla de usuarios/roles de la app (para control de acceso)
CREATE TABLE IF NOT EXISTS public.usuarios_app (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  rol        TEXT DEFAULT 'lider',   -- 'admin' o 'lider'
  lider_id   BIGINT REFERENCES public.lideres_campo(id) ON DELETE SET NULL,
  nombre     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Permisos: habilitar acceso desde la app (desactivar RLS en nuevas tablas)
-- Si usás RLS en las demás tablas, ajustá según sea necesario.
ALTER TABLE public.auditoria DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_app DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- INSTRUCCIONES POST-SQL:
-- 1. En Supabase → Authentication → Settings → Email: deshabilitar
--    "Confirm email" para poder crear usuarios sin confirmación
-- 2. En Supabase → Authentication → Users → "Invite user":
--    Crear el usuario administrador (correo + contraseña)
-- 3. Cada líder que quiera tener su propia vista necesita un usuario
--    En Authentication → Users y un registro en usuarios_app:
--    INSERT INTO usuarios_app (email, rol, lider_id, nombre)
--    VALUES ('correo@ejemplo.com', 'lider', ID_DEL_LIDER, 'Nombre');
-- ============================================================
