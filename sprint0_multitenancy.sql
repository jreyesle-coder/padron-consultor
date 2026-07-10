-- ============================================================
-- SPRINT 0 – Multi-tenancy y correcciones
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. Tabla organizaciones
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizaciones (
  id          BIGSERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 2. Tabla usuarios_organizacion
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usuarios_organizacion (
  id              BIGSERIAL PRIMARY KEY,
  usuario_id      BIGINT REFERENCES public.usuarios_app(id) ON DELETE CASCADE,
  organizacion_id BIGINT REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  rol_org         TEXT DEFAULT 'miembro',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, organizacion_id)
);

-- ─────────────────────────────────────────────
-- 3. Agregar organizacion_id a tablas de campo
-- ─────────────────────────────────────────────
ALTER TABLE public.lideres_campo
  ADD COLUMN IF NOT EXISTS organizacion_id BIGINT REFERENCES public.organizaciones(id);

ALTER TABLE public.colaboradores_campo
  ADD COLUMN IF NOT EXISTS organizacion_id BIGINT REFERENCES public.organizaciones(id);

ALTER TABLE public.auditoria
  ADD COLUMN IF NOT EXISTS organizacion_id BIGINT REFERENCES public.organizaciones(id);

-- captaciones (cuando exista):
-- ALTER TABLE public.captaciones
--   ADD COLUMN IF NOT EXISTS organizacion_id BIGINT REFERENCES public.organizaciones(id);

-- ─────────────────────────────────────────────
-- 4. Organización semilla
-- ─────────────────────────────────────────────
INSERT INTO public.organizaciones (nombre, slug)
VALUES ('Equipo Higuey - Julio Reyes', 'equipo-higuey-julio-reyes')
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────
-- 5. Asignar todos los datos existentes a la org semilla
-- ─────────────────────────────────────────────
UPDATE public.lideres_campo
SET organizacion_id = (
  SELECT id FROM public.organizaciones WHERE slug = 'equipo-higuey-julio-reyes'
)
WHERE organizacion_id IS NULL;

UPDATE public.colaboradores_campo
SET organizacion_id = (
  SELECT id FROM public.organizaciones WHERE slug = 'equipo-higuey-julio-reyes'
)
WHERE organizacion_id IS NULL;

UPDATE public.auditoria
SET organizacion_id = (
  SELECT id FROM public.organizaciones WHERE slug = 'equipo-higuey-julio-reyes'
)
WHERE organizacion_id IS NULL;

-- Asociar todos los usuarios existentes a la org semilla
INSERT INTO public.usuarios_organizacion (usuario_id, organizacion_id)
SELECT ua.id, o.id
FROM public.usuarios_app ua
CROSS JOIN public.organizaciones o
WHERE o.slug = 'equipo-higuey-julio-reyes'
ON CONFLICT (usuario_id, organizacion_id) DO NOTHING;

-- ─────────────────────────────────────────────
-- 6. Fix: colaboradores_campo.cedula UNIQUE → UNIQUE(cedula, lider_id)
-- ─────────────────────────────────────────────
-- Primero eliminamos el constraint único en cedula sola (nombre por defecto de Supabase)
ALTER TABLE public.colaboradores_campo
  DROP CONSTRAINT IF EXISTS colaboradores_campo_cedula_key;

-- Constraint compuesto: la misma cédula puede estar en equipos de distintos líderes
ALTER TABLE public.colaboradores_campo
  ADD CONSTRAINT colaboradores_campo_cedula_lider_unique
  UNIQUE (cedula, lider_id);

-- ─────────────────────────────────────────────
-- 7. Columnas verificate_* en colaboradores_campo
-- ─────────────────────────────────────────────
ALTER TABLE public.colaboradores_campo
  ADD COLUMN IF NOT EXISTS verificate_en_padron BOOLEAN DEFAULT NULL;

ALTER TABLE public.colaboradores_campo
  ADD COLUMN IF NOT EXISTS verificate_partido TEXT DEFAULT NULL;

ALTER TABLE public.colaboradores_campo
  ADD COLUMN IF NOT EXISTS verificate_estado TEXT DEFAULT NULL;

ALTER TABLE public.colaboradores_campo
  ADD COLUMN IF NOT EXISTS verificate_fecha_consulta DATE DEFAULT NULL;

-- ─────────────────────────────────────────────
-- 8. RLS – filtrar datos por organización del usuario
-- ─────────────────────────────────────────────
ALTER TABLE public.lideres_campo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaboradores_campo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

-- Helper: organizaciones del usuario autenticado
-- (reutilizado en cada policy)

DROP POLICY IF EXISTS "lideres_por_org" ON public.lideres_campo;
CREATE POLICY "lideres_por_org" ON public.lideres_campo
  FOR ALL USING (
    organizacion_id IN (
      SELECT uo.organizacion_id
      FROM public.usuarios_organizacion uo
      JOIN public.usuarios_app ua ON ua.id = uo.usuario_id
      WHERE ua.email = auth.email()
    )
  );

DROP POLICY IF EXISTS "colaboradores_por_org" ON public.colaboradores_campo;
CREATE POLICY "colaboradores_por_org" ON public.colaboradores_campo
  FOR ALL USING (
    organizacion_id IN (
      SELECT uo.organizacion_id
      FROM public.usuarios_organizacion uo
      JOIN public.usuarios_app ua ON ua.id = uo.usuario_id
      WHERE ua.email = auth.email()
    )
  );

DROP POLICY IF EXISTS "auditoria_por_org" ON public.auditoria;
CREATE POLICY "auditoria_por_org" ON public.auditoria
  FOR ALL USING (
    organizacion_id IS NULL
    OR organizacion_id IN (
      SELECT uo.organizacion_id
      FROM public.usuarios_organizacion uo
      JOIN public.usuarios_app ua ON ua.id = uo.usuario_id
      WHERE ua.email = auth.email()
    )
  );

-- organizaciones y usuarios_organizacion: sin RLS (acceso controlado por FK)
ALTER TABLE public.organizaciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_organizacion DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- POST-EJECUCIÓN:
-- 1. Verificar en Supabase → Table Editor que cada tabla tenga
--    el campo organizacion_id poblado para los registros existentes.
-- 2. Para crear una nueva organización:
--    INSERT INTO organizaciones(nombre, slug) VALUES ('Nombre', 'slug');
-- 3. Para agregar un usuario a una org:
--    INSERT INTO usuarios_organizacion(usuario_id, organizacion_id)
--    VALUES (ID_USUARIO, ID_ORG);
-- ============================================================
