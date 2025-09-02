// scripts/trends_daily.mjs
import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import trends from 'google-trends-api';
import fetch from 'node-fetch';

// === Config ===
const ROOT = process.cwd();
const NICHES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'niches.json'), 'utf-8'));
const AMAZON_TAG_ES = process.env.AMAZON_TAG_ES || 'teknovashop-21';

const today = new Date();
const yyyy = String(today.getFullYear());
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');

const outDirContent = path.join(ROOT, 'src', 'content', 'trends', yyyy, mm, dd);
fs.mkdirSync(outDirContent, { recursive: true });

const outDirData = path.join(ROOT, 'src', 'data', 'trends', yyyy, mm, dd);
fs.mkdirSync(outDirData, { recursive: true });

const publicDir = path.join(ROOT, 'public', 'trends');
fs.mkdirSync(publicDir, { recursive: true });

// Opcional IA (Cloudflare Workers AI) — si no hay credenciales, usamos fallback
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;

function log(...a){ console.log('[trends]', ...a); }

// -------- Helpers --------

// Texto -> slug
function slugify(s){
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g,'')
    .trim()
    .replace(/\s+/g,'-')
    .slice(0, 90);
}

// Afiliación
function affAmazonSearch(q, tag){
  const u = new URL('https://www.amazon.es/s');
  u.searchParams.set('k', q);
  u.searchParams.set('tag', tag);
  u.searchParams.set('language', 'es_ES');
  return u.toString();
}
function affAliExpressSearch(q){
  const u = new URL('https://es.aliexpress.com/wholesale');
  u.searchParams.set('SearchText', q);
  return u.toString();
}
function affSheinSearch(q){
  const u = new URL('https://es.shein.com/pdsearch/' + encodeURIComponent(q) + '/');
  return u.toString();
}

// Minitraductor EN -> ES (uso rápido sin depender de API externa)
function traducirRapidoAEs(s){
  // Si ya parece español, devolver tal cual (heurística muy simple)
  if (/[áéíóúñ¿¡]/i.test(s)) return s;

  // Diccionario mínimo para titulares frecuentes
  const map = {
    'review': 'reseña',
    'camera': 'cámara',
    'headphones': 'auriculares',
    'wireless': 'inalámbrico',
    'noise cancelling': 'cancelación de ruido',
    'monitor': 'monitor',
    'gaming': 'gaming',
    'ssd': 'SSD',
    'light': 'luz',
    'security': 'seguridad',
    'tablet': 'tableta',
    'robot vacuum': 'robot aspirador',
    'android': 'Android',
    'iphone': 'iPhone',
    'case': 'funda',
    'upgrade': 'mejora'
  };
  let t = s.toLowerCase();
  for (const [en, es] of Object.entries(map)) {
    t = t.replaceAll(en, es);
  }
  // Capitaliza primera letra
  t = t.replace(/^./, m => m.toUpperCase());
  return t;
}

// Cloudflare Workers AI (si está disponible)
async function cfRun(model, payload){
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Workers AI ${res.status}`);
  return await res.json();
}

async function genResumenES(titulo){
  const system = `Eres redactor de comercio electrónico en español (España).
Escribe una mini reseña de 60–90 palabras con formato Markdown:
- Empieza con **Resumen**:
- Luego **Pros** en viñetas (3)
- Luego **Contras** en viñetas (2)
- Cierra con **Recomendación**: una frase breve y honesta (sin inventar especificaciones).`;

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    // Fallback breve y correcto en ES
    return `**Resumen:** Tendencia del día.

**Pros**
- Buena relación calidad/precio
- Fácil de usar
- Útil para el uso diario

**Contras**
- Puede no encajar en todos los casos
- Stock variable

**Recomendación:** compara precios y opiniones antes de comprar.`;
  }
  try{
    const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Producto: ${titulo}` }
      ]
    });
    return out?.result?.response?.trim() || out?.result?.message?.trim() || out?.result?.trim() || '';
  }catch(e){
    log('IA resumen fallback:', e.message);
    return `**Resumen:** Tendencia del día.

**Pros**
- Buena relación calidad/precio
- Fácil de usar
- Útil para el uso diario

**Contras**
- Puede no encajar en todos los casos
- Stock variable

**Recomendación:** compara precios y opiniones antes de comprar.`;
  }
}

// Descarga una imagen “segura” a /public/trends/<slug>.jpg usando Unsplash Source
async function descargarImagenDeProducto(titulo, slug){
  try{
    // Pedimos imagen 1024x576 con temática de producto, estudio, fondo blanco
    const seed = `${titulo}, producto, estudio, fondo blanco`;
    const entry = `https://source.unsplash.com/1024x576/?${encodeURIComponent(seed)}`;

    // Source redirige — seguimos la redirección y descargamos el binario
    const r1 = await fetch(entry, { redirect: 'manual' });
    const finalURL = r1.headers.get('location') || entry;

    const r2 = await fetch(finalURL);
    if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
    const buf = Buffer.from(await r2.arrayBuffer());

    const file = path.join(publicDir, `${slug}.jpg`);
    fs.writeFileSync(file, buf);
    return `/trends/${slug}.jpg`;
  }catch(e){
    log('Imagen fallback:', e.message);
    return '/placeholder.jpg';
  }
}

