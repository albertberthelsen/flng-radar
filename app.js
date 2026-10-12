// FLNG Radar. Plain JS, no build step. Data from /api/prices, /api/news, /api/ships.

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (m, d = 0) => (m >= 1000 ? `$${(m / 1000).toFixed(2)}bn` : `$${m.toFixed(d)}M`);
const ago = iso => {
  const h = (Date.now() - new Date(iso)) / 36e5;
  return h < 1 ? "just now" : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};

// Golar terms (Q2 2026 report). $M of extra EBITDA per $1/MMBtu of FOB above $8.
const UPSIDE = [
  { name: "Hilli, from 2027", perUsd: 30 },
  { name: "Esperanza, from 2028", perUsd: 40 },
  { name: "10% of SESA", perUsd: 30 },
];
const THRESHOLD = 8;
const MMBTU_PER_T = 52;
const MMSCFD_PER_MTPA = 145;

const state = { prices: null, news: [], ships: [], region: "All" };

// ---------------------------------------------------------------- map

const COLORS = { golar: "#012d63", competitor: "#81888e", opportunity: "#3a958a" };
const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  center: [10, 12], zoom: innerWidth < 760 ? 0.6 : 1.6, attributionControl: false,
});
map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
if (innerWidth > 760) map.setPadding({ left: 400 });

const geo = list => ({
  type: "FeatureCollection",
  features: list.map(a => ({ type: "Feature", geometry: { type: "Point", coordinates: [a.lon, a.lat] }, properties: { id: a.id, kind: a.kind, name: a.name, golar: a.golar || "" } })),
});

map.on("load", () => {
  map.addSource("assets", { type: "geojson", data: geo(ASSETS) });
  map.addLayer({ id: "halo", type: "circle", source: "assets", filter: ["==", ["get", "kind"], "golar"],
    paint: { "circle-radius": 14, "circle-color": COLORS.golar, "circle-opacity": 0.12 } });
  map.addLayer({ id: "pts", type: "circle", source: "assets", paint: {
    "circle-radius": ["match", ["get", "kind"], "golar", 6.5, "opportunity", 6, 4.5],
    "circle-color": ["match", ["get", "kind"], "golar", COLORS.golar, "opportunity", COLORS.opportunity, COLORS.competitor],
    "circle-stroke-width": ["match", ["get", "kind"], "opportunity", 2, 0],
    "circle-stroke-color": "#ffffff",
  } });
  map.addLayer({ id: "labels", type: "symbol", source: "assets", minzoom: 2.2, layout: {
    "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.2], "text-anchor": "top", "text-font": ["Open Sans Regular"],
  }, paint: { "text-color": "#012d63", "text-halo-color": "#ffffff", "text-halo-width": 1.4 } });

  map.addSource("ships", { type: "geojson", data: geo([]) });
  map.addLayer({ id: "ships", type: "circle", source: "ships", paint: {
    "circle-radius": ["case", ["!=", ["get", "golar"], ""], 6, 3.5],
    "circle-color": ["case", ["!=", ["get", "golar"], ""], "#012d63", "#d9822b"],
    "circle-stroke-width": 1, "circle-stroke-color": "#ffffff",
  } });

  for (const layer of ["pts", "ships"]) {
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
  }
  map.on("click", "pts", e => showDetail(e.features[0].properties.id));
  map.on("click", "ships", e => {
    const s = state.ships.find(x => String(x.mmsi) === String(e.features[0].properties.id));
    if (s) new maplibregl.Popup({ closeButton: false }).setLngLat([s.lon, s.lat]).setHTML(shipHtml(s)).addTo(map);
  });
  if (state.ships.length) drawShips();
  addStaticLayers();
});

const legend = document.createElement("div");
legend.className = "mlegend";
legend.innerHTML = `<span><i style="background:${COLORS.golar}"></i>Golar</span><span><i style="background:${COLORS.opportunity}"></i>Opportunity for #4</span><span><i style="background:${COLORS.competitor}"></i>Other FLNG</span>
  <hr>
  <label><input type="checkbox" data-layer="leads" checked><i style="background:none;border:1.5px solid #e07a2f"></i>Flaring leads</label>
  <label><input type="checkbox" data-layer="flares"><i style="background:#e07a2f;opacity:.6"></i>All flares 2025</label>
  <label><input type="checkbox" data-layer="terminals" checked><i style="background:#3a958a;opacity:.8"></i>LNG export projects</label>`;
