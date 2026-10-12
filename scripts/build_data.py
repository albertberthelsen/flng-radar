"""
Build the static datasets behind the Leads and Projects views.

  uv run --with openpyxl python scripts/build_data.py

Sources (both free, both large, so they are reduced here instead of fetched live):
  1. Global Energy Monitor, Global Gas Infrastructure Tracker (CC BY 4.0).
     Every LNG export and import terminal with status, owners and capacity.
  2. World Bank Global Flaring and Methane Reduction Partnership, flare volume
     estimates by individual flare location 2012 to 2025, from VIIRS satellite data.

Output in data/: terminals.json, flares.json, leads.json
"""

import json
import re
import math
import urllib.request
from collections import defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
OUT = ROOT / "data"
CACHE.mkdir(exist_ok=True)
OUT.mkdir(exist_ok=True)

COAST_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_coastline.geojson"
GEM_URL = "https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/interim_maps/ggit-lng_map_2025-11.geojson"
FLARE_URL = ("https://thedocs.worldbank.org/en/doc/b34e0c054bb3fe3695e70154c28eef3f-0400072026/"
             "related/Flare-Volume-Estimates-by-individual-Flare-Location-2012-2025.xlsx")

# Countries where a Norwegian listed company cannot realistically do business today.
SANCTIONED = {"Iran", "Russia", "Venezuela", "Syria", "North Korea", "Cuba", "Myanmar"}
MMSCFD_PER_MTPA = 145
CLUSTER_KM = 75      # flares within this distance of each other form one lead
COAST_KM = 150       # onshore gas further inland than this is not a realistic FLNG feed
MIN_LEAD_MMSCFD = 25
MIN_SITE_MMSCFD = 1  # ignore tiny flares on the map


