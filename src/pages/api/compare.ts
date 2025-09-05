// src/pages/api/compare.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
export const prerender = false;

/**
 * Comparador informativo (API):
 * - Entrada: ?q=texto&country=ES&debug=1
 * - Salida: { query, country, count, sources: {google_shopping, amazon}, offers:[...] }
 *
 * Requiere:
 * - SERPAPI_KEY (obligatorio para Google Shopping)
 * - RAINFOREST_API_KEY (opcional, Amazon)
 */

type Offer = {
  source: "google_shopping" | "amazon";
  seller?: string;
  title: string;
  price?: number;
  currency?: string;
  url: string;
  logo?: string;
};

const COUNTRY_PRESETS: Record<
  string,
  { gl: string; hl: string; currency: string; amazonDomain: string }
> = {
  ES: { gl: "es", hl: "es", currency: "EUR", amazonDomain: "amazon.es" },
  US: { gl: "us", hl: "en", currency: "USD", amazonDomain: "amazon.com" },
  FR: { gl: "fr", hl: "fr", currency: "EUR", amazonDomain: "amazon.fr" },
  DE: { gl: "de", hl: "de", currency: "EUR", amazonDomain: "amazon.de" },
  IT: { gl: "it", hl: "it", currency: "EUR", amazonDomain: "amazon.it" },
  GB: { gl: "uk", hl: "en", currency: "GBP", amazonDomain: "amazon.co.uk" },
  MX: { gl: "mx", hl: "es", currency: "MXN", amazonDomain: "amazon.com.mx" },
};

const STOPWORDS = new Set([
  "the",
  "and",
  "de",
  "la",
  "el",
  "los",
  "las",
  "y",
  "con",
  "para",
  "del",
  "a",
  "una",
  "un",
  "por",
  "of",
  "en",
  "series",
  "modelo",
  "smart",
  "nuevo",
  "new",
]);

function cleanText(s = "") {
  return s
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string) {
  return cleanText(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

function softMatch(title: string, q: string) {
  // Coincidencia blanda: al menos uno de los tokens significativos aparece
  const tt = title.toLowerCase();
  const qs = tokens(q);
  if (!qs.length) return true;
  return qs.some((t) => tt.includes(t));
}

function parsePrice(text?: string): number | undefined {
  if (!text) return undefined;
  // Ej.: "199,99 €", "€199.00", "1.299,00 EUR"
  const cleaned = text.replace(/[^\d.,]/g, "");
  if (!cleaned) return undefined;
  // Si hay coma y punto, intentar heurística EU
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // más dígitos a la izquierda del separador mayoritario
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      // europeo: 1.299,00
      return Number(cleaned.replace(/\./g, "").replace(",", "."));
    }
    // US: 1,299.00
    return Number(cleaned.replace(/,/g, ""));
  }
  // Solo coma -> europeo
  if (cleaned.includes(",") && !cleaned.includes(".")) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."));
  }
  // Solo punto
  return Number(cleaned);
}

function faviconFor(url: string) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
  } catch {
    return undefined;
  }
}

