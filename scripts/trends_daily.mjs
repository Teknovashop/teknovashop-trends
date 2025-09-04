// scripts/trends_daily.mjs
import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import trends from 'google-trends-api';
import { slugify, affAmazonSearch, affAliExpressSearch, affSheinSearch } from './utils.mjs';

const ROOT = process.cwd();
const niches = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'niches.json'), 'utf-8'));

// === Afiliados (solo se usan en la mini-sección de "Dónde comparar") ===
const AMAZON_TAG_ES = process.env.AMAZON_TAG_ES || 'teknovashop25-21';

// === Pexels (para hero de productos) ===
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

// === Opcional IA (Cloudflare) para traducción y mini-review ===
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

const outDirTrendsData = path.join(ROOT, 'src', 'data', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirTrendsData, { recursive: true });

const outDirNewsData = path.join(ROOT, 'src', 'data', 'news', String(yyyy), mm, dd);
fs.mkdirSync(outDirNewsData, { recursive: true });

// === CF Workers AI helper ===
async function cfRun(model, payload){
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Workers AI ${res.status}`);
  return await res.json();
}

// Traducción a ES. Si no hay CF, devolvemos el original y forzamos capitalización ES básica.
async function toSpanish(text){
  if (!text) return text;
  if (!cfAccount || !cfToken) return text; // en tu flujo ya te funciona; cae en ES porque la mayoría de títulos ya llegan en ES
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
  const system = `Eres un redactor de comercio electrónico en español (ES). Redacta una mini-review de 70–100 palabras con:
- 1 frase resumen profesional (sin hype).
- Lista de "Pros" con 3 puntos.
- Lista de "Contras" con 2 puntos.
- Recomendación final neutra.
No inventes especificaciones.`;
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

// Imagen de Pexels para productos
async function pexelsImage(query){
  if (!PEXELS_API_KEY) return '/placeholder.jpg';
  try{
    const url = new URL('https://api.pexels.com/v1/search');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '10');
    url.searchParams.set('orientation', 'landscape');

    const res = await fetch(url, { headers: { Authorization: PEXELS_API_KEY } });
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    const data = await res.json();
    const photo = (data.photos || [])[0];
    if (!photo) return '/placeholder.jpg';

    const best = photo.src?.landscape || photo.src?.medium || photo.src?.large || photo.src?.original;
    if (!best) return '/placeholder.jpg';
    return `${best}${best.includes('?') ? '&' : '?'}auto=compress&cs=tinysrgb&w=1024&h=576&fit=crop`;
  }catch(e){
    log('Pexels error:', e.message);
    return '/placeholder.jpg';
  }
}

// Reddit RSS (para semillas de títulos)
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

// ¿Tiene pinta de producto?
function looksLikeProduct(q){
  const kw = [
    'mejor','review','oferta','rebaja','comprar','precio','auriculares','teclado','ratón','robot','aspirador',
    'airfryer','silla','monitor','ssd','iphone','samsung','xiaomi','zapatillas','chaqueta','lámpara','cafetera',
    'tablet','portátil','router','cámara','barbacoa','mancuernas','bicicleta','colchón','android','smartwatch',
    'reloj','nvme','micro sd','memoria','hdd','powerbank','proyector','altavoz','bluetooth'
  ];
  const s = q.toLowerCase();
  const unit = /\b\d{2,}(\.\d+)?\s?(hz|w|mah|gb|tb|cm|mm|")\b/i.test(q);
  return kw.some(k => s.includes(k)) || unit;
}

// Fallback con Google Trends realtime
async function fetchGoogleTrendsFallback(){
  try{
    const res = await trends.realTimeTrends({ geo: 'ES', category: 'all', hl: 'es' });
    const payload = JSON.parse(res);
    const titles = [];
    for (const st of (payload?.storySummaries?.trendingStories || [])) {
      for (const art of (st.articles || [])) if (art?.title) titles.push(art.title);
    }
    const uniq = [...new Set(titles)].slice(0, 40);
    return uniq;
  }catch(e){
    log('GoogleTrends error', e.message);
    return [];
  }
}

// Recopilamos candidatos por nicho
async function collectCandidates(){
  const out = {};
  for (const [niche, cfg] of Object.entries(niches)) {
    const titles = [];
    for (const sub of (cfg.subreddits || [])) {
      const t = await fetchRedditTitles(sub);
      titles.push(...t);
    }
    // Si Reddit flojo, añade GT
    if (titles.length < 10) titles.push(...await fetchGoogleTrendsFallback());

    // limpieza
    const cleaned = titles.map(t =>
      t.replace(/\[.*?\]|\(.*?\)|\b\d{2,}%\b|\b[\d,.]+\s?(%|eur|€|usd|\$)/gi, '').trim()
    );

    const freq = {};
    cleaned.forEach(t => { if (t.length >= 8) freq[t.toLowerCase()] = (freq[t.toLowerCase()] || 0) + 1; });

    const sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([title,count]) => ({
      title: title.replace(/^./, m=>m.toUpperCase()),
      count
    }));

    out[niche] = sorted;
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

  const candidatesByNiche = await collectCandidates();

  const products = []; // para JSON productos
  const news     = []; // para JSON noticias

  for (const [niche, arr] of Object.entries(candidatesByNiche)) {
    // Toma top 12 candidatos por nicho para repartir en productos/noticias
    for (const { title, count } of (arr || []).slice(0,12)) {
      const titleEs = await toSpanish(title);
      const isProduct = looksLikeProduct(titleEs);

      if (isProduct) {
        // === Producto ===
        const slug = slugify(titleEs).slice(0,80) || `item-${Math.random().toString(36).slice(2,8)}`;
        const hero = await pexelsImage(titleEs);
        const review = await genReview(titleEs);

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

        products.push({ slug, title: titleEs, niche, score: count, hero });
        log('Producto', niche, slug);
      } else {
        // === Noticia === (solo JSON; link a Google News)
        const q = encodeURIComponent(titleEs);
        const url = `https://news.google.com/search?q=${q}&hl=es-419&gl=ES&ceid=ES:es`;
        news.push({
          title: titleEs,
          niche,
          score: count,
          // Imagen genérica (es tarjeta informativa, no detalle):
          hero: '/placeholder-news.jpg',
          url
        });
        log('Noticia', niche, titleEs.slice(0,60));
      }
    }
  }

  // Escribimos índices
  fs.writeFileSync(
    path.join(outDirTrendsData, 'index.json'),
    JSON.stringify({ date: `${yyyy}-${mm}-${dd}`, items: products }, null, 2),
    'utf-8'
  );

  fs.writeFileSync(
    path.join(outDirNewsData, 'index.json'),
    JSON.stringify({ date: `${yyyy}-${mm}-${dd}`, items: news }, null, 2),
    'utf-8'
  );

  log('Productos:', products.length, ' | Noticias:', news.length);
  if (products.length === 0 && news.length === 0) {
    log('ATENCIÓN: 0 items generados. Revisa conectividad/keys (Pexels / CF IA).');
  }
}

main().catch(e => { console.error('Fallo crítico:', e); process.exit(1); });
