// src/pages/api/compare.ts
// Comparator backend con dos fuentes opcionales:
//  - Google Shopping vía SerpAPI  (SERPAPI_KEY)
//  - Amazon vía Rainforest API    (RAINFOREST_API_KEY)
// Soporta GET (?q=&country=&debug=1) y POST JSON { q, country, debug }.

import type { APIRoute } from "astro";

const SERPAPI_KEY = process.env.SERPAPI_KEY || "";
const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY || "";

type Offer = {
  source: "google_shopping" | "amazon_rainforest";
  seller?: string;
  title: string;
  price: number;
  currency: string;
  url: string;
  country?: string;
  logo?: string;
};

function parsePrice(p?: string | number): number | null {
  if (typeof p === "number") return isFinite(p) ? p : null;
  if (!p) return null;
  const n = Number(String(p).replace(/[^\d.,]/g, "").replace(",", "."));
  return isFinite(n) ? n : null;
}

function getDomain(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function faviconFor(url: string) {
  const host = getDomain(url);
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : undefined;
}

function serpParamsByCountry(country: string) {
  const c = (country || "ES").toUpperCase();
  switch (c) {
    case "ES": return { hl: "es", gl: "es", location: "Spain", currency: "EUR" };
    case "MX": return { hl: "es", gl: "mx", location: "Mexico", currency: "MXN" };
    case "US": return { hl: "en", gl: "us", location: "United States", currency: "USD" };
    case "GB": return { hl: "en", gl: "uk", location: "United Kingdom", currency: "GBP" };
    case "DE": return { hl: "de", gl: "de", location: "Germany", currency: "EUR" };
    case "FR": return { hl: "fr", gl: "fr", location: "France", currency: "EUR" };
    case "IT": return { hl: "it", gl: "it", location: "Italy", currency: "EUR" };
    default:   return { hl: "es", gl: "es", location: "Spain", currency: "EUR" };
  }
}
function amazonDomainByCountry(country: string) {
  const c = (country || "ES").toUpperCase();
  switch (c) {
    case "ES": return "amazon.es";
    case "MX": return "amazon.com.mx";
    case "US": return "amazon.com";
    case "GB": return "amazon.co.uk";
    case "DE": return "amazon.de";
    case "FR": return "amazon.fr";
    case "IT": return "amazon.it";
    default:   return "amazon.es";
  }
}
function guessCurrencyByDomain(amazon_domain: string): string {
  if (amazon_domain.endsWith(".es")) return "EUR";
  if (amazon_domain.endsWith(".fr")) return "EUR";
  if (amazon_domain.endsWith(".de")) return "EUR";
  if (amazon_domain.endsWith(".it")) return "EUR";
  if (amazon_domain.endsWith(".co.uk")) return "GBP";
  if (amazon_domain.endsWith(".com.mx")) return "MXN";
  return "USD";
}

/* -------------------- Fuente: SerpAPI (Google Shopping) -------------------- */
async function fromSerpApi(q: string, country: string) {
  const debug: any = { enabled: !!SERPAPI_KEY };
  if (!SERPAPI_KEY) return { offers: [] as Offer[], debug: { ...debug, skipped: "no_key" } };

  const { hl, gl, location, currency } = serpParamsByCountry(country);
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", q);
  url.searchParams.set("hl", hl);
  url.searchParams.set("gl", gl);
  url.searchParams.set("location", location);
  url.searchParams.set("api_key", SERPAPI_KEY);

  try {
    const res = await fetch(url.toString());
    debug.status = res.status;
    if (!res.ok) return { offers: [], debug: { ...debug, error: `HTTP ${res.status}` } };

    const data = await res.json();
    const items: any[] = data?.shopping_results || [];
    const out: Offer[] = [];

    for (const it of items) {
      const priceNum = parsePrice(it?.extracted_price ?? it?.price);
      const ccy = (it?.currency || it?.price_currency || currency || "EUR").toUpperCase();
      const link = it?.link;
      if (!priceNum || !link) continue;

      out.push({
        source: "google_shopping",
        seller: it?.source || it?.merchant || getDomain(link),
        title: it?.title || q,
        price: priceNum,
        currency: ccy,
        url: link,
        country: country.toUpperCase(),
        logo: faviconFor(link),
      });
    }

    const seen = new Set<string>();
    const dedup = out.filter((o) => {
      const key = `${getDomain(o.url)}|${o.title.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    dedup.sort((a, b) => a.price - b.price);
    debug.count = dedup.length;
    return { offers: dedup, debug };
  } catch (e: any) {
    return { offers: [], debug: { ...debug, error: e?.message || "fetch_error" } };
  }
}

/* ---------------------- Fuente: Rainforest (Amazon) ------------------------ */
async function fromRainforest(q: string, country: string) {
  const debug: any = { enabled: !!RAINFOREST_API_KEY };
  if (!RAINFOREST_API_KEY) return { offers: [] as Offer[], debug: { ...debug, skipped: "no_key" } };

  const amazon_domain = amazonDomainByCountry(country);
  const url = new URL("https://api.rainforestapi.com/request");
  url.searchParams.set("api_key", RAINFOREST_API_KEY);
  url.searchParams.set("type", "search");
  url.searchParams.set("amazon_domain", amazon_domain);
  url.searchParams.set("search_term", q);

  try {
    const res = await fetch(url.toString());
    debug.status = res.status;
    if (!res.ok) return { offers: [], debug: { ...debug, error: `HTTP ${res.status}` } };

    const data = await res.json();
    const items: any[] = data?.search_results || [];
    const out: Offer[] = [];

    for (const it of items) {
      const priceVal = parsePrice(it?.price?.value ?? it?.price?.raw);
      const currency = (it?.price?.currency || "").toUpperCase() || undefined;
      const link = it?.link || it?.product_link;
      if (!priceVal || !link) continue;

      out.push({
        source: "amazon_rainforest",
        seller: "Amazon",
        title: it?.title || q,
        price: priceVal,
        currency: currency || guessCurrencyByDomain(amazon_domain),
        url: link,
        country: country.toUpperCase(),
        logo: faviconFor(link),
      });
    }

    const seen = new Set<string>();
    const dedup = out.filter((o) => {
      const key = (o.title || "").trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    dedup.sort((a, b) => a.price - b.price);
    debug.count = dedup.length;
    return { offers: dedup, debug };
  } catch (e: any) {
    return { offers: [], debug: { ...debug, error: e?.message || "fetch_error" } };
  }
}

/* --------------------------------- Handler -------------------------------- */
// GET + POST (más robusto en Vercel)
export const ALL: APIRoute = async (ctx) => {
  // 1) Intentar leer desde request.url (fiable en Vercel)
  const url = new URL(ctx.request.url);
  let q = (url.searchParams.get("q") || "").trim();
  let country = (url.searchParams.get("country") || "ES").toUpperCase();
  const wantDebug = url.searchParams.get("debug") === "1";

  // 2) Si viene POST con JSON, sobrescribe (útil si tu UI manda body)
  if (!q && ctx.request.method === "POST") {
    try {
      const body = await ctx.request.json();
      if (body?.q) q = String(body.q).trim();
      if (body?.country) country = String(body.country).toUpperCase();
    } catch {}
  }

  if (!q) {
    return new Response(JSON.stringify({ error: "Missing q" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [serp, rain] = await Promise.allSettled([
    fromSerpApi(q, country),
    fromRainforest(q, country),
  ]);

  const offers: Offer[] = [];
  const dbg: any = { serpapi: undefined as any, rainforest: undefined as any };

  if (serp.status === "fulfilled") {
    offers.push(...serp.value.offers);
    dbg.serpapi = serp.value.debug;
  } else {
    dbg.serpapi = { error: serp.reason?.message || "rejected" };
  }

  if (rain.status === "fulfilled") {
    offers.push(...rain.value.offers);
    dbg.rainforest = rain.value.debug;
  } else {
    dbg.rainforest = { error: rain.reason?.message || "rejected" };
  }

  const seen = new Set<string>();
  const final = offers.filter((o) => {
    const key = `${getDomain(o.url)}|${(o.title || "").trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  final.sort((a, b) => a.price - b.price);

  const payload: any = {
    query: q,
    country,
    count: final.length,
    offers: final,
  };
  if (wantDebug) payload.debug = dbg;

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

// Export explícitos para GET y POST (Astro enruta ALL automáticamente)
export const GET = ALL;
export const POST = ALL;
