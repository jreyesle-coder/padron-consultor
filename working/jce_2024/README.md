# JCE Dataset — Instrucciones de importación

Fuente: "Relación de Recintos y Colegios Electorales" (PDF oficial JCE)

## Estructura del directorio

```
working/jce_2024/
  extract.py          — Lee el PDF y genera los CSVs
  generate_seed.py    — Lee recintos_nacional.csv y genera sprint3_seed.sql
  requirements.txt    — Dependencias Python
  recintos_nacional.csv  (generado) — 4,286 recintos nacionales
  exterior.csv           (generado) — recintos del exterior (no se importan)
```

## Primera vez (Sprint 3 · Mayo 2024)

```bash
# 1. Instalar dependencias
pip install -r working/jce_2024/requirements.txt

# 2. Extraer datos del PDF
#    (el PDF debe estar en ~/Downloads/ o ajustar PDF_PATH en extract.py)
python working/jce_2024/extract.py

# 3. Generar el seed SQL
python working/jce_2024/generate_seed.py

# 4. Aplicar el schema en Supabase SQL Editor
#    → sprint3_schema.sql

# 5. Aplicar el seed en Supabase SQL Editor
#    → sprint3_seed.sql
#    El bloque DO $$ al final valida que los totales sean correctos.
```

## Para las elecciones 2028 (re-importación)

1. Bajar el nuevo PDF de recintos/colegios de la JCE.
2. Reemplazar el PDF en `~/Downloads/` (o actualizar `PDF_PATH` en `extract.py`).
3. Repetir pasos 2 y 3 anteriores.
4. Antes de ejecutar el seed nuevo, limpiar las tablas del catálogo:

```sql
-- ⚠️ Ejecutar solo si se va a reimportar todo el catálogo
TRUNCATE colegios_jce CASCADE;  -- también limpia asignaciones_colegio
TRUNCATE recintos_jce CASCADE;
TRUNCATE distritos_municipales CASCADE;
TRUNCATE municipios CASCADE;
TRUNCATE provincias CASCADE;
```

5. Ejecutar `sprint3_seed.sql` con los nuevos datos.
6. Verificar los totales: `SELECT COUNT(*) FROM recintos_jce;`

## Notas técnicas

- Los códigos de colegio como `0662A` indican una mesa adicional (turno B)
  en el mismo colegio físico. Se almacenan como filas independientes en
  `colegios_jce` y se pueden filtrar con `WHERE codigo ~ '^[0-9]+$'`
  para obtener solo colegios sin sufijo letra.
- Las asignaciones operativas (`asignaciones_recinto`, `asignaciones_colegio`)
  NO se borran en la re-importación si los IDs de `recintos_jce` se preservan.
  Si se hace TRUNCATE, las asignaciones quedan huérfanas y hay que re-asignar.
- El campo `padron_electoral.colegio` contiene el código que se cruza con
  `colegios_jce.codigo` para el autocompletado de cédula en captación.
