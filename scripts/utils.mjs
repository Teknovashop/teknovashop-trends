import slugifyLib from 'slugify';
export function slugify(s){ return slugifyLib(s,{lower:true,strict:true}); }
export function affAmazonSearch(q, tag){ const u=new URL('https://www.amazon.es/s'); u.searchParams.set('k',q); u.searchParams.set('tag',tag||'teknovashop-21'); return u.toString(); }
export function affAliExpressSearch(q){ const u=new URL('https://www.aliexpress.com/wholesale'); u.searchParams.set('SearchText',q); return u.toString(); }
export function affSheinSearch(q){ const u=new URL('https://www.shein.com/pdsearch'); u.searchParams.set('q',q); return u.toString(); }
export function imagePrompt(title){ return `product collage, infographic style, flat lay, white background, trending item: ${title}`; }
export function reviewPromptES(title) {
  return `Eres redactor de ecommerce en español (España). Escribe una mini-review (60–90 palabras) del producto "${title}". 
- Tono claro, útil y honesto.
- Incluye sección: "Pros:" (3 bullets) y "Contras:" (2 bullets).
- Cierra con "Recomendación:" breve (1 frase).
- No inventes especificaciones técnicas.`;
}
export function imagePrompt(title) {
  // estética del logo: neón/tecnología limpia
  return `Producto destacado: ${title}.
Estilo: fotografía de producto limpia sobre fondo neutro, iluminación suave, estética tecnológica moderna, acentos neón azules/morados.
Composición: formato 16:9 horizontal, enfoque nítido, sin texto ni marcas, sin manos, sin logotipos.`;
}
