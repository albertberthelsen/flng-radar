window.DATA = {
 "fleet": [
  {
   "name": "Hilli",
   "design": "MKI",
   "mtpa": 2.45,
   "status": "In Singapore for upgrade",
   "contract": "SESA, Argentina. 20 years from 2027. $285M EBITDA a year plus commodity upside."
  },
  {
   "name": "Gimi",
   "design": "MKI",
   "mtpa": 2.7,
   "status": "Operating, GTA field",
   "contract": "bp, Mauritania/Senegal. 20 years. Golar owns 70%. Q2 2026 day rate 15% above contract."
  },
  {
   "name": "Esperanza",
   "design": "MKII",
   "mtpa": 3.5,
   "status": "74% built, CIMC Raffles",
   "contract": "SESA, Argentina. 20 years from H2 2028. $400M EBITDA a year plus commodity upside."
  },
  {
   "name": "FLNG #4",
   "design": "MKII",
   "mtpa": 3.5,
   "status": "Ordered Aug 2026, delivery end 2029",
   "contract": "Open. Golar is negotiating with several possible charterers."
  }
 ],
 "key": {
  "q2_adj_ebitda_musd": 127.4,
  "q2_net_income_musd": 38.3,
  "cash_musd": 908,
  "net_debt_musd": 1800,
  "shares_m": 102.1,
  "dividend_q_usd": 0.25,
  "ebitda_backlog_busd": 17,
  "upside_per_usd_mmbtu_musd": 100,
  "hilli_cargoes_cameroon": 156
 },
 "unit": {
  "capex_musd": 2450,
  "base_ebitda_musd": 400,
  "contract_years": 20,
  "capex_by_year": {
   "2026": 0.15,
   "2027": 0.3,
   "2028": 0.3,
   "2029": 0.25
  },
  "first_ebitda_year": 2030,
  "tariff_share": 0.25,
  "threshold_usd_mmbtu": 8.0,
  "upside_per_usd_musd": 40,
  "cpi_share": 0.3,
  "cpi": 0.025
 },
 "scenarios": [
  {
   "fob": 6,
   "year1_ebitda": 400,
   "capex_to_ebitda": 6.1,
   "irr": 12.8,
   "payback_year": 2036,
   "contract_ebitda_busd": 8.4
  },
  {
   "fob": 8,
   "year1_ebitda": 400,
   "capex_to_ebitda": 6.1,
   "irr": 12.8,
   "payback_year": 2036,
   "contract_ebitda_busd": 8.4
  },
  {
   "fob": 10,
   "year1_ebitda": 480,
   "capex_to_ebitda": 5.1,
   "irr": 15.3,
   "payback_year": 2035,
   "contract_ebitda_busd": 10.0
  },
  {
   "fob": 12,
   "year1_ebitda": 560,
   "capex_to_ebitda": 4.4,
   "irr": 17.6,
   "payback_year": 2034,
   "contract_ebitda_busd": 11.6
  }
 ],
 "criteria": [
  {
   "key": "gas",
   "label": "Gas fits a 3.5 MTPA unit",
   "weight": 25
  },
  {
   "key": "timing",
   "label": "Timing fits 2029 delivery",
   "weight": 20
  },
  {
   "key": "buyer",
   "label": "Charterer credit",
   "weight": 20
  },
  {
   "key": "edge",
   "label": "Golar's edge",
   "weight": 20
  },
  {
   "key": "risk",
   "label": "Country and concentration risk (5 = low)",
   "weight": 15
  }
 ],
 "candidates": [
  {
   "name": "GTA Phase 2",
   "where": "Mauritania / Senegal",
   "partner": "bp, Kosmos, Petrosen, SMH",
   "scores": {
    "gas": 4,
    "timing": 4,
    "buyer": 5,
    "edge": 5,
    "risk": 3
   },
   "notes": "Partners are studying a gravity based structure for 2.5 to 3 MTPA. Gimi already works on the same field and is beating its contract by 15%, so Golar can offer a known unit faster than a GBS can be built. The two host states are still negotiating terms.",
   "score": 4.25
  },
  {
   "name": "SESA expansion",
   "where": "Argentina",
   "partner": "PAE, YPF, Pampa, Harbour",
   "scores": {
    "gas": 5,
    "timing": 4,
    "buyer": 3,
    "edge": 5,
    "risk": 2
   },
   "notes": "Vaca Muerta has the gas and SESA's offtake tender drew demand beyond the 2 MTPA sold to SEFE. Golar is already a 10% owner. A third unit would need more pipeline capacity and would put three of four units in one country with a history of currency crises.",
   "score": 3.95
  },
  {
   "name": "US Gulf tolling",
   "where": "United States",
   "partner": "Open",
   "scores": {
    "gas": 5,
    "timing": 3,
    "buyer": 3,
    "edge": 2,
    "risk": 4
   },
   "notes": "Cheap gas and a stable host, but Delfin took FID in June 2026 on its own Samsung units and the Gulf coast is crowded with onshore capacity. Golar's commodity upside model is worth less where buyers can sign elsewhere.",
   "score": 3.45
  },
  {
   "name": "Leviathan Phase 2",
   "where": "Israel",
   "partner": "Chevron, NewMed, Ratio",
   "scores": {
    "gas": 5,
    "timing": 2,
    "buyer": 5,
    "edge": 2,
    "risk": 2
   },
   "notes": "22 Tcf field and partners have funded FLNG engineering with dual FEED at yards. Chevron leans towards building its own unit, so Golar would have to sell speed and a lease model. Regional security risk is high.",
   "score": 3.35
  },
  {
   "name": "Kribi restart",
   "where": "Cameroon",
   "partner": "Perenco, SNH",
   "scores": {
    "gas": 2,
    "timing": 4,
    "buyer": 3,
    "edge": 4,
    "risk": 3
   },
   "notes": "Hilli left in July 2026 after 156 cargoes and Cameroon lost its only export route. Golar knows the site and the partners, but it left because a capacity cap limited earnings. The gas is too small for a MKII unless new fields are tied in.",
   "score": 3.15
  },
  {
   "name": "NNPC fields",
   "where": "Nigeria",
   "partner": "NNPC",
   "scores": {
    "gas": 4,
    "timing": 2,
    "buyer": 2,
    "edge": 3,
    "risk": 1
   },
   "notes": "Project development agreement since June 2024 for 400 to 500 MMscf/d, which matches a MKII. FID was due end 2024 and has slipped. Management has said NNPC lacked a project that fit the available units.",
   "score": 2.55
  }
 ],
 "mmscfd_per_mtpa": 145
};