legend.querySelectorAll("input[data-layer]").forEach(cb => cb.addEventListener("change", () => {
  if (map.getLayer(cb.dataset.layer)) map.setLayoutProperty(cb.dataset.layer, "visibility", cb.checked ? "visible" : "none");
}));
const layerOn = id => legend.querySelector(`[data-layer="${id}"]`)?.checked ? "visible" : "none";
document.querySelector(".mapview").appendChild(legend);

// ---------------------------------------------------------------- panel

function selectTab(name) {
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach(t => (t.hidden = t.id !== `tab-${name}`));
  $("detail").hidden = true;
  if (name === "ships" && !state.shipsLoaded) loadShips();
}
document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => selectTab(b.dataset.tab)));
$("grab").addEventListener("click", () => $("panel").classList.toggle("open"));

// ---------------------------------------------------------------- prices

async function loadPrices() {
  try {
    const r = await fetch("/api/prices");
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    state.prices = j;
    renderTicker();
    renderToday();
    renderPitch();
  } catch (e) {
    $("ticker").innerHTML = `<span class="muted">Prices unavailable: ${esc(e.message)}</span>`;
  }
}

function change(hist) {
  if (!hist || hist.length < 2) return "";
  const a = hist[hist.length - 2][1], b = hist[hist.length - 1][1];
  const pct = ((b - a) / a) * 100;
  return `<span class="chg ${pct >= 0 ? "up" : "down"}">${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%</span>`;
}

function renderTicker() {
  const p = state.prices;
  const spread = p.ttf.usd - p.hh.usd * 1.15;
  $("ticker").innerHTML = [
    `<span><span class="k">TTF</span><b>$${p.ttf.usd.toFixed(2)}</b> ${change(p.ttf.history)}</span>`,
    `<span><span class="k">HH</span><b>$${p.hh.usd.toFixed(2)}</b> ${change(p.hh.history)}</span>`,
    `<span><span class="k">Brent</span><b>$${p.brent.usd.toFixed(1)}</b> ${change(p.brent.history)}</span>`,
    `<span title="TTF less 115% of Henry Hub: the margin for turning US gas into LNG for Europe, before shipping and liquefaction"><span class="k">TTF/HH spread</span><b>$${spread.toFixed(2)}</b></span>`,
  ].join("");
}

const fob = () => state.prices ? state.prices.ttf.usd - Number($("ship").value) : 10;

