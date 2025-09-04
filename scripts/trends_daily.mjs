// scripts/trends_daily.mjs
import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import trends from 'google-trends-api';
import { slugify, affAmazonSearch, affAliExpressSearch, affSheinSearch } from './utils.mjs';

const ROOT = process.cwd();
const niches = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'niches.json'), 'utf-8'));

// === Afiliados (solo enlaces informativos/comparativos) ===
const AMAZON_TAG_ES = process.env.AMAZON_TAG_ES || 'teknovashop25-21';

// === Pexels (imágenes) ===
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

// === IA: Cloudflare y OpenAI (fallback) ===
const cfAccount = process.env.CF_ACCOUNT_ID;
const cfToken   = process.env.CF_API_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function log(...a){ console.log('[trends]', ...a); }

// === Fecha y rutas ===
const today = new Date();
const yyyy = today.getFullYear();
const mm   = String(today.getMonth()+1).padStart(2,'0');
const dd   = String(today.getDate()).padStart(2,'0');

// carpetas productos
const outDirContentProd = path.join(ROOT, 'src', 'content', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirContentProd, { recursive: true });
const outDirDataProd = path.join(ROOT, 'src', 'data', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirDataProd, { recursive: true });

// carpetas noticias
const outDirContentNews = path.join(ROOT, 'src', 'content', 'news', String(yyyy), mm, dd);
fs.mkdirSync(outDirContentNews, { recursive: true });
const outDirDataNews = path.join(ROOT, 'src', 'data', 'news', String(yyyy), mm, dd);
fs.mkdirSync(outDirDataNews, { recursive: true });

// === Cloudflare Workers AI ===
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

// === OpenAI fallback (si CF falla o no hay claves) ===
async function openaiChatJSON(messages) {
  if (!OPENAI_API_KEY) throw new Error('No OPENAI_API_KEY');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type':'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages
    })
  });
  if (!res.ok) throw new Error('OpenAI error '+res.status);
  const data = await res.json();
  const txt = data?.choices?.[0]?.message?.content || '{}';
  return JSON.parse(txt);
}

// === Traducción fiable a español (CF → fallback OpenAI → original) ===
async function toSpanish(text){
  if (!text) return text;

  // 1) Cloudflare
  if (cfAccount && cfToken) {
    try {
      const prompt = `Traduce al español de España, en una sola frase natural y sin comillas. Conserva marcas y nombres propios. Solo la traducción:\n"${text}"`;
      const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role:'user', content: prompt }]
      });
      const msg = out?.result?.response || out?.result?.message || '';
      const res = (msg || '').trim();
      if (res) return res;
    } catch(e){ log('CF translate fail →', e.message); }
  }

  // 2) OpenAI
  if (OPENAI_API_KEY) {
    try {
      const obj = await openaiChatJSON([
        { role:'system', content:'Eres un traductor profesional (es-ES). Responde JSON {"es": "..."}' },
        { role:'user', content:`Traduce al español de España (una frase, sin comillas) este texto: ${text}` }
      ]);
      if (obj?.es) return String(obj.es).trim();
    } catch(e){ log('OpenAI translate fail →', e.message); }
  }

  // 3) Original si todo falla
  return text;
}

// === Mini review en español ===
async function genReview(titleEs){
  // Cloudflare primero
  if (cfAccount && cfToken){
    try {
      const sys = `Eres redactor e-commerce (es-ES). 70–100 palabras, tono profesional y útil.
- 1 frase resumen sin hype
- Pros: 3 bullets
- Contras: 2 bullets
- Recomendación final corta y neutra.`;
      const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role:'user', content:`${sys}\nProducto: ${titleEs}` }]
      });
      const txt = out?.result?.response || out?.result?.message || '';
      if (txt) return txt.trim();
    } catch(e){ log('CF review fail →', e.message); }
  }

  // OpenAI fallback
  if (OPENAI_API_KEY){
    try {
      const obj = await openaiChatJSON([
        { role:'system', content:'Devuelve JSON {"md": "..."} con el markdown pedido.' },
        { role:'user', content:`Escribe una mini-review (es-ES) de 70–100 palabras para "${titleEs}" con:
- **Resumen** (1 frase)
- **Pros** (3 bullets)
- **Contras** (2 bullets)
- **Recomendación** (1 frase)` }
      ]);
      if (obj?.md) return String(obj.md);
    } catch(e){ log('OpenAI review fail →', e.message); }
  }

  // Plantilla si todo falla
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