function dedupe(offers: Offer[]) {
  const seen = new Set<string>();
  const out: Offer[] = [];
  for (const o of offers) {
    const key = `${o.title.toLowerCase()}|${safeHost(o.url)}|${o.source}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(o);
    }
  }
  return out;
}

function safeHost(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

function byPriceAsc(a: Offer, b: Offer) {
  if (a.price == null && b.price == null) return 0;
  if (a.price == null) return 1;
  if (b.price == null) return -1;
  return a.price - b.price;
}

async function fetchSerpApi(
  q: string,
  country: string,
  serpKey?: string
): Promise<Offer[]> {
  if (!serpKey) return [];
  const preset = COUNTRY_PRESETS[country] || COUNTRY_PRESETS["ES"];
  const params = new URLSearchParams({
    engine: "google_shopping",
    q,
    api_key: serpKey,
    gl: preset.gl,
    hl: preset.hl,
    num: "20",
  });
  const url = `https://serpapi.com/search.json?${params.toString()}`;
  const res = await fetch(url, { headers: { "User-Agent": "TeknovashopBot/1.0" } });
  if (!res.ok) return [];
  const data = await res.json();

  const items: Offer[] = [];
  const list: any[] =
    data?.shopping_results ||
    data?.product_results ||
    data?.inline_shopping_results ||
    [];

  for (const it of list) {
    const title = it?.title || it?.name || "";
    const priceText = it?.price || it?.extracted_price?.toString() || "";
    const link = it?.link || it?.product_link || "";
    const merchant = it?.source || it?.seller || it?.merchant || it?.store || "";
    const curr = preset.currency;
    const price = parsePrice(priceText) ?? it?.extracted_price;

    if (!title || !link) continue;

    items.push({
      source: "google_shopping",
      seller: merchant,
      title: title,
      price: typeof price === "number" ? price : undefined,
      currency: curr,
      url: link,
      logo: faviconFor(link),
    });
  }
  return items;
}

async function fetchAmazonRainforest(
  q: string,
  country: string,
  rainforestKey?: string
): Promise<Offer[]> {
  if (!rainforestKey) return [];
  const preset = COUNTRY_PRESETS[country] || COUNTRY_PRESETS["ES"];
  const params = new URLSearchParams({
    api_key: rainforestKey,
    type: "search",
    amazon_domain: preset.amazonDomain,
    search_term: q,
  });
  const url = `https://api.rainforestapi.com/request?${params.toString()}`;
  const res = await fetch(url, { headers: { "User-Agent": "TeknovashopBot/1.0" } });
  if (!res.ok) return [];
  const data = await res.json();

  const items: Offer[] = [];
  const list: any[] = data?.search_results || [];
  for (const it of list) {
    const title = it?.title || "";
    const link = it?.link || it?.product_link || "";
    const priceText =
      it?.price?.raw ||
      it?.prices?.[0]?.raw ||
      it?.buybox_winner?.price?.raw ||
      "";
    const price = parsePrice(priceText);
    const curr = COUNTRY_PRESETS[country]?.currency || "EUR";

    if (!title || !link) continue;
    items.push({
      source: "amazon",
      seller: "Amazon",
      title,
      price,
      currency: curr,
      url: link,
      logo: faviconFor(link),
    });
  }
  return items;
}

function expandQueries(q: string): string[] {
  const base = cleanText(q);
  const out = [base];
  // Si es muy genérico, probamos variaciones para conseguir resultados
  if (tokens(base).length <= 2) {
    out.push(`${base} precio`, `${base} comprar`, `${base} review`);
  }
  // Soportar entradas separadas por coma: "producto A, producto B"
  if (base.includes(",")) {
    out.push(
      ...base
        .split(",")
        .map((s) => cleanText(s))
        .filter(Boolean)
    );
  }
  return Array.from(new Set(out)).slice(0, 6);
}

export async function GET(ctx: any) {
  try {
    const url = new URL(ctx.request.url);
    const qRaw = url.searchParams.get("q") || "";
    const q = cleanText(qRaw);
    const country = (url.searchParams.get("country") || "ES").toUpperCase();
    const debug = url.searchParams.get("debug");
    if (!q) {
      return json({ error: "Missing q" }, 400);
    }

    const SERPAPI_KEY = process.env.SERPAPI_KEY || "";
    const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY || "";

    const variants = expandQueries(q);

    let offers: Offer[] = [];
    let sources = { google_shopping: 0, amazon: 0 };

    for (const query of variants) {
      // 1) Google Shopping (SerpAPI)
      const serp = await fetchSerpApi(query, country, SERPAPI_KEY);
      const serpFiltered = serp.filter((o) => softMatch(o.title, q));
      sources.google_shopping += serpFiltered.length;
      offers.push(...serpFiltered);

      // Si ya tenemos bastantes, paramos temprano
      if (offers.length >= 24) break;

      // 2) Amazon (Rainforest) como complemento
      const amz = await fetchAmazonRainforest(query, country, RAINFOREST_API_KEY);
      const amzFiltered = amz.filter((o) => softMatch(o.title, q));
      sources.amazon += amzFiltered.length;
      offers.push(...amzFiltered);

      if (offers.length >= 24) break;
    }

    // Deduplicar y ordenar
    offers = dedupe(offers);

    // Intentar equilibrar por dominio (máx 4 por dominio)
    const perHost: Record<string, number> = {};
    const balanced: Offer[] = [];
    for (const o of offers.sort(byPriceAsc)) {
      const host = safeHost(o.url);
      perHost[host] = (perHost[host] || 0) + 1;
      if (perHost[host] <= 4) balanced.push(o);
      if (balanced.length >= 24) break;
    }

    const payload = {
      query: q,
      country,
      count: balanced.length,
      sources,
      offers: balanced,
    };

    // Si debug, devolvemos JSON legible
    if (debug) {
      return new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    return json(payload);
  } catch (e: any) {
    return json({ error: e?.message || "Internal error" }, 500);
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