def fetch(url, name):
    path = CACHE / name
    if not path.exists():
        print(f"Downloading {name}")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as r, open(path, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
    return path


def km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def fix(t):
    """Some names in the flaring file are UTF-8 read as Latin-1 (BoquerÃ³n)."""
    if not isinstance(t, str):
        return t
    try:
        return t.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return t


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None

# ---------------------------------------------------------------- terminals

def build_terminals():
    gem = json.load(open(fetch(GEM_URL, "ggit.geojson")))
    out = []
    for f in gem["features"]:
        p = f["properties"]
        kind = {"LNG export terminal": "export", "LNG import terminal": "import"}.get(p.get("tracker-display"))
        if not kind or not f.get("geometry") or f["geometry"]["type"] != "Point":
            continue
        if p["status"] in ("retired", "cancelled"):
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        text = f"{p.get('name', '')} {p.get('unit-name', '')}"
        out.append({
            "n": p.get("name", ""),
            "u": p.get("unit-name") or "",
            "k": kind,
            "s": p["status"],
            "c": p.get("country-area1", ""),
            "o": p.get("owner", ""),
            "p": p.get("parent", ""),
            "cap": num(p.get("capacity")),
            "y": p.get("start-year") or "",
            "fl": bool(re.search(r"FLNG|floating", text, re.I)),
            "url": p.get("url", ""),
            "x": round(lon, 3), "y2": round(lat, 3),
        })
    print(f"Terminals: {len(out)}")
    return out

# ---------------------------------------------------------------- flares

def build_flares():
    wb = openpyxl.load_workbook(fetch(FLARE_URL, "flares.xlsx"), read_only=True)
    ws = wb["Dashboard_file"]  # long format: one row per site and year
    sites = {}
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if i == 0 or not r[0]:
            continue
        sid, lat, lon, country, bcm, mmscfd, year, ftype, op, field, loc = r[:11]
        op, field, country = fix(op), fix(field), fix(country)
        if year not in (2021, 2025):
            continue
        s = sites.setdefault(sid, {
            "x": round(lon, 3), "y": round(lat, 3), "c": country,
            "t": ftype if ftype != "NA" else "", "f": field if field != "NA" else "",
            "op": op if op != "NA" else "", "off": loc == "OFFSHORE", "q": 0.0, "q21": 0.0,
        })
        s["q" if year == 2025 else "q21"] = round(mmscfd or 0, 1)
    out = [s for s in sites.values() if s["q"] >= MIN_SITE_MMSCFD]
    print(f"Flare sites over {MIN_SITE_MMSCFD} MMscf/d in 2025: {len(out)}, total {sum(s['q'] for s in out):,.0f} MMscf/d")
    return out


# ---------------------------------------------------------------- leads

def coast_points():
    """Coastline vertices on a 0.5 degree grid, for a fast nearest-coast lookup."""
    grid = defaultdict(list)
    for f in json.load(open(fetch(COAST_URL, "coast.geojson")))["features"]:
        g = f["geometry"]
        lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        for line in lines:
            for lon, lat in line:
                grid[(int(lon // 2), int(lat // 2))].append((lon, lat))
    return grid


def coast_km(grid, x, y):
    gx, gy = int(x // 2), int(y // 2)
    best = 1e9
    for r in range(0, 6):
        for i in range(gx - r, gx + r + 1):
            for j in range(gy - r, gy + r + 1):
                if max(abs(i - gx), abs(j - gy)) != r:
                    continue
                for p in grid.get((i, j), ()):
                    best = min(best, km((x, y), p))
        if best < (r * 2) * 111:
            break
    return best


def build_leads(sites, terminals):
    """Cluster flares near the coast: biggest flare first, absorb neighbours within CLUSTER_KM."""
    grid = coast_points()
    pool = []
    for s in sites:
        d = 0 if s["off"] else coast_km(grid, s["x"], s["y"])
        if d <= COAST_KM:
            pool.append({**s, "coast": d})
    pool.sort(key=lambda s: -s["q"])
    used = [False] * len(pool)
    exports = [t for t in terminals if t["k"] == "export" and t["s"] in ("operating", "construction")]
    leads = []
    for i, s in enumerate(pool):
        if used[i]:
            continue
        members = []
        for j in range(i, len(pool)):
            if not used[j] and km((s["x"], s["y"]), (pool[j]["x"], pool[j]["y"])) <= CLUSTER_KM:
                used[j] = True
                members.append(pool[j])
        q = sum(m["q"] for m in members)
        if q < MIN_LEAD_MMSCFD:
            continue
        q21 = sum(m["q21"] for m in members)
        cx = sum(m["x"] * m["q"] for m in members) / q
        cy = sum(m["y"] * m["q"] for m in members) / q
        near = min(exports, key=lambda t: km((cx, cy), (t["x"], t["y2"])))
        fields, ops, countries = defaultdict(float), defaultdict(float), defaultdict(float)
        for m in members:
            countries[m["c"]] += m["q"]
            if m["f"]:
                fields[m["f"]] += m["q"]
            if m["op"]:
                ops[m["op"]] += m["q"]
        top = lambda d, n: [k for k, _ in sorted(d.items(), key=lambda kv: -kv[1])[:n]]
        main = top(countries, 1)[0]
        leads.append({
            "x": round(cx, 3), "y": round(cy, 3), "c": main, "cs": top(countries, 3),
            "q": round(q, 1), "q21": round(q21, 1), "n": len(members),
            "off": round(sum(m["q"] for m in members if m["off"]) / q, 2),
            "coast": round(sum(m["coast"] * m["q"] for m in members) / q),
            "mtpa": round(q / MMSCFD_PER_MTPA, 2),
            "fields": top(fields, 4), "ops": top(ops, 3),
            "near": near["n"], "nearKm": round(km((cx, cy), (near["x"], near["y2"]))),
            "sanc": main in SANCTIONED,
        })
    leads.sort(key=lambda l: -l["q"])
    print(f"Coastal leads over {MIN_LEAD_MMSCFD} MMscf/d: {len(leads)}")
    return leads


if __name__ == "__main__":
    terminals = build_terminals()
    sites = build_flares()
    leads = build_leads(sites, terminals)
    for name, data in [("terminals", terminals), ("flares", sites), ("leads", leads)]:
        path = OUT / f"{name}.json"
        path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
        print(f"Wrote data/{name}.json ({path.stat().st_size // 1024} KB)")
    print("\nTop 15 coastal leads")
    for l in leads[:15]:
        flag = " (sanctioned)" if l["sanc"] else ""
        l_off = f"{l['off']*100:.0f}% offshore, {l['coast']} km to coast"
        print(f"{l['q']:>7.0f} MMscf/d  {l['mtpa']:>5.2f} MTPA  {l['c']}{flag}  {', '.join(l['fields'][:2]) or '?'}  [{l_off}]  ops: {', '.join(l['ops'][:2]) or '?'}  nearest LNG: {l['near']} {l['nearKm']} km")