function renderToday() {
  $("shipOut").textContent = `$${Number($("ship").value).toFixed(1)}`;
  if (!state.prices) return;
  const f = fob();
  $("fobOut").textContent = `$${f.toFixed(2)}/MMBtu`;
  const over = Math.max(0, f - THRESHOLD);
  const rows = UPSIDE.map(u => [u.name, over * u.perUsd]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  $("upsideYear").textContent = `${money(total)} a year`;
  $("upsideLine").textContent = over > 0
    ? `That is ${money(total / 365, 1)} a day on top of $685M of fixed charter EBITDA, with FOB $${over.toFixed(2)} above the $8 threshold.`
    : `FOB is below $8, so Golar earns only its fixed charter fees. SESA's share would lose money below its break even.`;
  $("upsideTable").innerHTML = rows.map(([n, v]) => `<tr><td>${n}</td><td>${money(v)}</td></tr>`).join("") +
    `<tr class="total"><td>Total per year</td><td>${money(total)}</td></tr>`;
  drawChart();
}
$("ship").addEventListener("input", () => { renderToday(); renderPitch(); });

function drawChart() {
  const p = state.prices, svg = $("chart");
  const W = 360, H = 150, pad = 4;
  const series = [p.ttf.history, p.hh.history];
  const all = series.flat();
  const t0 = Math.min(...all.map(d => d[0])), t1 = Math.max(...all.map(d => d[0]));
  const vmax = Math.max(THRESHOLD, ...all.map(d => d[1])) * 1.1;
  const x = t => pad + ((t - t0) / (t1 - t0)) * (W - pad * 2);
  const y = v => H - pad - (v / vmax) * (H - pad * 2);
  const path = h => h.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = p.ttf.history.at(-1);
  svg.innerHTML = `
    <line x1="0" x2="${W}" y1="${y(THRESHOLD)}" y2="${y(THRESHOLD)}" stroke="#9aa1a8" stroke-dasharray="3 3" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <path d="${path(p.hh.history)}" fill="none" stroke="#d9822b" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
    <path d="${path(p.ttf.history)}" fill="none" stroke="#012d63" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(last[0])}" cy="${y(last[1])}" r="3.5" fill="#012d63"/>`;
}

// ---------------------------------------------------------------- pitch

const PITCHABLE = ASSETS.filter(a => a.kind === "opportunity" || a.id === "sesa");
$("opp").innerHTML = PITCHABLE.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
$("opp").addEventListener("change", () => {
  const v = $("opp").value;
  if (v.startsWith("lead:")) {
    const l = DATA.leads[Number(v.slice(5))];
    $("mtpa").value = Math.min(7, Math.max(1, Math.round(l.mtpa * 2) / 2));
    $("feed").value = 1.5;  // flared gas has no market today; the cost is gathering and processing
    return renderPitch();
  }
  const a = ASSETS.find(x => x.id === v);
  $("mtpa").value = Math.min(7, Math.max(1, a.id === "sesa" ? 3.5 : a.mtpa));
  $("feed").value = a.id === "usgulf" && state.prices ? Math.round(state.prices.hh.usd * 4) / 4 : 2.5;
  renderPitch();
});
["mtpa", "feed", "fee"].forEach(id => $(id).addEventListener("input", renderPitch));

function irr(cfs) {
  let lo = -0.5, hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    cfs.reduce((s, c, t) => s + c / (1 + mid) ** t, 0) > 0 ? (lo = mid) : (hi = mid);
  }
  return (lo + hi) / 2;
}

function renderPitch() {
  const mtpa = Number($("mtpa").value), feed = Number($("feed").value), feeBase = Number($("fee").value);
  $("mtpaOut").textContent = `${mtpa.toFixed(1)} MTPA`;
  $("feedOut").textContent = `$${feed.toFixed(2)}`;
  $("feeOut").textContent = `$${feeBase}M`;
  const f = fob(), scale = mtpa / 3.5;
  const mmbtu = mtpa * MMBTU_PER_T;                  // million MMBtu a year
  const revenue = mmbtu * f;                          // $M
  const fee = feeBase * scale;
  const share = Math.max(0, f - THRESHOLD) * 40 * scale;
  const gas = mmbtu * feed * 1.1;
  const owner = revenue - fee - share - gas;
  const golar = fee + share;
  const capex = 2450 * scale;
  const cfs = [-capex * 0.15, -capex * 0.3, -capex * 0.3, -capex * 0.25, ...Array.from({ length: 20 }, (_, k) => fee * (1 + 0.025 * 0.3) ** Math.max(0, k - 4) + share)];
  const max = Math.max(revenue, 1);
  const bar = (label, v, cls, left = 0) => `<div class="row"><span>${label}</span><div class="bar"><i class="${cls}" style="left:${(left / max) * 100}%;width:${(Math.max(0, v) / max) * 100}%"></i></div><span class="v">${money(v)}</span></div>`;
  $("pitchOut").innerHTML = `
    <div class="wf">
      ${bar("LNG sales at FOB", revenue, "")}
      ${bar("Feed gas and fuel", gas, "gas")}
      ${bar("Golar fee + share", golar, "golar", gas)}
      ${bar("Left for gas owner", owner, "owner", gas + golar)}
    </div>
    <div class="kpis">
      <div><b>${Math.round(mtpa * MMSCFD_PER_MTPA)}</b><span>MMscf/d of gas needed</span></div>
      <div><b>$${(golar / mmbtu).toFixed(2)}</b><span>Golar's take per MMBtu</span></div>
      <div><b>${((golar / revenue) * 100).toFixed(0)}%</b><span>of LNG revenue to Golar</span></div>
      <div><b>${(irr(cfs) * 100).toFixed(1)}%</b><span>Golar unlevered IRR</span></div>
    </div>
    <p class="small" style="margin-top:1rem">${owner > 0
      ? `At today's prices the gas owner keeps <b>${money(owner)}</b> a year after paying Golar, without spending ${money(capex)} on a plant. Payback on Golar's side is about ${(capex / golar).toFixed(1)} years of EBITDA.`
      : `At these inputs the project loses money for the gas owner. Feed gas or the fee would need to come down.`}</p>`;
}

