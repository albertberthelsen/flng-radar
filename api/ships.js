// Live ships around Golar's sites from aisstream.io.
// aisstream only works over a websocket and does not allow browser connections,
// so this function listens for a short window and returns what it heard.
// Moored units report position about every 3 minutes, so a quiet unit falls back
// to its known mooring on the page.

const SITES = {
  gta:       [[14.5, -18.5], [17.5, -16.2]],    // Greater Tortue Ahmeyim and Dakar approaches
  kribi:     [[1.8, 8.8], [3.6, 10.2]],         // Hilli's old site, Cameroon
  sanmatias: [[-42.5, -65.5], [-40.0, -62.5]],  // Gulf of San Matías, Argentina
  singapore: [[1.0, 103.4], [1.5, 104.2]],      // Singapore Strait incl. Seatrium yards
  yantai:    [[37.2, 120.8], [38.0, 122.0]],    // CIMC Raffles, Yantai
};
const GOLAR_MMSI = { 538004196: "Gimi" };
const LISTEN_MS = 45000;

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
  // Static data (type, length) only arrives every few minutes, so most ships come without it.
  // Keep everything we can place, and flag tankers (AIS type 80 to 89) and LNG names for the page.
  const list = [...ships.values()]
    .filter(s => s.lat != null && s.site)
    .map(s => ({ ...s, tanker: (s.type >= 80 && s.type <= 89) || /LNG|GAS/i.test(s.name) }));
  return Response.json({ updated: Date.now(), listenedMs: LISTEN_MS, heard: ships.size, ships: list }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
  });
}
