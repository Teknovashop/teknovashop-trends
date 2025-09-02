// scripts/utils.mjs

// slugify simple (sin dependencias externas)
export function slugify(str = '') {
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Amazon búsqueda con tag de afiliado
export function affAmazonSearch(q, tag) {
  const u = new URL('https://www.amazon.es/s');
  u.searchParams.set('k', q);
  u.searchParams.set('language', 'es_ES');
  if (tag) u.searchParams.set('tag', tag);
  return u.toString();
}

export function affAliExpressSearch(q) {
  const u = new URL('https://es.aliexpress.com/wholesale');
  u.searchParams.set('SearchText', q);
  return u.toString();
}

export function affSheinSearch(q) {
  // búsqueda genérica en SHEIN (ES)
  const u = new URL('https://es.shein.com/pdsearch');
  u.searchParams.set('keyword', q);
  return u.toString();
}
