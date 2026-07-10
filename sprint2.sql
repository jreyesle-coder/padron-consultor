-- ============================================================
-- Sprint 2: Trabajo de Campo — captación en calle
-- Aplicar en Supabase SQL Editor
-- ============================================================

-- 1. Nuevas columnas en colaboradores_campo para captación en calle
ALTER TABLE colaboradores_campo
  ADD COLUMN IF NOT EXISTS provincia  TEXT,
  ADD COLUMN IF NOT EXISTS sector     TEXT,
  ADD COLUMN IF NOT EXISTS direccion  TEXT,
  ADD COLUMN IF NOT EXISTS lat        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS foto_url   TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- 2. Bucket de Storage para fotos de captación
--    Ejecutar SOLO si el bucket no existe en Supabase Dashboard.
--    Alternativa: crearlo manualmente en Storage → New bucket → "captacion-fotos" (public).
INSERT INTO storage.buckets (id, name, public)
VALUES ('captacion-fotos', 'captacion-fotos', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: solo usuarios autenticados pueden subir fotos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Autenticados pueden subir fotos captacion'
  ) THEN
    CREATE POLICY "Autenticados pueden subir fotos captacion"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'captacion-fotos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Fotos captacion publicas de lectura'
  ) THEN
    CREATE POLICY "Fotos captacion publicas de lectura"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'captacion-fotos');
  END IF;
END
$$;
