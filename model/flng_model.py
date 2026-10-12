"""
FLNG #4: what is it worth to Golar, and where should it go?

Two parts:
  1. Charter economics for a 3.5 MTPA MKII unit (capex, EBITDA, payback, IRR,
     commodity upside), built on the terms Golar disclosed for FLNG Esperanza.
  2. A weighted screen of possible homes for the unit.

Run:  python3 model/flng_model.py
Writes case/data.js, which the case page reads. Edit numbers here, not there.

Sources: Golar LNG Q2 2026 interim results (13 Aug 2026) and earnings call.
Screen scores are my own judgement, explained in the notes field.
"""

import json
from pathlib import Path

# ---------------------------------------------------------------- inputs

FLEET = [
    # name, design, capacity (MTPA), status, contract
    {"name": "Hilli", "design": "MKI", "mtpa": 2.45, "status": "In Singapore for upgrade",
     "contract": "SESA, Argentina. 20 years from 2027. $285M EBITDA a year plus commodity upside."},
    {"name": "Gimi", "design": "MKI", "mtpa": 2.7, "status": "Operating, GTA field",
     "contract": "bp, Mauritania/Senegal. 20 years. Golar owns 70%. Q2 2026 day rate 15% above contract."},
    {"name": "Esperanza", "design": "MKII", "mtpa": 3.5, "status": "74% built, CIMC Raffles",
     "contract": "SESA, Argentina. 20 years from H2 2028. $400M EBITDA a year plus commodity upside."},
    {"name": "FLNG #4", "design": "MKII", "mtpa": 3.5, "status": "Ordered Aug 2026, hull (Grace Dahlia) bought Oct 2026, delivery end 2029",
     "contract": "Open. Golar is negotiating with several possible charterers."},
]

KEY_NUMBERS = {
    "q2_adj_ebitda_musd": 127.4,
    "q2_net_income_musd": 38.3,
    "cash_musd": 908,
    "net_debt_musd": 1800,
    "shares_m": 102.1,
    "dividend_q_usd": 0.25,
    "ebitda_backlog_busd": 17,
    "upside_per_usd_mmbtu_musd": 100,  # Hilli + Esperanza + 10% of SESA, above $8 FOB
    "hilli_cargoes_cameroon": 156,
}

UNIT = {
    "capex_musd": 2450,          # FLNG #4 fully delivered cost
    "base_ebitda_musd": 400,     # if chartered on Esperanza terms
    "contract_years": 20,
    "capex_by_year": {2026: 0.15, 2027: 0.30, 2028: 0.30, 2029: 0.25},  # assumed phasing
    "first_ebitda_year": 2030,
    "tariff_share": 0.25,        # Golar keeps 25% of FOB price above threshold
    "threshold_usd_mmbtu": 8.0,
    "upside_per_usd_musd": 40,   # Golar guidance for Esperanza
    "cpi_share": 0.30,           # 30% of US CPI from year 6
    "cpi": 0.025,
}

# Rule of thumb: 1 MTPA of LNG needs roughly 145 MMscf/d of feed gas incl. fuel.
MMSCFD_PER_MTPA = 145

# ---------------------------------------------------------------- economics

def irr(cashflows, lo=-0.5, hi=1.0):
    def npv(r):
        return sum(cf / (1 + r) ** t for t, cf in enumerate(cashflows))
    for _ in range(200):
        mid = (lo + hi) / 2
        if npv(mid) > 0:
            lo = mid
        else:
            hi = mid
    return mid


def cashflows(u, fob=8.0):
    """Unlevered cash flows to Golar by year, before tax (Golar is Bermuda based)."""
    years = range(min(u["capex_by_year"]), u["first_ebitda_year"] + u["contract_years"])
    upside = max(0.0, fob - u["threshold_usd_mmbtu"]) * u["upside_per_usd_musd"]
    out = []
    for y in years:
        cf = -u["capex_musd"] * u["capex_by_year"].get(y, 0)
        k = y - u["first_ebitda_year"]
        if k >= 0:
            infl = (1 + u["cpi"] * u["cpi_share"]) ** max(0, k - 4)
            cf += u["base_ebitda_musd"] * infl + upside
        out.append((y, cf))
    return out


def summary(u, fob):
    cfs = cashflows(u, fob)
    flows = [c for _, c in cfs]
    cum, payback = 0, None
    for y, c in cfs:
        cum += c
        if payback is None and cum >= 0:
            payback = y
    first = u["base_ebitda_musd"] + max(0, fob - u["threshold_usd_mmbtu"]) * u["upside_per_usd_musd"]
    return {
        "fob": fob,
        "year1_ebitda": round(first),
        "capex_to_ebitda": round(u["capex_musd"] / first, 1),
        "irr": round(irr(flows) * 100, 1),
        "payback_year": payback,
        "contract_ebitda_busd": round(sum(c for c in flows if c > 0) / 1000, 1),
    }

# ---------------------------------------------------------------- screen

