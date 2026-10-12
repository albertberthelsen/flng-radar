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

const COLORS = { golar: "#8fb0d4", competitor: "#b9a07a", opportunity: "#7fc4a4" };
const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
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
    paint: { "circle-radius": 14, "circle-color": COLORS.golar, "circle-opacity": 0.15 } });
  map.addLayer({ id: "pts", type: "circle", source: "assets", paint: {
    "circle-radius": ["match", ["get", "kind"], "golar", 6.5, "opportunity", 6, 4.5],
    "circle-color": ["match", ["get", "kind"], "golar", COLORS.golar, "opportunity", COLORS.opportunity, COLORS.competitor],
    "circle-stroke-width": ["match", ["get", "kind"], "opportunity", 2, 0],
    "circle-stroke-color": "#0c0e12",
  } });
  map.addLayer({ id: "labels", type: "symbol", source: "assets", minzoom: 2.2, layout: {
    "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.2], "text-anchor": "top", "text-font": ["Open Sans Regular"],
  }, paint: { "text-color": "#c9c4ba", "text-halo-color": "#0c0e12", "text-halo-width": 1.2 } });

  map.addSource("ships", { type: "geojson", data: geo([]) });
  map.addLayer({ id: "ships", type: "circle", source: "ships", paint: {
    "circle-radius": ["case", ["!=", ["get", "golar"], ""], 6, 3.5],
    "circle-color": ["case", ["!=", ["get", "golar"], ""], "#ffffff", "#e0c27a"],
    "circle-stroke-width": 1, "circle-stroke-color": "#0c0e12",
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
});

const legend = document.createElement("div");
legend.className = "mlegend";
legend.innerHTML = `<span><i style="background:${COLORS.golar}"></i>Golar</span><span><i style="background:${COLORS.opportunity}"></i>Opportunity for #4</span><span><i style="background:${COLORS.competitor}"></i>Other FLNG</span>`;
document.body.appendChild(legend);

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
    <line x1="0" x2="${W}" y1="${y(THRESHOLD)}" y2="${y(THRESHOLD)}" stroke="#8b8f97" stroke-dasharray="3 3" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <path d="${path(p.hh.history)}" fill="none" stroke="#c98f8f" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
    <path d="${path(p.ttf.history)}" fill="none" stroke="#8fb0d4" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(last[0])}" cy="${y(last[1])}" r="3" fill="#8fb0d4"/>`;
}

// ---------------------------------------------------------------- pitch

const PITCHABLE = ASSETS.filter(a => a.kind === "opportunity" || a.id === "sesa");
$("opp").innerHTML = PITCHABLE.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
$("opp").addEventListener("change", () => {
  const a = ASSETS.find(x => x.id === $("opp").value);
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
  try {
    const r = await fetch("/api/ships");
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
  if (tp) tp.onclick = () => { $("opp").value = id; $("opp").dispatchEvent(new Event("change")); selectTab("pitch"); };
  map.flyTo({ center: [a.lon, a.lat], zoom: Math.max(map.getZoom(), 4), offset: innerWidth > 760 ? [0, 0] : [0, -innerHeight * 0.2] });
}

// ---------------------------------------------------------------- start

renderToday();
renderPitch();
loadPrices();
loadNews();
setInterval(loadPrices, 120000);
