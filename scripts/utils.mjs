// scripts/utils.mjs
import slugifyLib from 'slugify';

export function slugify(s) {
  return slugifyLib(s, { lower: true, strict: true, locale: 'es' })
    .replace(/-+/g, '-')
    .slice(0, 80);
}

// ===== Afiliados =====
export function affAmazonSearch(q, tag) {
  // Asegúrate de pasar el tag correcto desde el script principal (o usa env)
  const t = tag || process.env.AMAZON_TAG_ES || 'teknovashop25-21';
  return `https://www.amazon.es/s?k=${encodeURIComponent(q)}&language=es_ES&tag=${encodeURIComponent(t)}`;
}

export function affAliExpressSearch(q) {
  // puedes añadir tu sub_id si lo usas
  return `https://es.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`;
}

export function affSheinSearch(q) {
  return `https://es.shein.com/pdsearch/${encodeURIComponent(q)}/`;
}

// ===== Prompt CF (solo si usas Workers AI para generar imágenes) =====
export function imagePrompt(title) {
  return `Foto de producto realista del siguiente tema: "${title}" sobre fondo blanco, iluminación de estudio, enfoque nítido, 3/4, sin texto ni marca de agua.`;
}

// ===== Refinar consulta de imagen =====
export function refineImageQuery(title, niche = '') {
  // Buscamos fotos tipo "packshot" o realistas de producto
  const base = title
    .replace(/\b(reseña|review|comparativa|opinión|news|noticia)\b/gi, '')
    .trim();

  const extra =
    niche === 'hogar'
      ? ' producto electrodoméstico fondo blanco'
      : ' producto tecnología fondo blanco';

  return `${base} ${extra}`.trim();
}

// Guardar binario a disco
export async function saveBinaryToFile(url, filepath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Descarga falló ${res.status}`);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  await fs.promises.writeFile(filepath, buf);
}