CRITERIA = [
    {"key": "gas",      "label": "Gas fits a 3.5 MTPA unit", "weight": 25},
    {"key": "timing",   "label": "Timing fits 2029 delivery", "weight": 20},
    {"key": "buyer",    "label": "Charterer credit", "weight": 20},
    {"key": "edge",     "label": "Golar's edge", "weight": 20},
    {"key": "risk",     "label": "Country and concentration risk (5 = low)", "weight": 15},
]

CANDIDATES = [
    {
        "name": "GTA Phase 2", "where": "Mauritania / Senegal", "partner": "bp, Kosmos, Petrosen, SMH",
        "scores": {"gas": 4, "timing": 4, "buyer": 5, "edge": 5, "risk": 3},
        "notes": "Partners are studying a gravity based structure for 2.5 to 3 MTPA. Gimi already works "
                 "on the same field and is beating its contract by 15%, so Golar can offer a known unit "
                 "faster than a GBS can be built. The two host states are still negotiating terms.",
    },
    {
        "name": "SESA expansion", "where": "Argentina", "partner": "PAE, YPF, Pampa, Harbour",
        "scores": {"gas": 5, "timing": 4, "buyer": 3, "edge": 5, "risk": 2},
        "notes": "Vaca Muerta has the gas and SESA's offtake tender drew demand beyond the 2 MTPA sold to "
                 "SEFE. Golar is already a 10% owner. A third unit would need more pipeline capacity and "
                 "would put three of four units in one country with a history of currency crises.",
    },
    {
        "name": "Leviathan Phase 2", "where": "Israel", "partner": "Chevron, NewMed, Ratio",
        "scores": {"gas": 5, "timing": 2, "buyer": 5, "edge": 2, "risk": 2},
        "notes": "22 Tcf field and partners have funded FLNG engineering with dual FEED at yards. Chevron "
                 "leans towards building its own unit, so Golar would have to sell speed and a lease "
                 "model. Regional security risk is high.",
    },
    {
        "name": "NNPC fields", "where": "Nigeria", "partner": "NNPC",
        "scores": {"gas": 4, "timing": 2, "buyer": 2, "edge": 3, "risk": 1},
        "notes": "Project development agreement since June 2024 for 400 to 500 MMscf/d, which matches a MKII. "
                 "FID was due end 2024 and has slipped. Management has said NNPC lacked a project that "
                 "fit the available units.",
    },
    {
        "name": "Kribi restart", "where": "Cameroon", "partner": "Perenco, SNH",
        "scores": {"gas": 2, "timing": 4, "buyer": 3, "edge": 4, "risk": 3},
        "notes": "Hilli left in July 2026 after 156 cargoes and Cameroon lost its only export route. Golar "
                 "knows the site and the partners, but it left because a capacity cap limited earnings. "
                 "The gas is too small for a MKII unless new fields are tied in.",
    },
    {
        "name": "US Gulf tolling", "where": "United States", "partner": "Open",
        "scores": {"gas": 5, "timing": 3, "buyer": 3, "edge": 2, "risk": 4},
        "notes": "Cheap gas and a stable host, but Delfin took FID in June 2026 on its own Samsung units "
                 "and the Gulf coast is crowded with onshore capacity. Golar's commodity upside model "
                 "is worth less where buyers can sign elsewhere.",
    },
]


def rank(cands, criteria):
    total = sum(c["weight"] for c in criteria)
    for c in cands:
        c["score"] = round(sum(c["scores"][k["key"]] * k["weight"] for k in criteria) / total, 2)
    return sorted(cands, key=lambda c: c["score"], reverse=True)

# ---------------------------------------------------------------- run

if __name__ == "__main__":
    scenarios = [summary(UNIT, fob) for fob in (6, 8, 10, 12)]
    print(f"\nFLNG #4: ${UNIT['capex_musd']}M capex, ${UNIT['base_ebitda_musd']}M base EBITDA, "
          f"{UNIT['contract_years']} years from {UNIT['first_ebitda_year']}")
    print(f"Feed gas needed: ~{3.5 * MMSCFD_PER_MTPA:.0f} MMscf/d\n")
    print(f"{'FOB $/MMBtu':>12} {'EBITDA yr1':>11} {'Capex/EBITDA':>13} {'IRR':>7} {'Payback':>8}")
    for s in scenarios:
        print(f"{s['fob']:>12} {s['year1_ebitda']:>11} {s['capex_to_ebitda']:>12}x {s['irr']:>6}% {s['payback_year']:>8}")

    ranked = rank(CANDIDATES, CRITERIA)
    print("\nScreen")
    for i, c in enumerate(ranked, 1):
        print(f"{i}. {c['name']:<20} {c['where']:<22} {c['score']}")

    data = {
        "fleet": FLEET, "key": KEY_NUMBERS, "unit": UNIT, "scenarios": scenarios,
        "criteria": CRITERIA, "candidates": ranked, "mmscfd_per_mtpa": MMSCFD_PER_MTPA,
    }
    out = Path(__file__).resolve().parent.parent / "case" / "data.js"
    out.write_text("window.DATA = " + json.dumps(data, indent=1) + ";\n")
    print(f"\nWrote {out.relative_to(out.parent.parent)}")