// ---------------------------------------------------------------- signals

const REGIONS = {
  Golar: ["gimi", "hilli", "esperanza", "flng4", "sesa"],
  "West Africa": ["gimi", "gta2", "nnpc", "kribi", "congo", "gabon"],
  Argentina: ["sesa", "arglng"],
  "East Med": ["levi"],
  Americas: ["delfin", "fastlng", "ksi", "usgulf"],
  "Asia Pacific": ["prelude", "petronas", "coral"],
};
const GOLAR_WORDS = /golar|hilli|gimi|esperanza/i;

function tagArticle(a) {
  const t = a.title;
  a.assets = ASSETS.filter(x => x.tags.some(k => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t))).map(x => x.id);
  if (GOLAR_WORDS.test(t)) a.assets.push("flng4");
  a.regions = Object.entries(REGIONS).filter(([, ids]) => ids.some(id => a.assets.includes(id))).map(([r]) => r);
  if (GOLAR_WORDS.test(t) && !a.regions.includes("Golar")) a.regions.unshift("Golar");
  return a;
}

async function loadNews() {
  try {
    const j = await (await fetch("/api/news")).json();
    if (j.error) throw new Error(j.error);
    state.news = j.articles.map(tagArticle);
    renderNews();
  } catch (e) {
    $("news").innerHTML = `<li class="muted">News unavailable: ${esc(e.message)}</li>`;
  }
}

function newsItem(a) {
  return `<li><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>
    <div class="meta">${esc(a.source)} · ${ago(a.date)}${a.regions.slice(0, 2).map(r => `<span class="tag">${esc(r)}</span>`).join("")}</div></li>`;
}

function renderNews() {
  const names = ["All", ...Object.keys(REGIONS)];
  $("chips").innerHTML = names.map(n => {
    const c = n === "All" ? state.news.length : state.news.filter(a => a.regions.includes(n)).length;
    return `<button aria-pressed="${state.region === n}" data-r="${esc(n)}">${esc(n)} ${c}</button>`;
  }).join("");
  $("chips").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { state.region = b.dataset.r; renderNews(); }));
  const list = state.region === "All" ? state.news : state.news.filter(a => a.regions.includes(state.region));
  $("news").innerHTML = list.slice(0, 60).map(newsItem).join("") || `<li class="muted">Nothing in the last 30 days.</li>`;
}

// ---------------------------------------------------------------- ships

const NAV = ["Under way", "At anchor", "Not under command", "Restricted", "Constrained", "Moored", "Aground", "Fishing", "Sailing"];
const SITE_NAMES = { gta: "GTA", kribi: "Kribi", sanmatias: "San Matías", singapore: "Singapore", yantai: "Yantai" };
const shipHtml = s => `<b>${esc(s.name || "Unknown")}</b>${s.golar ? ' <span class="g">Golar</span>' : s.tanker ? ' <span class="g">Tanker</span>' : ""}<br>
  <span class="muted">${SITE_NAMES[s.site] || ""} · ${s.sog != null ? `${s.sog.toFixed(1)} kn` : ""} ${NAV[s.status] ? "· " + NAV[s.status] : ""}${s.dest ? ` · to ${esc(s.dest)}` : ""}</span>`;

