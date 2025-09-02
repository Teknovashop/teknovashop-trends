// scripts/trends_daily.mjs
import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import trends from 'google-trends-api';
import { slugify, affAmazonSearch, affAliExpressSearch, affSheinSearch } from './utils.mjs';

const ROOT = process.cwd();
const niches = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'niches.json'), 'utf-8'));

// === Afiliados ===
const AMAZON_TAG_ES = process.env.AMAZON_TAG_ES || 'teknovashop25-21';

// === Pexels ===
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

// === Opcional IA (Cloudflare) ===
const cfAccount = process.env.CF_ACCOUNT_ID;
const cfToken   = process.env.CF_API_TOKEN;

function log(...a){ console.log('[trends]', ...a); }

// === Fechas, rutas de salida ===
const today = new Date();
const yyyy = today.getFullYear();
const mm   = String(today.getMonth()+1).padStart(2,'0');
const dd   = String(today.getDate()).padStart(2,'0');

const outDirContent = path.join(ROOT, 'src', 'content', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirContent, { recursive: true });

const outDirData = path.join(ROOT, 'src', 'data', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirData, { recursive: true });

// === CF Workers AI helper ===
async function cfRun(model, payload){
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Workers AI ${res.status}`);
  return await res.json();
}

// Traducción a español (ES). Si no hay CF, devuelvo el original.
async function toSpanish(text){
  if (!text) return text;
  if (!cfAccount || !cfToken) return text;
  try{
    const prompt = `Traduce al español de España, en una sola frase y sin comillas, conservando marcas y nombres propios. Solo la traducción:\n"${text}"`;
    const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }]
    });
    const msg = out?.result?.response || out?.result?.message || '';
    return (msg || '').trim() || text;
  }catch(e){
    log('toSpanish fallback:', e.message);
    return text;
  }
}

// Mini review (ES). Si no hay CF, plantilla simple.
async function genReview(titleEs){
  const system = `Eres un redactor de comercio electrónico en español (ES). Escribe una mini-review de 70–100 palabras con:
- 1 frase resumen profesional (sin hype).
- Lista de "Pros" con 3 puntos.
- Lista de "Contras" con 2 puntos.
- Una recomendación final corta y neutra.
No inventes especificaciones técnicas.`;
  if (!cfAccount || !cfToken){
    return `**Resumen**: Tendencia destacada del día.

**Pros**
- Buena relación calidad/precio
- Útil en el día a día
- Sencillo de usar

**Contras**
- Puede no encajar en todos los casos
- Stock variable

**Recomendación**: compara precios y opiniones antes de comprar.`;
  }
  try{
    const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role:'user', content: `${system}\nProducto: ${titleEs}` }]
    });
    return out?.result?.response || out?.result?.message || '';
  }catch(e){
    log('IA review fallback:', e.message);
    return `**Resumen**: Tendencia destacada del día.

**Pros**
- Buena relación calidad/precio
- Útil en el día a día
- Sencillo de usar

**Contras**
- Puede no encajar en todos los casos
- Stock variable

**Recomendación**: compara precios y opiniones antes de comprar.`;
  }
}

// Imagen de Pexels en 1024×576 recortada
async function pexelsImage(query){
  if (!PEXELS_API_KEY) return '/placeholder.jpg';
  try{
    const url = new URL('https://api.pexels.com/v1/search');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '10');
    url.searchParams.set('orientation', 'landscape');

    const res = await fetch(url, {
      headers: { Authorization: PEXELS_API_KEY }
    });
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    const data = await res.json();
    const photo = (data.photos || [])[0];
    if (!photo) return '/placeholder.jpg';

    // src.landscape suele ser 1200–1280 de ancho. Añadimos parámetros de compresión.
    const best = photo.src?.landscape || photo.src?.medium || photo.src?.large || photo.src?.original;
    if (!best) return '/placeholder.jpg';
    // Forzamos crop aproximado 1024x576
    const withParams = `${best}${best.includes('?') ? '&' : '?'}auto=compress&cs=tinysrgb&w=1024&h=576&fit=crop`;
    return withParams;
  }catch(e){
    log('Pexels error:', e.message);
    return '/placeholder.jpg';
  }
}

// Lectura rápida de títulos en Reddit (ES o EN)
async function fetchRedditTitles(sub){
  const parser = new Parser({
    headers: { 'User-Agent': 'TeknovashopTrendsBot/1.0 (contact: trends@teknovashop.com)' }
  });
  const url = `https://www.reddit.com/r/${sub}/top/.rss?t=day`;
  try{
    const feed = await parser.parseURL(url);
    return (feed.items || []).map(it => it.title).slice(0, 30);
  }catch(e){
    log('Reddit error', sub, e.message);
    return [];
  }
}

