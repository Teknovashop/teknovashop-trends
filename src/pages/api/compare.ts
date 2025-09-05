// src/pages/api/compare.ts
// Comparador informativo: Google Shopping (SerpAPI) + Amazon (Rainforest, opcional).
// Acepta GET y POST. Params: q (obligatorio), country (ES por defecto), debug (opcional).
// Requiere: SERPAPI_KEY (obligatorio). RAINFOREST_API_KEY (opcional).
// No usa afiliados. Solo devuelve URLs públicas y precios si están disponibles.

export const prerender = false;

type Offer = {
  source: 'google_shopping' | 'amazon';
  seller?: string;
  title: string;
  price?: number;
  currency?: string;
  url: string;
  country: string;
  logo?: string;
};

// Utilidades pequeñas
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });

const truthy = (v: any) =>
  ['1', 'true', 'yes', 'on'].includes(String(v ?? '').trim().toLowerCase());

const countryToGlHl: Record<string, { gl: string; hl: string; currency: string; amazon_domain?: string; serp_location?: string }> = {
  ES: { gl: 'es', hl: 'es', currency: 'EUR', amazon_domain: 'amazon.es', serp_location: 'Spain' },
  US: { gl: 'us', hl: 'en', currency: 'USD', amazon_domain: 'amazon.com', serp_location: 'United States' },
  GB: { gl: 'uk', hl: 'en', currency: 'GBP', amazon_domain: 'amazon.co.uk', serp_location: 'United Kingdom' },
  DE: { gl: 'de', hl: 'de', currency: 'EUR', amazon_domain: 'amazon.de', serp_location: 'Germany' },
  FR: { gl: 'fr', hl: 'fr', currency: 'EUR', amazon_domain: 'amazon.fr', serp_location: 'France' },
  IT: { gl: 'it', hl: 'it', currency: 'EUR', amazon_domain: 'amazon.it', serp_location: 'Italy' },
  MX: { gl: 'mx', hl: 'es', currency: 'MXN', amazon_domain: 'amazon.com.mx', serp_location: 'Mexico' },
  AR: { gl: 'ar', hl: 'es', currency: 'ARS', serp_location: 'Argentina' },
  CO: { gl: 'co', hl: 'es', currency: 'COP', serp_location: 'Colombia' },
  CL: { gl: 'cl', hl: 'es', currency: 'CLP', serp_location: 'Chile' },
  PE: { gl: 'pe', hl: 'es', currency: 'PEN', serp_location: 'Peru' },
};

function domainFavicon(url: string) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
  } catch {
    return undefined;
  }
}

async function fetchSerpApi(q: string, country: string, key?: string) {
  const debug: any = { enabled: !!key };
  if (!key) return { offers: [] as Offer[], debug: { ...debug, skipped: 'no_key' } };

  const cfg = countryToGlHl[country] || countryToGlHl.ES;
  const params = new URLSearchParams({
    engine: 'google_shopping',
    q,
    api_key: key,
    gl: cfg.gl,
    hl: cfg.hl,
  });
  if (cfg.serp_location) params.set('location', cfg.serp_location);

  const url = `https://serpapi.com/search.json?${params.toString()}`;

  try {
    const res = await fetch(url);
    debug.status = res.status;
    if (!res.ok) {
      debug.error = await res.text().catch(() => 'http_error');
      return { offers: [] as Offer[], debug };
    }
    const data = await res.json();
    const items = (data?.shopping_results || []) as any[];

    const offers: Offer[] = items
      .map((it) => {
        const price: number | undefined =
          typeof it.extracted_price === 'number'
            ? it.extracted_price
            : typeof it.price === 'string'
            ? Number(String(it.price).replace(/[^\d.,]/g, '').replace('.', '').replace(',', '.'))
            : undefined;

        const url: string = it.link || it.product_link || it.source ? it.link : '';
        const seller: string | undefined = it.source || it.store || it.seller || undefined;

        if (!url) return null;

        return {
          source: 'google_shopping',
          seller,
          title: it.title || '',
          price,
          currency: cfg.currency,
          url,
          country,
          logo: domainFavicon(url),
        } as Offer;
      })
      .filter(Boolean) as Offer[];

    debug.count = offers.length;
    return { offers, debug };
  } catch (e: any) {
    debug.exception = e?.message || String(e);
    return { offers: [] as Offer[], debug };
  }
}