async function loadShips() {
  state.shipsLoaded = true;
  const started = Date.now();
  const tick = setInterval(() => {
    const left = Math.max(0, 45 - Math.round((Date.now() - started) / 1000));
    $("shipsStatus").textContent = left > 0
      ? `Listening to the live ship feed: ${left} s left. You can look around the map meanwhile.`
      : "Almost there, collecting the last positions.";
  }, 1000);
  try {
    const r = await fetch("/api/ships");
    clearInterval(tick);
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    state.ships = j.ships.filter(s => s.lat != null);
    $("shipsStatus").textContent = `${state.ships.length} vessels heard in ${j.listenedMs / 1000}s, ${state.ships.filter(s => s.tanker).length} of them tankers or gas carriers · ${new Date(j.updated).toLocaleTimeString()}`;
    const order = Object.keys(SITE_NAMES);
    $("ships").innerHTML = state.ships
      .sort((a, b) => (b.golar ? 2 : b.tanker ? 1 : 0) - (a.golar ? 2 : a.tanker ? 1 : 0) || order.indexOf(a.site) - order.indexOf(b.site))
      .map(s => `<li data-m="${s.mmsi}">${shipHtml(s)}</li>`).join("") || `<li class="muted">No vessels reported in this window. Moored units only report every few minutes, so try again shortly.</li>`;
    $("ships").querySelectorAll("li[data-m]").forEach(li => li.addEventListener("click", () => {
      const s = state.ships.find(x => String(x.mmsi) === li.dataset.m);
      map.flyTo({ center: [s.lon, s.lat], zoom: 9 });
    }));
    drawShips();
  } catch (e) {
    clearInterval(tick);
    $("shipsStatus").textContent = /not set/.test(e.message) ? "Ship tracking needs an aisstream.io API key on the server." : `Ships unavailable: ${e.message}`;
  }
}
function drawShips() {
  const src = map.getSource && map.getSource("ships");
  if (src) src.setData(geo(state.ships.map(s => ({ ...s, id: s.mmsi, kind: "ship" }))));
}

// ---------------------------------------------------------------- detail

function showDetail(id) {
  const a = ASSETS.find(x => x.id === id);
  const related = state.news.filter(n => n.assets.includes(id)).slice(0, 8);
  const d = $("detail");
  document.querySelectorAll(".tab").forEach(t => (t.hidden = true));
  d.hidden = false;
  d.innerHTML = `
    <button class="back" id="back">Back</button>
    <p class="kind ${a.kind}" style="margin-top:1rem">${a.kind === "opportunity" ? `Opportunity · rank ${a.rank} in the case` : a.kind === "golar" ? "Golar" : "Other floating LNG"}</p>
    <h2>${esc(a.name)}</h2>
    <p>${esc(a.text)}</p>
    <dl>
      <dt>Status</dt><dd>${esc(a.status)}</dd>
      <dt>Size</dt><dd>${a.mtpa} MTPA · about ${Math.round(a.mtpa * MMSCFD_PER_MTPA)} MMscf/d</dd>
      <dt>Owner</dt><dd>${esc(a.owner)}</dd>
      <dt>Partners</dt><dd>${esc(a.partners)}</dd>
    </dl>
    ${PITCHABLE.includes(a) ? `<button class="cta" id="toPitch">Run the pitch for this field</button>` : ""}
    <p class="label" style="margin-top:1.5rem">Related news</p>
    <ul class="news">${related.map(newsItem).join("") || `<li class="muted">No matching articles in the last 30 days.</li>`}</ul>`;
  $("back").onclick = () => selectTab(document.querySelector('.tabs [aria-selected="true"]').dataset.tab);
  const tp = $("toPitch");
  if (tp) tp.onclick = () => { $("opp").value = id; $("opp").dispatchEvent(new Event("change")); location.hash = "#/pitch"; };
  map.flyTo({ center: [a.lon, a.lat], zoom: Math.max(map.getZoom(), 4), offset: innerWidth > 760 ? [0, 0] : [0, -innerHeight * 0.2] });
}

// ---------------------------------------------------------------- leads and projects
// Static datasets built by scripts/build_data.py from World Bank flaring and GEM terminal data.

