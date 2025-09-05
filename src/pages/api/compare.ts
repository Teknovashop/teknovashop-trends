import type { APIRoute } from "astro";

// ====== Config y utilidades
const SERPAPI_KEY = process.env.SERPAPI_KEY || "";
const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY || "";
const USER_AGENT = "TeknovashopCompareBot/1.0 (+https://teknovashop.com)";

type Offer = {
  source: string;     // "google_shopping" | "amazon" | ...
  seller: string;     // nombre tienda
  title: string;
  price: number;
  currency: string;
  url: string;
  country: string;
  logo?: string;
};

function fail(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const COUNTRY_MAP: Record<
  string,
  { hl: string; gl: string; google_domain: string; amazon_domain: string }
> = {
  ES: { hl: "es", gl: "es", google_domain: "google.es", amazon_domain: "amazon.es" },
  US: { hl: "en", gl: "us", google_domain: "google.com", amazon_domain: "amazon.com" },
  FR: { hl: "fr", gl: "fr", google_domain: "google.fr", amazon_domain: "amazon.fr" },
  DE: { hl: "de", gl: "de", google_domain: "google.de", amazon_domain: "amazon.de" },
  IT: { hl: "it", gl: "it", google_domain: "google.it", amazon_domain: "amazon.it" },
  GB: { hl: "en", gl: "uk", google_domain: "google.co.uk", amazon_domain: "amazon.co.uk" },
  MX: { hl: "es", gl: "mx", google_domain: "google.com.mx", amazon_domain: "amazon.com.mx" },
};

function domain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function parseCurrencySymbol(sym?: string): string {
  if (!sym) return "EUR";
  const s = sym.trim();
  // SerpAPI suele dar "currency": "EUR" o símbolo en "price" parseado.
  if (/^[A-Z]{3}$/.test(s)) return s;
  if (s === "€") return "EUR";
  if (s === "$") return "USD";
  if (s === "£") return "GBP";
  return s;
}

function dedupeAndSort(offers: Offer[]) {
  // Deduplicamos por dominio + título similar (truncado) usando precio mínimo
  const map = new Map<string, Offer>();
  for (const o of offers) {
    const key = `${domain(o.url)}|${o.title.slice(0, 100).toLowerCase()}`;
    const prev = map.get(key);
    if (!prev || o.price < prev.price) map.set(key, o);
  }
  const out = [...map.values()];
  out.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
  return out;
}

// ====== Fuentes

async function fetchSerpApi(q: string, country: string): Promise<Offer[]> {
  if (!SERPAPI_KEY) return [];
  const cfg = COUNTRY_MAP[country] || COUNTRY_MAP.ES;

  const params = new URLSearchParams({
    engine: "google_shopping",
    q,
    api_key: SERPAPI_KEY,
    hl: cfg.hl,
    gl: cfg.gl,
    google_domain: cfg.google_domain,
    num: "50",                    // tratar de sacar bastantes
  });

  const url = `https://serpapi.com/search.json?${params.toString()}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return [];
  const data = await res.json();

  const items: any[] = data?.shopping_results || [];
  const out: Offer[] = [];

  for (const it of items) {
    // SerpAPI suele tener:
    // - title
    // - source (tienda)
    // - link
    // - extracted_price (number) y currency (EUR/USD...)
    // Si no hay extracted_price, intentamos precio textual
    const title = it?.title;
    const seller = it?.source || domain(it?.link || "");
    const url = it?.link || it?.product_link || "";
    const price = Number(it?.extracted_price ?? NaN);
    const currency = parseCurrencySymbol(it?.currency);

    if (!title || !url || !Number.isFinite(price)) continue;

    out.push({
      source: "google_shopping",
      seller: seller || "Tienda",
      title,
      price,
      currency,
      url,
      country,
      logo: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain(url))}&sz=64`,
    });
  }

  return out;
}

async function fetchRainforest(q: string, country: string): Promise<Offer[]> {
  if (!RAINFOREST_API_KEY) return [];
  const cfg = COUNTRY_MAP[country] || COUNTRY_MAP.ES;

  const params = new URLSearchParams({
    api_key: RAINFOREST_API_KEY,
    type: "search",
    amazon_domain: cfg.amazon_domain,
    search_term: q,
  });

  const url = `https://api.rainforestapi.com/request?${params.toString()}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return [];

  const data = await res.json();
  const items: any[] = data?.search_results || [];
  const out: Offer[] = [];

  for (const it of items) {
    const title = it?.title;
    const priceVal = it?.price?.value ?? it?.prices?.[0]?.value;
    const currency = it?.price?.currency ?? it?.prices?.[0]?.currency ?? "EUR";
    const url = it?.link;

    if (!title || !url || !Number.isFinite(Number(priceVal))) continue;

    out.push({
      source: "amazon",
      seller: "Amazon",
      title,
      price: Number(priceVal),
      currency,
      url,
      country,
      logo: "https://www.google.com/s2/favicons?domain=amazon." + cfg.amazon_domain.split(".").pop() + "&sz=64",
    });
  }

  return out;
}

// ====== Handler

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();
    const country = (url.searchParams.get("country") || "ES").toUpperCase();
    const debug = url.searchParams.get("debug") === "1";

    if (!q) return fail(400, "Missing q");

    // Lanzamos en paralelo
    const [serpOffers, rainOffers] = await Promise.all([
      fetchSerpApi(q, country).catch(() => []),
      fetchRainforest(q, country).catch(() => []),
    ]);

    // Si SerpAPI se queda corto, añadimos Amazon como apoyo
    const merged = dedupeAndSort([...serpOffers, ...rainOffers]);

    const payload = {
      query: q,
      country,
      count: merged.length,
      offers: merged,
      sources: {
        google_shopping: serpOffers.length,
        amazon: rainOffers.length,
      },
    };

    return new Response(JSON.stringify(payload, null, debug ? 2 : 0), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (e: any) {
    return fail(500, e?.message || "Internal error");
  }
};
