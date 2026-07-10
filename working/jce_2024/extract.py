#!/usr/bin/env python3
"""
Paso 1 - Sprint 3: Extraer dataset JCE desde PDF oficial.

Genera:
  working/jce_2024/recintos_nacional.csv  (4,286 recintos nacionales)
  working/jce_2024/exterior.csv           (372 recintos del exterior)

Uso:
  pip install pdfplumber
  python working/jce_2024/extract.py
"""

import csv
import os
import re
import sys

import pdfplumber

PDF_PATH = os.path.join(
    os.path.expanduser("~"),
    "Downloads",
    "RELACIÓN DE RECINTOS Y COLEGIOS ELECTORALES.pdf",
)
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Las 32 provincias de RD (formas normalizadas, sin tildes para comparar)
PROVINCIAS_RD = {
    "AZUA", "BAHORUCO", "BARAHONA", "DAJABON", "DISTRITO NACIONAL",
    "DUARTE", "ELIAS PINA", "EL SEIBO", "ESPAILLAT", "HATO MAYOR",
    "HERMANAS MIRABAL", "INDEPENDENCIA", "LA ALTAGRACIA", "LA ROMANA",
    "LA VEGA", "MARIA TRINIDAD SANCHEZ", "MONSENOR NOUEL", "MONTE CRISTI",
    "MONTE PLATA", "PEDERNALES", "PERAVIA", "PUERTO PLATA", "SAMANA",
    "SANCHEZ RAMIREZ", "SAN CRISTOBAL", "SAN JOSE DE OCOA", "SAN JUAN",
    "SAN PEDRO DE MACORIS", "SANTIAGO", "SANTIAGO RODRIGUEZ",
    "SANTO DOMINGO", "VALVERDE",
}

HEADER_MARKERS = {"PROVINCIA", "MUNICIPIO", "RECINTO", "COLEGIO", "COLEGIOS", "SECTOR"}
FIELDNAMES = [
    "provincia", "municipio", "distrito_municipal",
    "recinto_nombre", "recinto_direccion", "sector", "colegios_lista",
]


def normalize(s: str) -> str:
    """Quita tildes y convierte a mayúsculas para comparar."""
    s = s.upper()
    for a, b in [("Á", "A"), ("É", "E"), ("Í", "I"), ("Ó", "O"), ("Ú", "U"), ("Ñ", "N")]:
        s = s.replace(a, b)
    return s


def clean(val) -> str:
    if val is None:
        return ""
    return re.sub(r"\s+", " ", str(val)).strip()


def parse_colegios(raw: str) -> list[str]:
    if not raw:
        return []
    return [c.strip() for c in raw.split(",") if c.strip()]


def is_header_row(row: list) -> bool:
    cells = {normalize(clean(c)) for c in row if c}
    return bool(HEADER_MARKERS & cells)


def is_exterior(provincia: str) -> bool:
    p = normalize(clean(provincia))
    return "EXTERIOR" in p or ("DEL PAIS" in p) or ("EXTRANJERO" in p)


def is_nacional(provincia: str) -> bool:
    p = normalize(clean(provincia))
    return p in PROVINCIAS_RD


def extract_tables_robust(page) -> list[list]:
    """Intenta múltiples estrategias de extracción de tablas."""
    for settings in [
        {"vertical_strategy": "lines", "horizontal_strategy": "lines",
         "snap_tolerance": 3, "join_tolerance": 3, "edge_min_length": 3},
        {"vertical_strategy": "lines", "horizontal_strategy": "lines",
         "snap_tolerance": 6, "join_tolerance": 6, "edge_min_length": 2},
        {"vertical_strategy": "text", "horizontal_strategy": "lines",
         "snap_tolerance": 5},
        {"vertical_strategy": "lines", "horizontal_strategy": "text",
         "snap_tolerance": 5},
    ]:
        tables = page.extract_tables(settings)
        if tables:
            # Retorna la tabla más grande de la página
            return max(tables, key=len)
    return []