const DATA = {};
const STATUS_COLOR = ["match", ["get", "s"], "proposed", "#3a958a", "construction", "#278ccd", "operating", "#9aa1a8", "#c9cbc1"];
const fmtQ = q => `${Math.round(q).toLocaleString("en-US")} MMscf/d`;
const trend = (q, q21) => {
  if (!q21) return "new since 2021";
  const pct = ((q - q21) / q21) * 100;
  return `<span class="${pct > 0 ? "up" : "down"}">${pct > 0 ? "+" : ""}${pct.toFixed(0)}%</span> since 2021`;
};
const pointFC = (list, xy, props) => ({
  type: "FeatureCollection",
  features: list.map((d, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: xy(d) }, properties: { i, ...props(d) } })),
});

async function loadStatic() {
  const [terminals, flares, leads] = await Promise.all(
    ["terminals", "flares", "leads"].map(n => fetch(`data/${n}.json`).then(r => r.json())));
  Object.assign(DATA, { terminals, flares, leads, exports: terminals.filter(t => t.k === "export") });
  renderLeads();
  renderProjects();
  addStaticLayers();
}

function addStaticLayers() {
  if (!DATA.leads || !map.getLayer("halo") || map.getSource("leads")) return;
  map.addSource("flares", { type: "geojson", data: pointFC(DATA.flares, f => [f.x, f.y], f => ({ q: f.q })) });
  map.addLayer({ id: "flares", type: "circle", source: "flares", layout: { visibility: layerOn("flares") }, paint: {
    "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "q"]], 1, 1.2, 40, 12],
    "circle-color": "#e07a2f", "circle-opacity": 0.45, "circle-blur": 0.3 } }, "halo");
  map.addSource("terminals", { type: "geojson", data: pointFC(DATA.exports, t => [t.x, t.y2], t => ({ s: t.s, cap: t.cap || 0.5 })) });
  map.addLayer({ id: "terminals", type: "circle", source: "terminals", layout: { visibility: layerOn("terminals") }, paint: {
    "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "cap"]], 0, 2, 5, 8],
    "circle-color": STATUS_COLOR, "circle-opacity": 0.85, "circle-stroke-width": 0.75, "circle-stroke-color": "#ffffff" } }, "halo");
  map.addSource("leads", { type: "geojson", data: pointFC(DATA.leads, l => [l.x, l.y], l => ({ q: l.q, sanc: l.sanc })) });
  map.addLayer({ id: "leads", type: "circle", source: "leads", layout: { visibility: layerOn("leads") }, paint: {
    "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "q"]], 5, 6, 34, 26],
    "circle-color": "rgba(224,122,47,0.1)", "circle-stroke-width": 1.75,
    "circle-stroke-color": ["case", ["get", "sanc"], "#d9b8a0", "#e07a2f"] } }, "halo");
  for (const id of ["terminals", "leads"]) {
    map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
  }
  map.on("click", "leads", e => showLead(e.features[0].properties.i));
  map.on("click", "terminals", e => { if (!e.defaultPrevented) showTerminal(e.features[0].properties.i); });
}

function leadItem(l, i) {
  const where = l.off >= 0.5 ? `${Math.round(l.off * 100)}% offshore` : `onshore, ${l.coast} km from coast`;
  return `<li data-i="${i}"><div class="row1"><span class="ttl">${esc(l.c)}${l.sanc ? '<span class="pill sanc">Sanctioned</span>' : ""}</span><span class="num">${fmtQ(l.q)}</span></div>
    <div class="meta">${esc(l.fields.slice(0, 2).join(", ") || "Unnamed fields")} · ${esc(l.ops.slice(0, 2).join(", ") || "operator unknown")}</div>
    <div class="meta">About ${l.mtpa.toFixed(1)} MTPA · ${where} · ${trend(l.q, l.q21)}</div></li>`;
}

function renderLeads() {
  const hide = $("hideSanc").checked, off = $("offOnly").checked;
  const rows = DATA.leads.map((l, i) => [l, i]).filter(([l]) => (!hide || !l.sanc) && (!off || l.off >= 0.5));
  $("leads").innerHTML = rows.map(([l, i]) => leadItem(l, i)).join("") || `<li class="muted">Nothing matches.</li>`;
  $("leads").querySelectorAll("li[data-i]").forEach(li => li.addEventListener("click", () => showLead(Number(li.dataset.i))));
}
["hideSanc", "offOnly"].forEach(id => $(id).addEventListener("change", renderLeads));