async function fetchRainforest(q: string, country: string, key?: string) {
  const debug: any = { enabled: !!key };
  if (!key) return { offers: [] as Offer[], debug: { ...debug, skipped: 'no_key' } };

  const cfg = countryToGlHl[country] || countryToGlHl.ES;
  const domain = cfg.amazon_domain || 'amazon.es';
  const params = new URLSearchParams({
    api_key: key,
    type: 'search',
    amazon_domain: domain,
    search_term: q,
  });
  const url = `https://api.rainforestapi.com/request?${params.toString()}`;

  try {
    const res = await fetch(url);
    debug.status = res.status;
    if (!res.ok) {
      debug.error = await res.text().catch(() => 'http_error');
      return { offers: [] as Offer[], debug };
    }
    const data = await res.json();
    const items = (data?.search_results || []) as any[];

    const offers: Offer[] = items
      .map((it) => {
        const url = it.link || it.product_link;
        const price: number | undefined = it.price?.value ?? undefined;
        const currency = it.price?.currency || cfg.currency;
        if (!url) return null;

        return {
          source: 'amazon',
          seller: it.seller || 'Amazon',
          title: it.title || '',
          price,
          currency,
          url,
          country,
          logo: domainFavicon(url),
        } as Offer;
      })
      .filter(Boolean) as Offer[];

    debug.count = offers.length;
    return { offers, debug };
  } catch (e: any) {
    debug.exception = e?.message || String(e);
    return { offers: [] as Offer[], debug };
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET({ request }: { request: Request }) {
  return handle(request);
}
export async function POST({ request }: { request: Request }) {
  return handle(request);
}

async function handle(request: Request) {
  // 1) Leer parámetros desde querystring y/o body JSON
  let q: string | null = null;
  let country = 'ES';
  let debugFlag = false;

  try {
    const u = new URL(request.url);
    q = u.searchParams.get('q');
    const c = u.searchParams.get('country');
    if (c) country = c.toUpperCase();
    debugFlag = truthy(u.searchParams.get('debug'));
  } catch {
    // noop
  }

  if (!q && request.method === 'POST') {
    try {
      const body = await request.json();
      q = body?.q ?? q;
      if (body?.country) country = String(body.country).toUpperCase();
      if (body?.debug !== undefined) debugFlag = truthy(body.debug);
    } catch {
      // body vacío o no-JSON
    }
  }

  if (!q || !q.trim()) {
    return json(
      {
        error: 'Missing q',
        hint:
          'Usa ?q=marca%20modelo o body JSON { "q": "marca modelo" }',
        example: '/api/compare?q=Philips%2024E1N1100A&country=ES&debug=1',
      },
      400
    );
  }
  q = q.trim();
  country = (countryToGlHl[country]?.gl && country) || 'ES';

  // 2) Providers
  const SERPAPI_KEY = process.env.SERPAPI_KEY;
  const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY;

  const [serp, rain] = await Promise.all([
    fetchSerpApi(q, country, SERPAPI_KEY),
    fetchRainforest(q, country, RAINFOREST_API_KEY),
  ]);

  // 3) Fusionar, limpiar, quitar duplicados por URL
  const byUrl = new Map<string, Offer>();
  [...serp.offers, ...rain.offers].forEach((o) => {
    if (!o?.url) return;
    if (!byUrl.has(o.url)) byUrl.set(o.url, o);
    else {
      // si ya existe, conserva el de precio más bajo
      const prev = byUrl.get(o.url)!;
      const best =
        prev.price && o.price ? (o.price < prev.price ? o : prev) : prev.price ? prev : o;
      byUrl.set(o.url, best);
    }
  });

  let offers = Array.from(byUrl.values());

  // 4) Ordenar por precio (si hay), luego por fuente
  offers = offers.sort((a, b) => {
    if (a.price && b.price) return a.price - b.price;
    if (a.price && !b.price) return -1;
    if (!a.price && b.price) return 1;
    return (a.source || '').localeCompare(b.source || '');
  });

  const payload: any = {
    query: q,
    country,
    count: offers.length,
    offers,
  };

  if (debugFlag) {
    payload.debug = {
      serpapi: serp.debug,
      rainforest: rain.debug,
    };
  }

  return json(payload, 200);
}
