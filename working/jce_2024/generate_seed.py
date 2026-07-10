#!/usr/bin/env python3
"""
Paso 3 - Sprint 3: Genera sprint3_seed.sql desde recintos_nacional.csv.

Estructura del seed:
  1. provincias
  2. municipios
  3. distritos_municipales
  4. recintos_jce
  5. colegios_jce  (un row por código)
  + bloque DO $$ de validación al final

Uso (desde la raíz del proyecto):
  python working/jce_2024/generate_seed.py
"""

import csv
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH  = os.path.join(SCRIPT_DIR, "recintos_nacional.csv")
# El seed va a la raíz del proyecto
OUT_PATH  = os.path.join(SCRIPT_DIR, "..", "..", "sprint3_seed.sql")


def esc(s: str) -> str:
    return (s or "").replace("'", "''")


def title(s: str) -> str:
    """Title-case respetando palabras cortas típicas del español."""
    MINUSCULAS = {"de", "del", "la", "el", "los", "las", "y", "e", "en", "a"}
    words = s.lower().split()
    result = []
    for i, w in enumerate(words):
        if i == 0 or w not in MINUSCULAS:
            result.append(w.capitalize())
        else:
            result.append(w)
    return " ".join(result)


def main():
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: CSV no encontrado: {CSV_PATH}")
        print("Ejecutá primero: python working/jce_2024/extract.py")
        raise SystemExit(1)

    rows: list[dict] = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(row)

    print(f"Filas leídas: {len(rows)}")

    # Colecciones ordenadas por primera aparición
    provincias: list[str] = []
    seen_prov: set[str] = set()

    municipios: list[tuple[str, str]] = []  # (prov_upper, muni_upper)
    seen_muni: set[tuple[str, str]] = set()

    distritos: list[tuple[str, str, str]] = []  # (prov, muni, dist)
    seen_dist: set[tuple[str, str, str]] = set()

    recintos: list[dict] = []

    for row in rows:
        prov  = row["provincia"].strip().upper()
        muni  = row["municipio"].strip().upper()
        dist  = row["distrito_municipal"].strip().upper()
        nombre   = row["recinto_nombre"].strip()
        direccion = row["recinto_direccion"].strip()
        sector   = row["sector"].strip()
        colegios_raw = row["colegios_lista"].strip()

        if prov and prov not in seen_prov:
            seen_prov.add(prov)
            provincias.append(prov)
        if muni and (prov, muni) not in seen_muni:
            seen_muni.add((prov, muni))
            municipios.append((prov, muni))
        if dist and (prov, muni, dist) not in seen_dist:
            seen_dist.add((prov, muni, dist))
            distritos.append((prov, muni, dist))

        colegios = [c.strip() for c in colegios_raw.split(",") if c.strip()] if colegios_raw else []
        recintos.append({
            "provincia": prov,
            "municipio": muni,
            "distrito":  dist,
            "nombre":    nombre,
            "direccion": direccion,
            "sector":    sector,
            "colegios":  colegios,
        })

    lines: list[str] = [
        "-- ============================================================",
        "-- sprint3_seed.sql — Catálogo JCE Elecciones Mayo 2024",
        "-- Generado por working/jce_2024/generate_seed.py",
        "-- Re-ejecutable (ON CONFLICT DO NOTHING)",
        "-- ============================================================",
        "",
    ]

    # ── 1. Provincias ──────────────────────────────────────────────────────────
    lines.append("-- 1. Provincias -------------------------------------------------------")
    for prov in provincias:
        lines.append(
            f"INSERT INTO provincias (nombre) VALUES ('{esc(title(prov))}')"
            f" ON CONFLICT (nombre) DO NOTHING;"
        )

    # ── 2. Municipios ──────────────────────────────────────────────────────────
    lines.append("")
    lines.append("-- 2. Municipios -------------------------------------------------------")
    for (prov, muni) in municipios:
        lines.append(
            f"INSERT INTO municipios (provincia_id, nombre)"
            f" SELECT p.id, '{esc(title(muni))}'"
            f" FROM provincias p WHERE p.nombre = '{esc(title(prov))}'"
            f" ON CONFLICT (provincia_id, nombre) DO NOTHING;"
        )

    # ── 3. Distritos municipales ───────────────────────────────────────────────
    lines.append("")
    lines.append("-- 3. Distritos municipales -------------------------------------------")
    for (prov, muni, dist) in distritos:
        lines.append(
            f"INSERT INTO distritos_municipales (municipio_id, nombre)"
            f" SELECT m.id, '{esc(title(dist))}'"
            f" FROM municipios m"
            f" JOIN provincias p ON p.id = m.provincia_id"
            f" WHERE p.nombre = '{esc(title(prov))}'"
            f"   AND m.nombre = '{esc(title(muni))}'"
            f" ON CONFLICT (municipio_id, nombre) DO NOTHING;"
        )

    # ── 4. Recintos ────────────────────────────────────────────────────────────
    lines.append("")
    lines.append("-- 4. Recintos JCE -----------------------------------------------------")
    for r in recintos:
        if r["distrito"]:
            dist_sub = (
                f"(SELECT dm.id FROM distritos_municipales dm"
                f" JOIN municipios mx ON mx.id = dm.municipio_id"
                f" JOIN provincias px ON px.id = mx.provincia_id"
                f" WHERE px.nombre = '{esc(title(r['provincia']))}'"
                f"   AND mx.nombre = '{esc(title(r['municipio']))}'"
                f"   AND dm.nombre = '{esc(title(r['distrito']))}')"
            )
        else:
            dist_sub = "NULL"

        lines.append(
            f"INSERT INTO recintos_jce"
            f" (provincia_id, municipio_id, distrito_municipal_id, nombre, direccion, sector)"
            f" SELECT p.id, m.id, {dist_sub},"
            f" '{esc(r['nombre'])}', '{esc(r['direccion'])}', '{esc(r['sector'])}'"
            f" FROM provincias p"
            f" JOIN municipios m ON m.provincia_id = p.id"
            f" WHERE p.nombre = '{esc(title(r['provincia']))}'"
            f"   AND m.nombre = '{esc(title(r['municipio']))}'"
            f" ON CONFLICT (municipio_id, nombre) DO NOTHING;"
        )

    # ── 5. Colegios ────────────────────────────────────────────────────────────
    lines.append("")
    lines.append("-- 5. Colegios JCE (un row por código) ---------------------------------")
    for r in recintos:
        if not r["colegios"]:
            continue
        for codigo in r["colegios"]:
            lines.append(
                f"INSERT INTO colegios_jce (recinto_id, codigo)"
                f" SELECT rj.id, '{esc(codigo)}'"
                f" FROM recintos_jce rj"
                f" JOIN municipios m ON m.id = rj.municipio_id"
                f" JOIN provincias p ON p.id = m.provincia_id"
                f" WHERE p.nombre = '{esc(title(r['provincia']))}'"
                f"   AND m.nombre = '{esc(title(r['municipio']))}'"
                f"   AND rj.nombre = '{esc(r['nombre'])}'"
                f" ON CONFLICT (recinto_id, codigo) DO NOTHING;"
            )

    # ── Validación ─────────────────────────────────────────────────────────────
    lines += [
        "",
        "-- Validación ----------------------------------------------------------",
        "DO $$",
        "BEGIN",
        "  ASSERT (SELECT COUNT(*) FROM recintos_jce) = 4286,",
        "    'Conteo de recintos no coincide con 4286';",
        "  ASSERT (SELECT COUNT(*) FROM colegios_jce) >= 16700,",
        "    'Conteo de colegios no coincide (esperado >= 16700)';",
        "  RAISE NOTICE '✓ Seed JCE 2024 aplicado correctamente';",
        "END $$;",
        "",
    ]

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    total_colegios = sum(len(r["colegios"]) for r in recintos)
    print(f"✓ Seed generado: {os.path.normpath(OUT_PATH)}")
    print(f"  {len(provincias)} provincias")
    print(f"  {len(municipios)} municipios")
    print(f"  {len(distritos)} distritos municipales")
    print(f"  {len(recintos)} recintos")
    print(f"  {total_colegios} colegios")


if __name__ == "__main__":
    main()
