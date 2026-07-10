-- ============================================================
-- Sprint 3 – Catálogo JCE + Asignaciones electorales
-- Ejecutar en Supabase → SQL Editor
-- Idempotente (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS)
-- ============================================================

-- Extensión para búsqueda por trigrama (nombre de recinto)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Catálogo geográfico JCE (PÚBLICO — solo lectura vía RLS) ──────────────────

CREATE TABLE IF NOT EXISTS provincias (
  id         BIGSERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS municipios (
  id           BIGSERIAL PRIMARY KEY,
  provincia_id BIGINT NOT NULL REFERENCES provincias(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provincia_id, nombre)
);

CREATE TABLE IF NOT EXISTS distritos_municipales (
  id           BIGSERIAL PRIMARY KEY,
  municipio_id BIGINT NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  UNIQUE(municipio_id, nombre)
);

CREATE TABLE IF NOT EXISTS recintos_jce (
  id                    BIGSERIAL PRIMARY KEY,
  provincia_id          BIGINT NOT NULL REFERENCES provincias(id),
  municipio_id          BIGINT NOT NULL REFERENCES municipios(id),
  distrito_municipal_id BIGINT REFERENCES distritos_municipales(id),
  nombre                TEXT NOT NULL,
  direccion             TEXT,
  sector                TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(municipio_id, nombre)
);
CREATE INDEX IF NOT EXISTS idx_recintos_provincia ON recintos_jce(provincia_id);
CREATE INDEX IF NOT EXISTS idx_recintos_municipio ON recintos_jce(municipio_id);
CREATE INDEX IF NOT EXISTS idx_recintos_nombre_trgm
  ON recintos_jce USING gin(nombre gin_trgm_ops);

CREATE TABLE IF NOT EXISTS colegios_jce (
  id         BIGSERIAL PRIMARY KEY,
  recinto_id BIGINT NOT NULL REFERENCES recintos_jce(id) ON DELETE CASCADE,
  codigo     TEXT NOT NULL,
  UNIQUE(recinto_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_colegios_recinto ON colegios_jce(recinto_id);
CREATE INDEX IF NOT EXISTS idx_colegios_codigo   ON colegios_jce(codigo);

-- RLS: todos leen, nadie escribe vía RLS (inserts solo por service_role)
ALTER TABLE provincias            ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE distritos_municipales ENABLE ROW LEVEL SECURITY;
ALTER TABLE recintos_jce          ENABLE ROW LEVEL SECURITY;
ALTER TABLE colegios_jce          ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'provincias' AND policyname = 'lectura_publica'
  ) THEN
    CREATE POLICY "lectura_publica" ON provincias FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'municipios' AND policyname = 'lectura_publica'
  ) THEN
    CREATE POLICY "lectura_publica" ON municipios FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'distritos_municipales' AND policyname = 'lectura_publica'
  ) THEN
    CREATE POLICY "lectura_publica" ON distritos_municipales FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'recintos_jce' AND policyname = 'lectura_publica'
  ) THEN
    CREATE POLICY "lectura_publica" ON recintos_jce FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'colegios_jce' AND policyname = 'lectura_publica'
  ) THEN
    CREATE POLICY "lectura_publica" ON colegios_jce FOR SELECT USING (true);
  END IF;
END $$;

-- ── Asignaciones operativas PRM (PRIVADAS por organización) ──────────────────

CREATE TABLE IF NOT EXISTS asignaciones_recinto (
  id                      BIGSERIAL PRIMARY KEY,
  organizacion_id         BIGINT NOT NULL REFERENCES organizaciones(id),
  recinto_jce_id          BIGINT NOT NULL REFERENCES recintos_jce(id),
  coordinador_enlace_id   BIGINT REFERENCES usuarios_app(id),
  gerente_id              BIGINT REFERENCES usuarios_app(id),
  subgerente_id           BIGINT REFERENCES usuarios_app(id),
  director_delegados_id   BIGINT REFERENCES usuarios_app(id),
  direccion_casa_acopio   TEXT,
  notas                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organizacion_id, recinto_jce_id)
);

ALTER TABLE asignaciones_recinto ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'asignaciones_recinto' AND policyname = 'ver_solo_mi_org'
  ) THEN
    CREATE POLICY "ver_solo_mi_org" ON asignaciones_recinto FOR ALL
      USING (
        organizacion_id IN (
          SELECT uo.organizacion_id
          FROM usuarios_organizacion uo
          JOIN usuarios_app ua ON ua.id = uo.usuario_id
          WHERE ua.email = auth.email()
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS asignaciones_colegio (
  id                    BIGSERIAL PRIMARY KEY,
  organizacion_id       BIGINT NOT NULL REFERENCES organizaciones(id),
  asignacion_recinto_id BIGINT NOT NULL REFERENCES asignaciones_recinto(id) ON DELETE CASCADE,
  colegio_jce_id        BIGINT NOT NULL REFERENCES colegios_jce(id),
  delegado_principal_id BIGINT REFERENCES usuarios_app(id),
  delegado_suplente_id  BIGINT REFERENCES usuarios_app(id),
  notas                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organizacion_id, colegio_jce_id)
);

ALTER TABLE asignaciones_colegio ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'asignaciones_colegio' AND policyname = 'ver_solo_mi_org'
  ) THEN
    CREATE POLICY "ver_solo_mi_org" ON asignaciones_colegio FOR ALL
      USING (
        organizacion_id IN (
          SELECT uo.organizacion_id
          FROM usuarios_organizacion uo
          JOIN usuarios_app ua ON ua.id = uo.usuario_id
          WHERE ua.email = auth.email()
        )
      );
  END IF;
END $$;

-- ── Extender colaboradores_campo con FK a colegio JCE oficial ────────────────

ALTER TABLE colaboradores_campo
  ADD COLUMN IF NOT EXISTS colegio_jce_id BIGINT REFERENCES colegios_jce(id);

CREATE INDEX IF NOT EXISTS idx_colab_colegio_jce
  ON colaboradores_campo(colegio_jce_id);

-- ── Triggers updated_at (reutiliza prm_set_updated_at del Sprint 1) ───────────

DROP TRIGGER IF EXISTS trg_recintos_updated    ON recintos_jce;
DROP TRIGGER IF EXISTS trg_asign_rec_updated   ON asignaciones_recinto;
DROP TRIGGER IF EXISTS trg_asign_col_updated   ON asignaciones_colegio;

CREATE TRIGGER trg_recintos_updated
  BEFORE UPDATE ON recintos_jce
  FOR EACH ROW EXECUTE FUNCTION prm_set_updated_at();

CREATE TRIGGER trg_asign_rec_updated
  BEFORE UPDATE ON asignaciones_recinto
  FOR EACH ROW EXECUTE FUNCTION prm_set_updated_at();

CREATE TRIGGER trg_asign_col_updated
  BEFORE UPDATE ON asignaciones_colegio
  FOR EACH ROW EXECUTE FUNCTION prm_set_updated_at();

-- ── Verificación post-migración ───────────────────────────────────────────────
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recintos_jce'),
    'Tabla recintos_jce no creada';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'colegios_jce'),
    'Tabla colegios_jce no creada';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'asignaciones_recinto'),
    'Tabla asignaciones_recinto no creada';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'asignaciones_colegio'),
    'Tabla asignaciones_colegio no creada';
  RAISE NOTICE '✓ sprint3_schema.sql aplicado correctamente';
END $$;
