#!/usr/bin/env python3
"""Download the trees of Park Południowy from the Wrocław city tree inventory.

Sources:
  * Trees: Zarząd Zieleni Miejskiej (ZZM) tree layer, published on the city
    geoportal (https://geoportal.wroclaw.pl/mapy/zzm/) as an ArcGIS service.
  * Park outline: OpenStreetMap (way 32230185), via the Overpass API.

Writes:
  data/trees.json   compact tree list used by the app and the API
  data/park.json    park outline (GeoJSON polygon) drawn on the map

Run it again any time to refresh the data (only the standard library is needed):
  python3 tools/import_trees.py
"""

from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

PARK_NAME = "Park Południowy"
OSM_WAY_ID = 32230185
TREES_LAYER = "https://gis.zzm.wroc.pl/arcgis/rest/services/zzm_sip_drzewa_wms_wfs/MapServer/3/query"
OVERPASS = "https://overpass-api.de/api/interpreter"
USER_AGENT = "park-game/1.0 (personal hobby project; tree hunt game)"
PAGE_SIZE = 1000

FIELDS = [
    "id_obiektu",
    "nr_arbotag",
    "nazwa_pl",
    "nazwa_lac",
    "gatunek",
    "obw_130",
    "pomnik_przyr",
    "drzewo_szczegolnie_cenne",
    "status",
    "attachment",
]


def http_json(url: str, data: dict | None = None) -> dict:
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.load(res)


def fetch_trees() -> list[dict]:
    features: list[dict] = []
    offset = 0
    while True:
        page = http_json(
            TREES_LAYER,
            {
                "where": f"obiekt_zzm = '{PARK_NAME}'",
                "outFields": ",".join(FIELDS),
                "outSR": "4326",
                "orderByFields": "id",
                "resultOffset": str(offset),
                "resultRecordCount": str(PAGE_SIZE),
                "f": "json",
            },
        )
        if "error" in page:
            raise RuntimeError(f"Tree service error: {page['error']}")
        batch = page.get("features", [])
        features.extend(batch)
        print(f"  trees: {len(features)}", file=sys.stderr)
        if len(batch) < PAGE_SIZE and not page.get("exceededTransferLimit"):
            return features
        offset += len(batch)


def attachment_id(html: str | None) -> str | None:
    # The service returns an <a><img></a> snippet followed by the attachment UUID.
    if not html:
        return None
    tail = html.rsplit(">", 1)[-1].strip()
    return tail or None


def to_int(value: str | None) -> int | None:
    try:
        return int(float(value)) if value not in (None, "") else None
    except ValueError:
        return None


def compact(feature: dict) -> dict | None:
    a = feature["attributes"]
    g = feature.get("geometry") or {}
    if "x" not in g or a.get("status") not in (None, "istniejące"):
        return None
    tree = {
        "id": a["id_obiektu"],
        "lat": round(g["y"], 7),
        "lon": round(g["x"], 7),
        "pl": (a.get("nazwa_pl") or a.get("gatunek") or "drzewo").strip(),
        "la": (a.get("nazwa_lac") or "").strip(),
        "g": (a.get("gatunek") or "").strip(),
        "cm": to_int(a.get("obw_130")),  # trunk circumference at 130 cm, in cm
        "tag": (a.get("nr_arbotag") or "").strip(),  # number on the metal plate on the trunk
        "photo": attachment_id(a.get("attachment")),
    }
    if a.get("pomnik_przyr") == "tak":
        tree["monument"] = True
    if a.get("drzewo_szczegolnie_cenne") == "tak":
        tree["valuable"] = True
    return {k: v for k, v in tree.items() if v not in (None, "")}


def fetch_park() -> dict:
    query = f"[out:json][timeout:60];way({OSM_WAY_ID});out geom;"
    data = http_json(OVERPASS, {"data": query})
    way = data["elements"][0]
    ring = [[round(p["lon"], 6), round(p["lat"], 6)] for p in way["geometry"]]
    return {
        "type": "Feature",
        "properties": {"name": PARK_NAME, "source": f"OpenStreetMap way {OSM_WAY_ID}"},
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)

    print("Downloading trees from the ZZM inventory…", file=sys.stderr)
    trees = [t for t in (compact(f) for f in fetch_trees()) if t]
    ids = [t["id"] for t in trees]
    if len(ids) != len(set(ids)):
        raise RuntimeError("Tree ids (id_obiektu) are not unique – check the source data")
    trees.sort(key=lambda t: t["id"])

    print("Downloading the park outline from OpenStreetMap…", file=sys.stderr)
    park = fetch_park()

    meta = {
        "park": PARK_NAME,
        "source": "Zarząd Zieleni Miejskiej we Wrocławiu – inwentaryzacja drzew (geoportal.wroclaw.pl)",
        "count": len(trees),
    }
    # One tree per line: small diffs when the data is refreshed.
    lines = ",\n".join(json.dumps(t, ensure_ascii=False, separators=(",", ":")) for t in trees)
    (DATA_DIR / "trees.json").write_text(
        '{"meta":' + json.dumps(meta, ensure_ascii=False) + ',"trees":[\n' + lines + "\n]}\n",
        encoding="utf-8",
    )
    (DATA_DIR / "park.json").write_text(json.dumps(park, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(trees)} trees to data/trees.json and the outline to data/park.json", file=sys.stderr)


if __name__ == "__main__":
    main()
