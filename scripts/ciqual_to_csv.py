"""
Convertit la table Ciqual (ANSES, fichier XLSX officiel) en CSV pour la table
Supabase `ciqual_foods` (alim_code, name_fr, group_name, kcal_100g).

Source : Table de composition nutritionnelle des aliments Ciqual 2025, ANSES,
Licence Ouverte Etalab 2.0 — https://doi.org/10.57745/RDMHWY

Usage :
    python scripts/ciqual_to_csv.py "Table Ciqual 2025_FR_2025_11_03.xlsx" supabase/seed/ciqual_foods.csv

N'utilise que la bibliothèque standard Python (un XLSX est un zip de fichiers XML).
"""

import csv
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def column_index(ref: str) -> int:
    """'C12' -> 2"""
    letters = re.match(r"[A-Z]+", ref).group(0)
    index = 0
    for ch in letters:
        index = index * 26 + (ord(ch) - 64)
    return index - 1


def read_rows(path: str, sheet_name: str | None = None):
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))

        # Feuille : la première, ou celle demandée par son nom
        workbook = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        targets = {r.get("Id"): r.get("Target") for r in rels}
        sheets = workbook.find("m:sheets", NS)
        chosen = sheets[0]
        if sheet_name:
            chosen = next(s for s in sheets if s.get("name") == sheet_name)
        target = targets[chosen.get(REL_NS)].lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target

        root = ET.fromstring(z.read(target))
        for row in root.iter(f"{{{NS['m']}}}row"):
            values = {}
            for cell in row.findall("m:c", NS):
                v = cell.find("m:v", NS)
                if cell.get("t") == "s" and v is not None:
                    text = shared[int(v.text)]
                elif cell.get("t") == "inlineStr":
                    text = "".join(t.text or "" for t in cell.iter(f"{{{NS['m']}}}t"))
                else:
                    text = v.text if v is not None else ""
                values[column_index(cell.get("r"))] = text
            if values:
                yield [values.get(i, "") for i in range(max(values) + 1)]


def parse_kcal(raw: str) -> str:
    """Valeurs Ciqual : '123,4', 'traces', '< 0,5', '-' (non disponible)."""
    s = (raw or "").strip().replace(",", ".")
    if not s or s == "-":
        return ""
    if s.lower() == "traces":
        return "0"
    s = s.lstrip("<").strip()
    try:
        value = float(s)
    except ValueError:
        return ""
    return f"{value:g}"


def clean(text: str) -> str:
    """Espaces et retours à la ligne superflus (fréquents dans le fichier Excel)."""
    return " ".join((text or "").split())


def find_column(header: list[str], *patterns: str) -> int:
    for i, name in enumerate(header):
        if all(p.lower() in name.lower() for p in patterns):
            return i
    raise SystemExit(f"Colonne introuvable : {patterns}\nEn-têtes : {header}")


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    source, destination = sys.argv[1], sys.argv[2]

    rows = read_rows(source)
    header = next(rows)
    col_code = find_column(header, "alim_code")
    col_name = find_column(header, "alim_nom_fr")
    col_group = find_column(header, "alim_ssgrp_nom_fr")
    # Énergie « Règlement UE N° 1169/2011 » en kcal/100 g
    col_kcal = find_column(header, "1169", "kcal")

    seen = set()
    written = 0
    with open(destination, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["alim_code", "name_fr", "group_name", "kcal_100g"])
        for row in rows:
            code = clean(row[col_code] if col_code < len(row) else "")
            name = clean(row[col_name] if col_name < len(row) else "")
            if not code or not name or code in seen:
                continue
            seen.add(code)
            group = clean(row[col_group] if col_group < len(row) else "")
            if group in ("", "-"):
                group = ""
            kcal = parse_kcal(row[col_kcal] if col_kcal < len(row) else "")
            writer.writerow([int(float(code)), name, group, kcal])
            written += 1

    print(f"{written} aliments écrits dans {destination}")


if __name__ == "__main__":
    main()