const PROJ = { status: "proposed", float: false, q: "" };
function renderProjects() {
  const ex = DATA.exports;
  const sum = st => ex.filter(t => t.s === st).reduce((a, t) => a + (t.cap || 0), 0);
  const fl = ex.filter(t => t.fl && t.s === "proposed");
  $("projSummary").innerHTML = `<b>${Math.round(sum("proposed"))} MTPA</b> of export capacity proposed and <b>${Math.round(sum("construction"))} MTPA</b> under construction worldwide. ${fl.length} proposed units are floating, ${Math.round(fl.reduce((a, t) => a + (t.cap || 0), 0))} MTPA in total.`;
  const chips = [["proposed", "Proposed"], ["construction", "Building"], ["operating", "Operating"], ["shelved", "Shelved"]];
  $("projChips").innerHTML = chips.map(([k, n]) => `<button data-s="${k}" aria-pressed="${PROJ.status === k}">${n} ${ex.filter(t => t.s === k).length}</button>`).join("") +
    `<button data-f="1" aria-pressed="${PROJ.float}">Floating only</button>`;
  $("projChips").querySelectorAll("button").forEach(b => b.onclick = () => {
    if (b.dataset.f) PROJ.float = !PROJ.float; else PROJ.status = b.dataset.s;
    renderProjects();
  });
  const q = PROJ.q.toLowerCase();
  const rows = ex.map((t, i) => [t, i])
    .filter(([t]) => t.s === PROJ.status && (!PROJ.float || t.fl) &&
      (!q || `${t.n} ${t.u} ${t.c} ${t.o} ${t.p}`.toLowerCase().includes(q)))
    .sort((a, b) => (b[0].cap || 0) - (a[0].cap || 0));
  $("projects").innerHTML = rows.slice(0, 150).map(([t, i]) => `<li data-i="${i}">
    <div class="row1"><span class="ttl">${esc(t.n)}${t.fl ? '<span class="pill float">Floating</span>' : ""}</span><span class="num">${t.cap ? `${t.cap} MTPA` : ""}</span></div>
    <div class="meta">${esc(t.c)}${t.u ? ` · ${esc(t.u)}` : ""}${t.y ? ` · ${esc(t.y)}` : ""}</div>
    <div class="meta">${esc((t.p || t.o).split(";").slice(0, 3).join(","))}</div></li>`).join("") || `<li class="muted">Nothing matches.</li>`;
  $("projects").querySelectorAll("li[data-i]").forEach(li => li.addEventListener("click", () => showTerminal(Number(li.dataset.i))));
}
$("projSearch").addEventListener("input", e => { PROJ.q = e.target.value; renderProjects(); });

function openDetail(html, lon, lat, zoom = 5) {
  const d = $("detail");
  document.querySelectorAll(".tab").forEach(t => (t.hidden = true));
  d.hidden = false;
  d.scrollTop = 0;
  d.innerHTML = `<button class="back" id="back">Back</button>${html}`;
  $("back").onclick = () => selectTab(document.querySelector('.tabs [aria-selected="true"]').dataset.tab);
  map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), zoom), offset: innerWidth > 760 ? [0, 0] : [0, -innerHeight * 0.2] });
}

