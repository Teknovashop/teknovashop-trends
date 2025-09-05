// src/pages/api/compare.ts
// Devuelve una lista normalizada de {source, seller, title, price, currency, url, country, logo?}
// Fuentes soportadas (según ENV disponibles):
// - SERPAPI (Google Shopping)
// - Rainforest API (Amazon)
// - AliExpress (RapidAPI: aliexpress-datahub)

import type { APIRoute } from 'astro';

const SERPAPI_KEY = process.env.SERPAPI_KEY || '';
const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY || '';
const ALIEXPRESS_RAPIDAPI_KEY = process.env.ALIEXPRESS_RAPIDAPI_KEY || '';

type Offer = {
  source: 'google_shopping' | 'amazon' | 'aliexpress';
  seller?: string;
  title: string;
  price: number;
  currency: string;
  url: string;
  country?: string;
  logo?: string;
};

function parsePrice(p?: string | number): number | null {
  if (typeof p === 'number') return p;
  if (!p) return null;
  const n = Number(String(p).replace(/[^\d.,]/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}

function domainForCountry(country: string) {
  const c = country.toUpperCase();
  // Ajusta según tus mercados principales
  const map: Record<string, string> = {
    ES: 'amazon.es',
    MX: 'amazon.com.mx',
    US: 'amazon.com',
    GB: 'amazon.co.uk',
    DE: 'amazon.de',
    FR: 'amazon.fr',
    IT: 'amazon.it',
    BR: 'amazon.com.br',
  };
  return map[c] || 'amazon.es';
}

function serpParamsByCountry(country: string) {
  // hl (idioma UI), gl (geolocalización), location (afina aún más)
  const c = country.toUpperCase();
  if (c === 'ES') return { hl: 'es', gl: 'es', location: 'Spain' };
  if (c === 'MX') return { hl: 'es', gl: 'mx', location: 'Mexico' };
  if (c === 'US') return { hl: 'en', gl: 'us', location: 'United States' };
  if (c === 'GB') return { hl: 'en', gl: 'uk', location: 'United Kingdom' };
  if (c === 'DE') return { hl: 'de', gl: 'de', location: 'Germany' };
  if (c === 'FR') return { hl: 'fr', gl: 'fr', location: 'France' };
  if (c === 'IT') return { hl: 'it', gl: 'it', location: 'Italy' };
  return { hl: 'es', gl: 'es', location: 'Spain' };
}

// ------------------- Providers -------------------

async function fromSerpApi(q: string, country: string): Promise<Offer[]> {
  if (!SERPAPI_KEY) return [];
  const { hl, gl, location } = serpParamsByCountry(country);
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_shopping');
  url.searchParams.set('q', q);
  url.searchParams.set('hl', hl);
  url.searchParams.set('gl', gl);
  url.searchParams.set('location', location);
  url.searchParams.set('api_key', SERPAPI_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json();

  const items: any[] = data?.shopping_results || [];
  const out: Offer[] = [];

  for (const it of items) {
    const priceNum = parsePrice(it?.extracted_price ?? it?.price);
    const currency = (it?.currency || it?.price_currency || '').toUpperCase() || 'EUR';
    if (!priceNum || !it?.link) continue;
    out.push({
      source: 'google_shopping',
      seller: it?.source || it?.merchant || undefined,
      title: it?.title || q,
      price: priceNum,
      currency,
      url: it.link,
      country: country.toUpperCase(),
      logo: it?.thumbnail
    });
  }

  return out;
}

async function fromRainforest(q: string, country: string): Promise<Offer[]> {
  if (!RAINFOREST_API_KEY) return [];
  const domain = domainForCountry(country);
  const url = new URL('https://api.rainforestapi.com/request');
  url.searchParams.set('api_key', RAINFOREST_API_KEY);
  url.searchParams.set('type', 'search');
  url.searchParams.set('amazon_domain', domain);
  url.searchParams.set('search_term', q);
  url.searchParams.set('output', 'json');

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json();

  const products: any[] = data?.search_results || [];
  const out: Offer[] = [];
  for (const p of products.slice(0, 10)) {
    const priceNum = parsePrice(p?.price?.value);
    const currency = (p?.price?.currency || '').toUpperCase() || 'EUR';
    if (!priceNum || !p?.link) continue;
    out.push({
      source: 'amazon',
      seller: 'Amazon',
      title: p?.title || q,
      price: priceNum,
      currency,
      url: p.link,
      country: country.toUpperCase(),
      logo: p?.image
    });
  }
  return out;
}

async function fromAliExpress(q: string, country: string): Promise<Offer[]> {
  if (!ALIEXPRESS_RAPIDAPI_KEY) return [];
  // RapidAPI: aliexpress-datahub (o similar con respuesta: items[{title, price, currency, product_url, store_name}])
  // Documentación puede variar; este mapeo funciona con los proveedores más usados.
  const url = new URL('https://aliexpress-datahub.p.rapidapi.com/item_search_v2');
  url.searchParams.set('q', q);
  url.searchParams.set('page', '1');

  const res = await fetch(url.toString(), {
    headers: {
      'X-RapidAPI-Key': ALIEXPRESS_RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'aliexpress-datahub.p.rapidapi.com'
    }
  });
  if (!res.ok) return [];
  const data = await res.json();

  const items: any[] = data?.result?.resultList || data?.result || data?.items || [];
  const out: Offer[] = [];
  for (const it of items.slice(0, 10)) {
    const priceNum = parsePrice(it?.price || it?.targetSalePrice || it?.sale_price);
    const currency = (it?.currency || it?.targetSalePriceCurrency || 'USD').toUpperCase();
    const url = it?.product_url || it?.targetUrl || it?.link;
    if (!priceNum || !url) continue;
    out.push({
      source: 'aliexpress',
      seller: it?.store_name || 'AliExpress',
      title: it?.title || q,
      price: priceNum,
      currency,
      url,
      country: country.toUpperCase(),
      logo: it?.image || it?.imageUrl
    });
  }
  return out;
}

// ------------------- Handler -------------------

export const GET: APIRoute = async ({ url }) => {
  try {
    const q = (url.searchParams.get('q') || '').trim();
    const country = (url.searchParams.get('country') || 'ES').toUpperCase();

    if (!q) {
      return new Response(JSON.stringify({ error: 'Missing q' }), { status: 400 });
    }

    // Ejecutar proveedores en paralelo (sólo los que tengan clave)
    const [googleOffers, amazonOffers, aliOffers] = await Promise.all([
      fromSerpApi(q, country).catch(() => []),
      fromRainforest(q, country).catch(() => []),
      fromAliExpress(q, country).catch(() => [])
    ]);

    // Unificar y ordenar por precio ascendente
    const all = [...googleOffers, ...amazonOffers, ...aliOffers]
      .filter(o => o && Number.isFinite(o.price))
      .sort((a, b) => a.price - b.price);

    return new Response(JSON.stringify({
      query: q,
      country,
      count: all.length,
      offers: all
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), { status: 500 });
  }
};
