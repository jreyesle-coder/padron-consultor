-- ============================================================
-- Sprint 1 Hotfix — Optimistic Concurrency Control
-- Agregar updated_at + trigger auto-update a las tablas de
-- escritura offline: colaboradores_campo y lideres_campo
-- ============================================================

-- ── 1. Columnas updated_at ───────────────────────────────────
ALTER TABLE colaboradores_campo
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE lideres_campo
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Filas existentes: asignar timestamp actual
-- (DEFAULT NOW() ya lo hace para nuevas filas; esto cubre las viejas)
UPDATE colaboradores_campo
   SET updated_at = NOW()
 WHERE updated_at = '1970-01-01 00:00:00+00'
    OR updated_at IS NULL;

UPDATE lideres_campo
   SET updated_at = NOW()
 WHERE updated_at = '1970-01-01 00:00:00+00'
    OR updated_at IS NULL;

-- ── 2. Función trigger compartida ───────────────────────────
CREATE OR REPLACE FUNCTION prm_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Triggers BEFORE UPDATE ───────────────────────────────
DROP TRIGGER IF EXISTS trg_updated_at_colaboradores ON colaboradores_campo;
CREATE TRIGGER trg_updated_at_colaboradores
  BEFORE UPDATE ON colaboradores_campo
  FOR EACH ROW EXECUTE FUNCTION prm_set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_lideres ON lideres_campo;
CREATE TRIGGER trg_updated_at_lideres
  BEFORE UPDATE ON lideres_campo
  FOR EACH ROW EXECUTE FUNCTION prm_set_updated_at();

-- ── 4. Verificación ─────────────────────────────────────────
DO $$
BEGIN
  ASSERT (
    SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'colaboradores_campo' AND column_name = 'updated_at'
  ) = 1, 'updated_at falta en colaboradores_campo';

  ASSERT (
    SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'lideres_campo' AND column_name = 'updated_at'
  ) = 1, 'updated_at falta en lideres_campo';

  RAISE NOTICE 'sprint1_hotfix.sql aplicado correctamente';
END;
$$;
