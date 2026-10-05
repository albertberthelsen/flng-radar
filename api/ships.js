// Live ships around Golar's sites from aisstream.io.
// aisstream only works over a websocket and does not allow browser connections,
// so this function listens for a short window and returns what it heard.
// Moored units report position about every 3 minutes, so a quiet unit falls back
// to its known mooring on the page.

const SITES = {
  gta:       [[15.6, -17.4], [16.6, -16.4]],   // Greater Tortue Ahmeyim, Mauritania/Senegal
  kribi:     [[2.3, 9.2], [3.3, 10.0]],        // Hilli's old site, Cameroon
  sanmatias: [[-41.6, -65.3], [-40.4, -63.8]], // Gulf of San Matías, Argentina
  singapore: [[1.2, 103.55], [1.36, 103.75]],  // Seatrium yards, Tuas
  yantai:    [[37.4, 121.2], [37.65, 121.55]], // CIMC Raffles, Yantai
};
const GOLAR_MMSI = { 538004196: "Gimi" };
const LISTEN_MS = 20000;

export async function GET() {
  const key = process.env.AISSTREAM_API_KEY;
  if (!key) return Response.json({ error: "AISSTREAM_API_KEY not set", ships: [] }, { status: 503 });

  const ships = new Map();
  await new Promise(resolve => {
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
    const done = () => { try { ws.close(); } catch {} resolve(); };
    const timer = setTimeout(done, LISTEN_MS);
    ws.onopen = () => ws.send(JSON.stringify({
      APIKey: key,
      BoundingBoxes: Object.values(SITES),
      FilterMessageTypes: ["PositionReport", "ShipStaticData", "StandardClassBPositionReport"],
    }));
    ws.onmessage = async ev => {
      const raw = typeof ev.data === "string" ? ev.data : await ev.data.text();
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.error) { clearTimeout(timer); ships.set("error", m.error); return done(); }
      const md = m.MetaData; if (!md) return;
      const s = ships.get(md.MMSI) || { mmsi: md.MMSI };
      s.name = (md.ShipName || s.name || "").trim();
      s.lat = md.latitude; s.lon = md.longitude; s.time = md.time_utc;
      const p = m.Message?.PositionReport || m.Message?.StandardClassBPositionReport;
      if (p) { s.sog = p.Sog; s.cog = p.Cog; s.status = p.NavigationalStatus; }
      const st = m.Message?.ShipStaticData;
      if (st) { s.type = st.Type; s.dest = (st.Destination || "").trim(); s.length = (st.Dimension?.A || 0) + (st.Dimension?.B || 0); }
      s.site = Object.entries(SITES).find(([, [[a, b], [c, d]]]) => s.lat >= a && s.lat <= c && s.lon >= b && s.lon <= d)?.[0];
      if (GOLAR_MMSI[md.MMSI]) s.golar = GOLAR_MMSI[md.MMSI];
      else if (/HILLI|GIMI|ESPERANZA/i.test(s.name)) s.golar = s.name;
      ships.set(md.MMSI, s);
    };
    ws.onerror = done;
    ws.onclose = () => { clearTimeout(timer); resolve(); };
  });

  if (ships.has("error")) return Response.json({ error: ships.get("error"), ships: [] }, { status: 502 });
  // LNG carriers are AIS type 80 to 89 (tankers) and usually over 250 m; keep tankers, Golar units and unknowns that are large.
  const list = [...ships.values()].filter(s => s.golar || (s.type >= 80 && s.type <= 89) || s.length >= 250 || /LNG/i.test(s.name));
  return Response.json({ updated: Date.now(), listenedMs: LISTEN_MS, heard: ships.size, ships: list }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
  });
}