// === Imagen Pexels 1024x576 ===
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

// === RSS helper (Reddit) ===
async function fetchRedditTitles(sub){
  const parser = new Parser({
    headers: { 'User-Agent': 'TeknovashopTrendsBot/1.0 (contact: trends@teknovashop.com)' }
  });
  const url = `https://www.reddit.com/r/${sub}/top/.rss?t=day`;
  try{
    const feed = await parser.parseURL(url);
    return (feed.items || []).map(it => it.title).slice(0, 40);
  }catch(e){
    log('Reddit error', sub, e.message);
    return [];
  }
}

// === Clasificador robusto: PRODUCTO vs NOTICIA ===
function isProduct(title) {
  const s = (title || '').toLowerCase();

  // Señales fuertes de producto (marca/modelo/unidades)
  const pos = [
    'review', 'reseña', 'mejor', 'oferta', 'comprar', 'precio', 'deal',
    'headphones', 'earbuds', 'auriculares', 'teclado', 'ratón', 'mouse',
    'monitor', 'televisor', 'tv', 'tablet', 'portátil', 'laptop', 'router',
    'ssd', 'nvme', 'micro sd', 'memoria', 'smartwatch', 'reloj', 'cámara',
    'aspirador', 'robot', 'air fryer', 'freidora', 'chaqueta', 'zapatillas',
    'lámpara', 'barbacoa', 'bicicleta', 'colchón', 'cable', 'hub', 'dock',
    'iphone', 'samsung', 'xiaomi', 'jbl', 'anker', 'sony', 'philips', 'lg', 'huawei',
    'lenovo', 'dell', 'msi', 'asus', 'gigabyte', 'kingston', 'seagate', 'sandisk'
  ];
  const hasPos = pos.some(k => s.includes(k));

  // Unidades/atributos típicos de ficha
  const unitRe = /\b(\d{2,4}\s?(hz|w|mah|gb|tb|cm|mm|")|\d{1,2}\s?(ah|db)|bluetooth|wifi|usb|usb-c|hdr|ips|amoled|oled|va)\b/i;
  const looksTechSpec = unitRe.test(s);

  // Señales de noticia/empresa/opinión
  const neg = [
    'announc', 'coming to', 'lawsuit', 'trial', 'judge', 'laws', 'policy',
    'coming soon', 'rumor', 'filtración afirma', 'says', 'claims', 'leak says',
    'shares plunge', 'earnings', 'analyst', 'reviewers say', 'veto', 'ban',
    'instagram', 'tiktok', 'facebook', 'youtube', 'spotify', 'netflix', 'twitter',
    'naysayers', 'court', 'veredicto', 'demanda', 'gobierno', 'política', 'política de'
  ];
  const hasNeg = neg.some(k => s.includes(k));

  // Decisión estricta:
  if (hasNeg && !looksTechSpec) return false;       // Noticia
  if (hasPos || looksTechSpec) return true;         // Producto
  return false;                                     // Por defecto, descarta de productos
}

// === Google Trends fallback (por si Reddit flojo) ===
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
    // No clasificamos aquí; devolvemos materia prima
    return [...new Set(titles)].slice(0, 40);
  }catch(e){
    log('GoogleTrends error', e.message);
    return [];
  }
}