function showLead(i) {
  const l = DATA.leads[i];
  const words = [l.c, ...l.fields, ...l.ops].map(w => w.toLowerCase());
  const related = state.news.filter(n => words.some(w => w.length > 3 && n.title.toLowerCase().includes(w))).slice(0, 6);
  const nearbyProposed = DATA.exports.filter(t => t.s === "proposed" && Math.hypot(t.x - l.x, t.y2 - l.y) < 4).slice(0, 4);
  openDetail(`
    <p class="kind" style="margin-top:1rem;color:var(--flare)">Flaring lead${l.sanc ? " · sanctioned country" : ""}</p>
    <h2>${esc(l.cs.join(", "))}</h2>
    <p>${fmtQ(l.q)} burned in 2025 across ${l.n} flare${l.n > 1 ? "s" : ""}, ${trend(l.q, l.q21)}. That is enough feed for about <b>${l.mtpa.toFixed(1)} MTPA</b> of LNG, ${l.mtpa >= 3 ? "enough to fill a MKII on its own" : l.mtpa >= 1.5 ? "around half a MKII" : "a small share of a MKII unless more gas is tied in"}.</p>
    <dl>
      <dt>Fields</dt><dd>${esc(l.fields.join(", ") || "Not named")}</dd>
      <dt>Operators</dt><dd>${esc(l.ops.join(", ") || "Unknown")}</dd>
      <dt>Location</dt><dd>${l.off >= 0.5 ? `${Math.round(l.off * 100)}% offshore` : `Onshore, about ${l.coast} km from the coast`}</dd>
      <dt>Nearest LNG export</dt><dd>${esc(l.near)}, ${l.nearKm} km</dd>
    </dl>
    ${nearbyProposed.length ? `<p class="label">Proposed LNG projects nearby</p><ul class="news">${nearbyProposed.map(t => `<li>${esc(t.n)}${t.u ? ` · ${esc(t.u)}` : ""} <span class="meta">${t.cap ? t.cap + " MTPA" : ""}</span></li>`).join("")}</ul>` : ""}
    ${l.sanc ? "" : `<button class="cta" id="toPitch">Run the pitch for this gas</button>`}
    <p class="label" style="margin-top:1.5rem">Related news</p>
    <ul class="news">${related.map(newsItem).join("") || `<li class="muted">No matching articles in the last 30 days.</li>`}</ul>`, l.x, l.y, 5.5);
  const tp = $("toPitch");
  if (tp) tp.onclick = () => {
    const v = `lead:${i}`;
    if (![...$("opp").options].some(o => o.value === v)) $("opp").insertAdjacentHTML("beforeend", `<option value="${v}">Flaring: ${esc(l.c)}, ${esc(l.fields[0] || "")}</option>`);
    $("opp").value = v; $("opp").dispatchEvent(new Event("change")); location.hash = "#/pitch";
  };
}

function showTerminal(i) {
  const t = DATA.exports[i];
  openDetail(`
    <p class="kind" style="margin-top:1rem">LNG export project · ${esc(t.s)}${t.fl ? " · floating" : ""}</p>
    <h2>${esc(t.n)}</h2>
    <dl>
      ${t.u ? `<dt>Unit</dt><dd>${esc(t.u)}</dd>` : ""}
      <dt>Country</dt><dd>${esc(t.c)}</dd>
      <dt>Capacity</dt><dd>${t.cap ? `${t.cap} MTPA` : "Not stated"}</dd>
      ${t.y ? `<dt>Start</dt><dd>${esc(t.y)}</dd>` : ""}
      <dt>Owner</dt><dd>${esc(t.o)}</dd>
      <dt>Parents</dt><dd>${esc(t.p)}</dd>
    </dl>
    ${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">Full profile on GEM Wiki</a>` : ""}`, t.x, t.y2, 5);
}

// ---------------------------------------------------------------- pages

function renderStatus() {
  const S = window.STATUS;
  const fmt = d => /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : d;
  $("statusAsOf").textContent = `Updated ${fmt(S.asOf)}`;
  $("statusSteps").innerHTML = S.steps.map(st => `<li class="${st.done ? "done" : st.date === "Open" ? "open" : ""}"><span class="d">${esc(fmt(st.date))}</span><span>${esc(st.text)}</span></li>`).join("");
}
renderStatus();

const VIEWS = ["home", "market", "map", "pitch", "news", "sources"];
function route() {
  const name = location.hash.replace(/^#\/?/, "").split("/")[0];
  const view = VIEWS.includes(name) ? name : "home";
  document.body.dataset.view = view;
  document.querySelectorAll("[data-view]:not(body)").forEach(el => (el.hidden = el.dataset.view !== view));
  document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === `#/${view}`));
  if (view === "map") requestAnimationFrame(() => map.resize());
  window.scrollTo(0, 0);
}
addEventListener("hashchange", route);
route();

// ---------------------------------------------------------------- start

renderToday();
renderPitch();
loadPrices();
loadNews();
loadStatic();
setTimeout(() => { if (!state.shipsLoaded) loadShips(); }, 1500);  // the feed takes up to 45 s, so start early
setInterval(loadPrices, 120000);
