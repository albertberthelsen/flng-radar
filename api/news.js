// FLNG and LNG export news from Google News RSS (free, no key).
// A few targeted searches, merged and cached at the edge for 30 minutes.
// The page tags each article to countries and projects on the map.

const QUERIES = [
  '"floating LNG" OR FLNG',
  '"Golar LNG"',
  'LNG export FID OR "final investment decision" LNG',
  '"gas discovery" offshore OR "gas field" LNG',
];
// "FLNG" is also FLEX LNG's ticker, which is a shipping company, not floating liquefaction.
const NOISE = /FLEX LNG|\(FLNG\)|NYSE:FLNG|OSE:FLNG|FLNG\d{6}|\b(put|call)$/i;

const decode = s => s
  .replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const tag = (xml, t) => decode((xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || "");

async function search(q) {
  const url = "https://news.google.com/rss/search?" + new URLSearchParams({ q: `${q} when:30d`, hl: "en-US", gl: "US", ceid: "US:en" });
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`Google News HTTP ${r.status}`);
  const xml = await r.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const source = tag(it, "source");
    let title = tag(it, "title");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    return { title, url: tag(it, "link"), source, date: new Date(tag(it, "pubDate")).toISOString() };
  });
}

export async function GET() {
  try {
    const results = await Promise.allSettled(QUERIES.map(search));
    const seen = new Set();
    const articles = results.flatMap(r => r.status === "fulfilled" ? r.value : [])
      .filter(a => !NOISE.test(a.title))
      .filter(a => {
        const k = a.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!articles.length) throw new Error("No news returned");
    return Response.json({ updated: Date.now(), articles }, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=7200" },
    });
  } catch (e) {
    return Response.json({ error: String(e.message || e), articles: [] }, { status: 502 });
  }
}