// === Recoger candidatos por nicho ===
async function collectRawTitles(){
  const out = {};
  for (const [niche, cfg] of Object.entries(niches)) {
    const titles = [];
    for (const sub of (cfg.subreddits || [])) {
      const t = await fetchRedditTitles(sub);
      titles.push(...t);
    }
    if (titles.length < 8) {
      const gt = await fetchGoogleTrendsFallback();
      titles.push(...gt);
    }
    out[niche] = [...new Set(titles)].slice(0, 80);
    log('Niche', niche, 'candidatos crudos', out[niche].length);
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

  const raw = await collectRawTitles();
  const itemsProducts = [];
  const itemsNews = [];

  for (const [niche, arr] of Object.entries(raw)) {
    // Clasificar
    const prods = [];
    const news  = [];
    for (const t of (arr || [])) {
      if (isProduct(t)) prods.push(t);
      else news.push(t);
    }

    // === Productos (máx 10 por nicho)
    for (const t of prods.slice(0, 10)) {
      const titleEs = await toSpanish(t);
      const slug = slugify(titleEs).slice(0,80) || `item-${Math.random().toString(36).slice(2,8)}`;
      const hero = await pexelsImage(titleEs);
      const review = await genReview(titleEs);

      const fm = [
        '---',
        `title: "${titleEs.replace(/"/g, '\\"')}"`,
        `slug: "${slug}"`,
        `date: "${new Date().toISOString()}"`,
        `niche: "${niche}"`,
        `score: 1`,
        `hero: "${hero}"`,
        '---',
      ].join('\n');

      const linksMd = buildLinks(titleEs).map(l => `- [${l.label}](${l.url})`).join('\n');
      const body = `${fm}

${review}

**Dónde comparar precios**
${linksMd}
`;
      fs.writeFileSync(path.join(outDirContentProd, `${slug}.md`), body, 'utf-8');

      itemsProducts.push({ type:'product', slug, title: titleEs, niche, score: 1, hero });
      log('Producto', niche, slug);
    }

    // === Noticias (máx 10 por nicho)
    for (const t of news.slice(0, 10)) {
      const titleEs = await toSpanish(t);
      const slug = slugify(titleEs).slice(0,80) || `news-${Math.random().toString(36).slice(2,8)}`;
      const hero = await pexelsImage(titleEs);

      const fm = [
        '---',
        `title: "${titleEs.replace(/"/g, '\\"')}"`,
        `slug: "${slug}"`,
        `date: "${new Date().toISOString()}"`,
        `niche: "${niche}"`,
        `score: 1`,
        `hero: "${hero}"`,
        '---',
      ].join('\n');

      const body = `${fm}

**Resumen**: ${titleEs}.
`;
      fs.writeFileSync(path.join(outDirContentNews, `${slug}.md`), body, 'utf-8');

      itemsNews.push({ type:'news', slug, title: titleEs, niche, score: 1, hero });
      log('Noticia', niche, slug);
    }
  }

  // Índices JSON
  const prodIndex = { date: `${yyyy}-${mm}-${dd}`, items: itemsProducts };
  fs.writeFileSync(path.join(outDirDataProd, 'index.json'), JSON.stringify(prodIndex, null, 2), 'utf-8');

  const newsIndex = { date: `${yyyy}-${mm}-${dd}`, items: itemsNews };
  fs.writeFileSync(path.join(outDirDataNews, 'index.json'), JSON.stringify(newsIndex, null, 2), 'utf-8');

  log('Total productos', itemsProducts.length, '→', path.join('src/data/trends', `${yyyy}/${mm}/${dd}`));
  log('Total noticias', itemsNews.length, '→', path.join('src/data/news', `${yyyy}/${mm}/${dd}`));

  if (itemsProducts.length === 0) log('ATENCIÓN: 0 productos. Revisa claves (PEXELS/CF/OPENAI) o nichos.');
}

main().catch(e => { console.error('Fallo crítico:', e); process.exit(1); });
