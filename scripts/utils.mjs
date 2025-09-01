// scripts/utils.mjs

// ------------------------------
// Utilidades de texto / slugs
// ------------------------------
export function slugify(str = '') {
  return String(str)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 96);
}

// ------------------------------
// Prompts IA (ESPAÑOL - España)
// ------------------------------
export function reviewPromptES(title) {
  return `Eres redactor de ecommerce en español (España). Escribe una mini-review (60–90 palabras) del producto "${title}".
- Tono claro, útil y honesto, sin adornos.
- Incluye secciones exactamente así:
Pros:
- (3 viñetas)
Contras:
- (2 viñetas)
Recomendación: (1 frase final)
No inventes especificaciones técnicas. No añadas títulos ni formatos extra.`;
}

export function imagePrompt(title) {
  // estética profesional alineada con tu marca (neón/tech, limpio)
  return `Fotografía de producto: ${title}.
Estilo: fotografía limpia de producto sobre fondo neutro, iluminación suave, estética tecnológica moderna con acentos neón azules/morados.
Composición: formato 16:9 horizontal (1024x576), enfoque nítido, sin manos, sin texto, sin logotipos ni marcas.
Aspecto realista y comercial.`;
}

// ------------------------------
// Enlaces de afiliado
// ------------------------------

// Amazon ES: search con tag de tracking
export function affAmazonSearch(query, tag = 'teknovashop-21') {
  const q = encodeURIComponent(query);
  return `https://www.amazon.es/s?k=${q}&tag=${encodeURIComponent(tag)}&language=es_ES`;
}

// AliExpress: búsqueda simple con local ES
export function affAliExpressSearch(query) {
  const q = encodeURIComponent(query);
  // Si tienes program afiliado, sustituye por tu enlace deep-link
  return `https://es.aliexpress.com/wholesale?SearchText=${q}`;
}

// SHEIN: categoría general con query
export function affSheinSearch(query) {
  const q = encodeURIComponent(query);
  return `https://es.shein.com/pdsearch/${q}/`;
}
