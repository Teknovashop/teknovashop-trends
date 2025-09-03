import type { APIRoute } from "astro";

/**
 * Metabuscador informativo (SIN afiliación, SIN scraping)
 * Devuelve enlaces de búsqueda por país en plataformas relevantes.
 * Cuando tengas APIs oficiales, aquí podremos traer precios reales y calcular el “mejor precio”.
 */

const COUNTRY_CFG: Record<string, {
  amazon?: string;           // TLD Amazon
  ebay?: string;             // dominio eBay país
  googleShopping?: string;   // cc para Google Shopping
  extra?: Array<{ name: string; build: (q: string) => string }>;
}> = {
  ES: {
    amazon: "es",
    ebay: "https://www.ebay.es/sch/i.html",
    googleShopping: "es",
    extra: [
      { name: "PcComponentes", build: q => `https://www.pccomponentes.com/buscar/?query=${encodeURIComponent(q)}` },
      { name: "MediaMarkt", build: q => `https://www.mediamarkt.es/es/search.html?query=${encodeURIComponent(q)}` },
      { name: "Idealo", build: q => `https://www.idealo.es/precios/Ofertas?qs=${encodeURIComponent(q)}` },
    ],
  },
  FR: {
    amazon: "fr",
    ebay: "https://www.ebay.fr/sch/i.html",
    googleShopping: "fr",
    extra: [
      { name: "Cdiscount", build: q => `https://www.cdiscount.com/search/10/${encodeURIComponent(q)}.html` },
      { name: "Rue du Commerce", build: q => `https://www.rueducommerce.fr/recherche/${encodeURIComponent(q)}` },
      { name: "Idealo", build: q => `https://www.idealo.fr/prix/mainz.jsp?q=${encodeURIComponent(q)}` },
    ],
  },
  DE: {
    amazon: "de",
    ebay: "https://www.ebay.de/sch/i.html",
    googleShopping: "de",
    extra: [
      { name: "Idealo", build: q => `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encodeURIComponent(q)}` },
      { name: "MediaMarkt", build: q => `https://www.mediamarkt.de/de/search.html?query=${encodeURIComponent(q)}` },
      { name: "Saturn", build: q => `https://www.saturn.de/de/search.html?query=${encodeURIComponent(q)}` },
    ],
  },
  IT: {
    amazon: "it",
    ebay: "https://www.ebay.it/sch/i.html",
    googleShopping: "it",
    extra: [
      { name: "Idealo", build: q => `https://www.idealo.it/cerca/prezzi?q=${encodeURIComponent(q)}` },
      { name: "MediaWorld", build: q => `https://www.mediaworld.it/search?q=${encodeURIComponent(q)}` },
    ],
  },
  PT: {
    amazon: "es", // Amazon ES suele servir PT
    ebay: "https://www.ebay.es/sch/i.html",
    googleShopping: "pt",
    extra: [
      { name: "Worten", build: q => `https://www.worten.pt/search?query=${encodeURIComponent(q)}` },
      { name: "KuantoKusta", build: q => `https://www.kuantokusta.pt/search?q=${encodeURIComponent(q)}` },
    ],
  },
  UK: {
    amazon: "co.uk",
    ebay: "https://www.ebay.co.uk/sch/i.html",
    googleShopping: "uk",
    extra: [
      { name: "Argos", build: q => `https://www.argos.co.uk/search/${encodeURIComponent(q)}/` },
      { name: "John Lewis", build: q => `https://www.johnlewis.com/search?search-term=${encodeURIComponent(q)}` },
    ],
  },
  US: {
    amazon: "com",
    ebay: "https://www.ebay.com/sch/i.html",
    googleShopping: "us",
    extra: [
      { name: "Walmart", build: q => `https://www.walmart.com/search?q=${encodeURIComponent(q)}` },
      { name: "Best Buy", build: q => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}` },
      { name: "Newegg", build: q => `https://www.newegg.com/p/pl?d=${encodeURIComponent(q)}` },
    ],
  },
  CA: {
    amazon: "ca",
    ebay: "https://www.ebay.ca/sch/i.html",
    googleShopping: "ca",
    extra: [
      { name: "Best Buy", build: q => `https://www.bestbuy.ca/en-ca/search?search=${encodeURIComponent(q)}` },
      { name: "Walmart", build: q => `https://www.walmart.ca/search?q=${encodeURIComponent(q)}` },
    ],
  },
  MX: {
    amazon: "com.mx",
    ebay: "https://www.ebay.com/sch/i.html", // eBay global
    googleShopping: "mx",
    extra: [
      { name: "Mercado Libre", build: q => `https://listado.mercadolibre.com.mx/${encodeURIComponent(q)}` },
      { name: "Liverpool", build: q => `https://www.liverpool.com.mx/tienda?s=${encodeURIComponent(q)}` },
      { name: "SEARS", build: q => `https://www.sears.com.mx/resultados?q=${encodeURIComponent(q)}` },
    ],
  },
  BR: {
    amazon: "com.br",
    ebay: "https://www.ebay.com/sch/i.html",
    googleShopping: "br",
    extra: [
      { name: "Mercado Livre", build: q => `https://lista.mercadolivre.com.br/${encodeURIComponent(q)}` },
      { name: "Americanas", build: q => `https://www.americanas.com.br/busca/${encodeURIComponent(q)}` },
    ],
  },
  AR: {
    amazon: "com", // fallback
    ebay: "https://www.ebay.com/sch/i.html",
    googleShopping: "ar",
    extra: [
      { name: "Mercado Libre", build: q => `https://listado.mercadolibre.com.ar/${encodeURIComponent(q)}` },
      { name: "Frávega", build: q => `https://www.fravega.com/l/?keyword=${encodeURIComponent(q)}` },
    ],
  },
  CL: {
    amazon: "com", // fallback
    ebay: "https://www.ebay.com/sch/i.html",
    googleShopping: "cl",
    extra: [
      { name: "Mercado Libre", build: q => `https://listado.mercadolibre.cl/${encodeURIComponent(q)}` },
      { name: "Falabella", build: q => `https://www.falabella.com/falabella-cl/search?Ntt=${encodeURIComponent(q)}` },
    ],
  },
  CO: {
    amazon: "com", // fallback
    ebay: "https://www.ebay.com/sch/i.html",
    googleShopping: "co",
    extra: [
      { name: "Mercado Libre", build: q => `https://listado.mercadolibre.com.co/${encodeURIComponent(q)}` },
      { name: "Éxito", build: q => `https://www.exito.com/s?q=${encodeURIComponent(q)}` },
    ],
  },
  GLOBAL: {
    amazon: "com",
    ebay: "https://www.ebay.com/sch/i.html",
    googleShopping: "global",
    extra: [
      { name: "AliExpress", build: q => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}` },
      { name: "Google Shopping", build: q => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}` },
    ],
  },
};