// RRS Reddit (títulos)
async function fetchRedditTitles(sub){
  const parser = new Parser({ headers: { 'User-Agent': 'TeknovashopTrendsBot/1.0 (contact: trends@teknovashop.com)' } });
  const url = `https://www.reddit.com/r/${sub}/top/.rss?t=day`;
  try{
    const feed = await parser.parseURL(url);
    return (feed.items || []).map(it => it.title).slice(0, 30);
  }catch(e){
    log('Reddit error', sub, e.message);
    return [];
  }
}

// Filtro rápido de “parece producto”
function pareceProducto(q){
  const kw = ['mejor','review','oferta','rebaja','comprar','precio',
    'auriculares','teclado','raton','ratón','robot','aspirador','airfryer','silla',
    'monitor','ssd','iphone','samsung','xiaomi','zapatillas','chaqueta',
    'lampara','lámpara','cafetera','tablet','portatil','portátil','router','camara','cámara',
    'barbacoa','mancuernas','bicicleta','colchon','colchón','tv','televisor','disco'];
  const s = q.toLowerCase();
  return kw.some(k => s.includes(k)) || /\b\d{2,}(\.\d+)?\s?(hz|w|mah|gb|tb|cm|mm)\b/i.test(q);
}

// Fallback con Google Trends (EN->filtrado)
async function fetchGoogleTrendsFallback(){
  try{
    const res = await trends.realTimeTrends({ geo: 'ES', category: 'all', hl: 'es' });
    const payload = JSON.parse(res);
    const titles = [];
    for (const st of (payload?.storySummaries?.trendingStories || [])) {
      for (const art of (st.articles || [])) {
        if (art?.title) titles.push(art.title);
      }
    }
    const uniq = [...new Set(titles)].filter(pareceProducto).slice(0, 20);
    return uniq;
  }catch(e){
    log('GoogleTrends error', e.message);
    return [];
  }
}

async function recolectarCandidatos(){
  const out = {};
  for (const [niche, cfg] of Object.entries(NICHES)) {
    const titles = [];
    for (const sub of (cfg?.subreddits || [])) {
      const t = await fetchRedditTitles(sub);
      titles.push(...t);
    }
    const cleaned = titles.map(t =>
      t.replace(/\[.*?\]|\(.*?\)|\b\d{2,}%\b|\b[\d,.]+\s?(%|eur|€|usd|\$)/gi, '').trim()
    );
    const freq = {};
    cleaned.forEach(t => { if (t.length >= 8) freq[t.toLowerCase()] = (freq[t.toLowerCase()] || 0) + 1; });
    let sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([title,count]) => ({ title, count }));

    if (sorted.length === 0) {
      const gt = await fetchGoogleTrendsFallback();
      sorted = gt.map(t => ({ title: t, count: 1 }));
    }
    out[niche] = sorted.slice(0, 8); // cap por nicho
  }
  return out;
}

function construirLinks(q){
  return [
    { label:'Amazon (ES)', url: affAmazonSearch(q, AMAZON_TAG_ES) },
    { label:'AliExpress',  url: affAliExpressSearch(q) },
    { label:'SHEIN',       url: affSheinSearch(q) },
  ];
}

async function main(){
  log('Inicio', `${yyyy}-${mm}-${dd}`);

  const candidatos = await recolectarCandidatos();

  const items = [];
  for (const [niche, arr] of Object.entries(candidatos)) {
    for (const { title, count } of (arr || []).slice(0,6)) {
      const tituloES = traducirRapidoAEs(title);
      const slug = slugify(tituloES) || `item-${Math.random().toString(36).slice(2,8)}`;

      // Imagen a /public/trends
      const hero = await descargarImagenDeProducto(tituloES, slug);

      // Texto ES (IA o fallback)
      const resumen = await genResumenES(tituloES);

      const fm = [
        '---',
        `title: "${tituloES.replace(/"/g,'\\"')}"`,
        `slug: "${slug}"`,
        `date: "${new Date().toISOString()}"`,
        `niche: "${niche}"`,
        `score: ${count}`,
        `hero: "${hero}"`,
        '---',
      ].join('\n');

      const links = construirLinks(tituloES)
        .map(l => `- [${l.label}](${l.url})`)
        .join('\n');

      const body = `${fm}

${resumen}

**Dónde comparar precios**

${links}
`;

      fs.writeFileSync(path.join(outDirContent, `${slug}.md`), body, 'utf-8');
      items.push({ slug, title: tituloES, niche, score: count, hero });
      log('OK', niche, slug);
    }
  }

  // Índice JSON para las páginas
  const indexPayload = { date: `${yyyy}-${mm}-${dd}`, items };
  fs.writeFileSync(
    path.join(outDirData, 'index.json'),
    JSON.stringify(indexPayload, null, 2),
    'utf-8'
  );

  log('Generados', items.length, 'items');
  if (items.length === 0){
    log('ATENCIÓN: 0 items (revisa conectividad del runner y los subreddits)');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
