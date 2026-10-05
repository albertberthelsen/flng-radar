// Live gas and oil prices from Yahoo Finance futures, converted to $/MMBtu.
// TTF is quoted in EUR/MWh: $/MMBtu = EUR/MWh * EURUSD / 3.412.

const SYMBOLS = {
  ttf: "TTF=F",     // Dutch TTF, EUR/MWh
  hh: "NG=F",       // Henry Hub, $/MMBtu
  brent: "BZ=F",    // Brent, $/bbl
  eurusd: "EURUSD=X",
};
const MWH_PER_MMBTU = 3.412;

async function chart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`${symbol}: HTTP ${r.status}`);
  const j = await r.json();
  const res = j.chart?.result?.[0];
  if (!res) throw new Error(`${symbol}: no data`);
  const closes = res.indicators.quote[0].close;
  const history = res.timestamp
    .map((t, i) => [t * 1000, closes[i]])
    .filter(([, v]) => v != null);
  return {
    price: res.meta.regularMarketPrice,
    prevClose: res.meta.chartPreviousClose,
    time: res.meta.regularMarketTime * 1000,
    history,
  };
}

export async function GET() {
  try {
    const entries = await Promise.all(Object.entries(SYMBOLS).map(async ([k, s]) => [k, await chart(s)]));
    const raw = Object.fromEntries(entries);
    const fx = raw.eurusd.price;
    const toUsd = v => (v * fx) / MWH_PER_MMBTU;

    const body = {
      updated: Date.now(),
      eurusd: fx,
      ttf: {
        usd: toUsd(raw.ttf.price), eur_mwh: raw.ttf.price, time: raw.ttf.time,
        history: raw.ttf.history.map(([t, v]) => [t, toUsd(v)]),
      },
      hh: { usd: raw.hh.price, time: raw.hh.time, history: raw.hh.history },
      brent: { usd: raw.brent.price, time: raw.brent.time, history: raw.brent.history },
    };
    return Response.json(body, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
}