def extract_from_pdf(pdf_path: str):
    nacional: list[dict] = []
    exterior_list: list[dict] = []

    cur_provincia = ""
    cur_municipio = ""
    cur_distrito = ""
    in_exterior = False

    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        for page_num, page in enumerate(pdf.pages, 1):
            print(f"  Página {page_num}/{total_pages}...", end=" ", flush=True)
            rows = extract_tables_robust(page)

            if not rows:
                print("sin tabla")
                continue

            page_count = 0
            for row in rows:
                if not row:
                    continue
                # Normalizar a exactamente 7 columnas
                row = list(row) + [None] * max(0, 7 - len(row))
                row = row[:7]

                if all(c is None or clean(c) == "" for c in row):
                    continue
                if is_header_row(row):
                    continue

                provincia_raw = clean(row[0])
                municipio_raw = clean(row[1])
                distrito_raw  = clean(row[2])
                recinto_raw   = clean(row[3])
                direccion_raw = clean(row[4])
                sector_raw    = clean(row[5])
                colegios_raw  = clean(row[6])

                # Carry-forward: si la celda no está vacía, actualizar contexto
                if provincia_raw:
                    cur_provincia = provincia_raw
                    in_exterior = is_exterior(provincia_raw)
                if municipio_raw:
                    cur_municipio = municipio_raw
                # Resetear municipio al cambiar provincia
                if provincia_raw and not municipio_raw:
                    cur_municipio = ""
                if distrito_raw:
                    cur_distrito = distrito_raw

                # Las filas de datos reales tienen recinto o colegios
                if not recinto_raw and not colegios_raw:
                    continue

                # Si es continuación de dirección (sin recinto nuevo) agregar a la anterior
                if not recinto_raw and colegios_raw:
                    if nacional and not in_exterior:
                        existing = nacional[-1]["colegios_lista"]
                        extra = ",".join(parse_colegios(colegios_raw))
                        nacional[-1]["colegios_lista"] = (
                            existing + ("," if existing else "") + extra
                        )
                    elif exterior_list and in_exterior:
                        existing = exterior_list[-1]["colegios_lista"]
                        extra = ",".join(parse_colegios(colegios_raw))
                        exterior_list[-1]["colegios_lista"] = (
                            existing + ("," if existing else "") + extra
                        )
                    continue

                colegios = parse_colegios(colegios_raw)
                record = {
                    "provincia":          cur_provincia,
                    "municipio":          cur_municipio,
                    "distrito_municipal": cur_distrito,
                    "recinto_nombre":     recinto_raw,
                    "recinto_direccion":  direccion_raw,
                    "sector":             sector_raw,
                    "colegios_lista":     ",".join(colegios),
                }

                if in_exterior:
                    exterior_list.append(record)
                else:
                    nacional.append(record)
                    page_count += 1

            print(f"{page_count} recintos nacionales")

    return nacional, exterior_list


def write_csv(records: list[dict], path: str):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES)
        w.writeheader()
        w.writerows(records)


def main():
    print(f"PDF: {PDF_PATH}")
    if not os.path.exists(PDF_PATH):
        print(f"ERROR: PDF no encontrado en {PDF_PATH}", file=sys.stderr)
        print("Ajusta PDF_PATH en el script si el archivo está en otra ubicación.", file=sys.stderr)
        sys.exit(1)

    print("Extrayendo tablas...\n")
    nacional, exterior = extract_from_pdf(PDF_PATH)

    nac_path = os.path.join(OUT_DIR, "recintos_nacional.csv")
    ext_path = os.path.join(OUT_DIR, "exterior.csv")
    write_csv(nacional, nac_path)
    write_csv(exterior, ext_path)

    total_colegios_nac = sum(
        len([c for c in r["colegios_lista"].split(",") if c.strip()])
        for r in nacional
    )

    print(f"\n{'='*50}")
    print(f"Recintos nacional : {len(nacional)}")
    print(f"Colegios nacional : {total_colegios_nac}")
    print(f"Recintos exterior : {len(exterior)}")
    print(f"{'='*50}\n")

    errors: list[str] = []
    if len(nacional) != 4286:
        errors.append(
            f"Recintos nacional: esperado 4286, obtenido {len(nacional)}"
        )
    if not (16700 <= total_colegios_nac <= 16800):
        errors.append(
            f"Colegios nacional: esperado ~16726, obtenido {total_colegios_nac}"
        )

    if errors:
        print("ERROR: Los totales no coinciden:", file=sys.stderr)
        for e in errors:
            print(f"  ✗ {e}", file=sys.stderr)
        print(
            "\nRevisar el PDF manualmente y ajustar la lógica de parsing.",
            file=sys.stderr,
        )
        sys.exit(1)

    print("✓ Totales validados.")
    print(f"✓ {nac_path}")
    print(f"✓ {ext_path}")


if __name__ == "__main__":
    main()
