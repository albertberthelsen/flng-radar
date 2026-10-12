# FLNG Radar

A live business development tool for Golar LNG's floating LNG business, plus a written case on where its fourth FLNG unit should go.

- **Today**: live TTF, Henry Hub and Brent, and what Golar's price share on its Argentine contracts is worth at today's prices.
- **Map**: every floating liquefaction unit and the open opportunities for FLNG #4.
- **Leads**: gas burned off near the coast in 2025, clustered from World Bank satellite flaring data. Gas with no route to market is where a floating plant can help.
- **Projects**: every LNG export project in the world from Global Energy Monitor, filterable by status, with floating projects flagged.
- **Pitch**: what a Golar unit means for a gas owner, at live prices: LNG revenue, Golar's take, what the owner keeps, Golar's IRR.
- **Signals**: FLNG and LNG export news from the last 30 days, tagged by region and project.
- **Ships**: large tankers at Golar's sites from AIS (aisstream.io).
- **Case**: `case/index.html`, built from `model/flng_model.py`.

## Run locally

Put an aisstream.io key in `.env.local`:

```
AISSTREAM_API_KEY=your_key
```

Then:

```bash
node scripts/dev.mjs
```

Open http://localhost:4175.

The Leads and Projects data is static and rebuilt with:

```bash
uv run --with openpyxl python scripts/build_data.py
``` No dependencies to install. On Vercel the files in `api/` run as functions and the key goes in the project's environment variables.

Data: World Bank Global Flaring and Methane Reduction Partnership (VIIRS flare estimates 2012 to 2025), Global Energy Monitor Global Gas Infrastructure Tracker (CC BY 4.0), Yahoo Finance futures, Google News RSS, aisstream.io, CARTO and OpenStreetMap. Figures from Golar's Q2 2026 report. Positions on the map are approximate. Not affiliated with Golar LNG.