function amazonSearchUrl(q: string, tld: string) {
  const u = new URL(`https://www.amazon.${tld}/s`);
  u.searchParams.set("k", q);
  return u.toString();
}
function ebaySearchUrl(q: string, base: string) {
  const u = new URL(base);
  u.searchParams.set("_nkw", q);
  return u.toString();
}
function googleShoppingUrl(q: string, cc?: string) {
  // Shopping genérico; el cc es orientativo (el UI de Google decide la localización final)
  return `https://www.google.com/search?tbm=shop&gl=${encodeURIComponent(cc || "us")}&hl=en&q=${encodeURIComponent(q)}`;
}

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") || "").trim();
  const country = (url.searchParams.get("country") || "ES").toUpperCase();

  if (!q) {
    return new Response(JSON.stringify({ items: [], country }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const cfg = COUNTRY_CFG[country] ?? COUNTRY_CFG.ES;

  const items: Array<{ store: string; title: string; url: string }> = [];

  // Amazon
  if (cfg.amazon) items.push({ store: "Amazon", title: q, url: amazonSearchUrl(q, cfg.amazon) });

  // eBay
  if (cfg.ebay) items.push({ store: "eBay", title: q, url: ebaySearchUrl(q, cfg.ebay) });

  // Google Shopping
  if (cfg.googleShopping)
    items.push({ store: "Google Shopping", title: q, url: googleShoppingUrl(q, cfg.googleShopping) });

  // Extras por país
  (cfg.extra || []).forEach(e => items.push({ store: e.name, title: q, url: e.build(q) }));

  return new Response(JSON.stringify({ items, country }), {
    headers: { "Content-Type": "application/json" },
  });
};