// Heurística simple para detectar productos
function looksLikeProduct(q){
  const kw = [
    // ES
    'mejor','review','oferta','rebaja','comprar','precio','auriculares','teclado','ratón','robot','aspirador',
    'airfryer','silla','monitor','ssd','iphone','samsung','xiaomi','zapatillas','chaqueta','lámpara','cafetera',
    'tablet','portátil','router','cámara','barbacoa','mancuernas','bicicleta','colchón','android','smartwatch',
    'reloj','barato','gama media','calidad precio','con cancelación de ruido','nvme','micro sd','memoria',

    // EN frecuentes
    'best','deal','discount','buy','price','headphones','keyboard','mouse','vacuum','air fryer','chair','monitor',
    'ssd','iphone','samsung','xiaomi','sneakers','jacket','lamp','coffee','tablet','laptop','router','camera',
    'grill','dumbbell','bike','mattress','smartwatch','noise cancelling'
  ];
  const s = q.toLowerCase();
  return kw.some(k => s.includes(k)) || /\b\d{2,}(\.\d+)?\s?(hz|w|mah|gb|tb|cm|mm)\b/i.test(q);
}

// Fallback con Google Trends realtime, filtrando a items con pinta de producto
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
    const uniq = [...new Set(titles)].filter(looksLikeProduct).slice(0, 20);
    log('GoogleTrends candidatos', uniq.length);
    return uniq;
  }catch(e){
    log('GoogleTrends error', e.message);
    return [];
  }
}

// Recopilamos candidatos por nicho y devolvemos un mapa { niche: [{title,count},...] }
async function collectCandidates(){
  const out = {};
  for (const [niche, cfg] of Object.entries(niches)) {
    const titles = [];
    for (const sub of (cfg.subreddits || [])) {
      const t = await fetchRedditTitles(sub);
      titles.push(...t);
    }
    // limpieza básica
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

    // Capitalizamos y guardamos
    out[niche] = sorted.map(({title,count}) => ({
      title: title.replace(/^./, m=>m.toUpperCase()),
      count
    }));
    log('Niche', niche, 'candidatos', out[niche].length);
  }
  return out;
}

function buildLinks(q){
  return [
    { label:'Amazon (ES)', url: affAmazonSearch(q, AMAZON_TAG_ES) },
    { label:'AliExpress',  url: affAliExpressSearch(q) },
    { label:'SHEIN',       url: affSheinSearch(q) }
  ];
}

async function main(){
  log('Inicio generación', `${yyyy}-${mm}-${dd}`);

  const candidates = await collectCandidates();
  const items = [];

  for (const [niche, arr] of Object.entries(candidates)) {
    for (const { title, count } of (arr || []).slice(0,5)) {
      // 1) Título en ES
      const titleEs = await toSpanish(title);

      // 2) Slug
      const slug = slugify(titleEs).slice(0,80) || `item-${Math.random().toString(36).slice(2,8)}`;

      // 3) Imagen desde Pexels
      const hero = await pexelsImage(titleEs);

      // 4) Mini-review
      const review = await genReview(titleEs);

      // 5) Front-matter + cuerpo
      const fm = [
        '---',
        `title: "${titleEs.replace(/"/g, '\\"')}"`,
        `slug: "${slug}"`,
        `date: "${new Date().toISOString()}"`,
        `niche: "${niche}"`,
        `score: ${count}`,
        `hero: "${hero}"`,
        '---',
      ].join('\n');

      const linksMd = buildLinks(titleEs).map(l => `- [${l.label}](${l.url})`).join('\n');

      const body = `${fm}

${review}

**Dónde comparar precios**
${linksMd}
`;

      fs.writeFileSync(path.join(outDirContent, `${slug}.md`), body, 'utf-8');

      items.push({ slug, title: titleEs, niche, score: count, hero });
      log('Escrito', niche, slug);
    }
  }

  const indexPayload = { date: `${yyyy}-${mm}-${dd}`, items };
  fs.writeFileSync(path.join(outDirData, 'index.json'), JSON.stringify(indexPayload, null, 2), 'utf-8');

  log('Total items', items.length, 'Salida', path.join('src/data/trends', `${yyyy}/${mm}/${dd}`));
  if (items.length === 0) {
    log('ATENCIÓN: 0 items generados. Revisa conectividad/keys (Pexels / CF IA).');
  }
}

main().catch(e => { console.error('Fallo crítico:', e); process.exit(1); });
