// scripts/trends_daily.mjs
import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import trends from 'google-trends-api';
import { slugify, affAmazonSearch, affAliExpressSearch, affSheinSearch } from './utils.mjs';

const ROOT = process.cwd();
const niches = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'niches.json'), 'utf-8'));

const AMAZON_TAG_ES = process.env.AMAZON_TAG_ES || 'teknovashop25-21';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const cfAccount = process.env.CF_ACCOUNT_ID;
const cfToken   = process.env.CF_API_TOKEN;

function log(...a){ console.log('[trends]', ...a); }

const today = new Date();
const yyyy = today.getFullYear();
const mm   = String(today.getMonth()+1).padStart(2,'0');
const dd   = String(today.getDate()).padStart(2,'0');

// Salidas (productos)
const outContentProd = path.join(ROOT, 'src', 'content', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outContentProd, { recursive: true });
const outDataProd = path.join(ROOT, 'src', 'data', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDataProd, { recursive: true });

// Salidas (noticias)
const outContentNews = path.join(ROOT, 'src', 'content', 'news', String(yyyy), mm, dd);
fs.mkdirSync(outContentNews, { recursive: true });
const outDataNews = path.join(ROOT, 'src', 'data', 'news', String(yyyy), mm, dd);
fs.mkdirSync(outDataNews, { recursive: true });

// ===== Helpers =====
async function cfRun(model, payload){
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    method:'POST',
    headers:{ Authorization:`Bearer ${cfToken}`,'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Workers AI ${res.status}`);
  return await res.json();
}

async function toSpanish(text){
  if (!text) return text;
  if (!cfAccount || !cfToken) return text; // sin CF, dejamos original
  try{
    const prompt = `Traduce al español de España en una sola frase y sin comillas:\n"${text}"`;
    const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', { messages:[{role:'user',content:prompt}] });
    const msg = out?.result?.response || out?.result?.message || '';
    return (msg || '').trim() || text;
  }catch{ return text; }
}

async function genReview(titleEs){
  if (!cfAccount || !cfToken) {
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
  const system = `Eres redactor ecommerce ES. Mini-review (70–100 palabras), Pros (3), Contras (2), Recomendación. Sin inventar specs.`;
  try{
    const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', { messages:[{role:'user',content:`${system}\nProducto: ${titleEs}`} ]});
    return out?.result?.response || out?.result?.message || '';
  }catch{ return `**Resumen**: Tendencia destacada del día.

**Pros**
- Buena relación calidad/precio
- Útil en el día a día
- Sencillo de usar

**Contras**
- Puede no encajar en todos los casos
- Stock variable

**Recomendación**: compara precios y opiniones antes de comprar.`; }
}

async function pexelsImage(query){
  if (!PEXELS_API_KEY) return '/placeholder.jpg';
  try{
    const url = new URL('https://api.pexels.com/v1/search');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page','10');
    url.searchParams.set('orientation','landscape');
    const res = await fetch(url, { headers:{ Authorization: PEXELS_API_KEY }});
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    const data = await res.json();
    const photo = (data.photos || [])[0];
    const best = photo?.src?.landscape || photo?.src?.medium || photo?.src?.large || photo?.src?.original;
    return best ? `${best}${best.includes('?')?'&':'?'}auto=compress&cs=tinysrgb&w=1024&h=576&fit=crop` : '/placeholder.jpg';
  }catch{ return '/placeholder.jpg'; }
}

async function fetchRedditTitles(sub){
  const parser = new Parser({ headers:{ 'User-Agent':'TeknovashopTrendsBot/1.0 (contact: trends@tekno)' }});
  try{
    const feed = await parser.parseURL(`https://www.reddit.com/r/${sub}/top/.rss?t=day`);
    return (feed.items || []).map(it => it.title).slice(0, 40);
  }catch{ return []; }
}

// ===== Clasificación =====
const BRAND_HINTS = [
  'samsung','xiaomi','apple','iphone','ipad','macbook','huawei','sony','ps5','nintendo','switch','lenovo','asus','msi','hp','dell','lg','philips','anker','jbl','bose','sennheiser','garmin','fitbit','roborock','dreame','dyson','oral-b','kindle','echo','fire tv','oneplus','realme','nothing','go pro','gopro'
];

const PRODUCT_HINTS = [
  'monitor','teclado','ratón','mouse','auriculares','headphones','ssd','nvme','tablet','portátil','laptop','smartphone','robot aspirador','airfryer','freidora','cámara','webcam','router','reloj','smartwatch','barra de sonido','soundbar','altavoz','speaker','tv','televisor','ram','memoria','micro sd','tarjeta','cargador','hub','dock','usb-c','power bank'
];

// descarta noticias/política/preguntas
const BANNED = [
  'trump','biden','president','election','guerra','war','ukraine','venezuela','suicide','attack','why','cómo','por qué','help','ayuda','respond','respondas','garden','ivy','poison','pregunta'
];

function looksLikeProduct(q){
  const s = q.toLowerCase();
  if (BANNED.some(w => s.includes(w))) return false;
  const hasBrand = BRAND_HINTS.some(w => s.includes(w));
  const hasProd  = PRODUCT_HINTS.some(w => s.includes(w));
  const hasMetric = /\b(\d{2,}\s?(hz|w|mah|gb|tb|cm|mm|")|usb-c|bluetooth|wifi|dolby|hdr|144hz|240hz)\b/i.test(s);
  return (hasBrand && hasProd) || (hasProd && hasMetric);
}

async function fetchGoogleTrendsFallback(){
  try{
    const res = await trends.realTimeTrends({ geo:'ES', category:'all', hl:'es' });
    const payload = JSON.parse(res);
    const titles = [];
    for (const st of (payload?.storySummaries?.trendingStories || [])) {
      for (const art of (st.articles || [])) if (art?.title) titles.push(art.title);
    }
    const uniq = [...new Set(titles)].slice(0, 40);
    return uniq;
  }catch{ return []; }
}

async function collect(){
  const products = [];  // {title,count,src:'reddit:sub'|'gt'}
  const news     = [];
  for (const [niche, cfg] of Object.entries(niches)) {
    const titles = [];
    for (const sub of (cfg.subreddits || [])) {
      const t = await fetchRedditTitles(sub);
      titles.push(...t.map(x => ({ title:x, src:`reddit:${sub}` })));
    }
    if (titles.length === 0) {
      const gt = await fetchGoogleTrendsFallback();
      titles.push(...gt.map(x => ({ title:x, src:'gt' })));
    }

    // Conteo
    const freq = new Map();
    for (const {title,src} of titles) {
      const key = title.trim().toLowerCase();
      if (key.length < 8) continue;
      const v = freq.get(key) || { count:0, src };
      v.count++;
      freq.set(key, v);
    }

    for (const [k, v] of freq.entries()) {
      if (looksLikeProduct(k)) products.push({ title:k, count:v.count, src:v.src, niche });
      else news.push({ title:k, count:v.count, src:v.src, niche });
    }
  }
  // Orden por score
  products.sort((a,b)=>b.count-a.count);
  news.sort((a,b)=>b.count-a.count);
  return { products, news };
}

function buildLinks(q){
  return [
    { label:'Amazon (ES)', url: affAmazonSearch(q, AMAZON_TAG_ES) },
    { label:'AliExpress',  url: affAliExpressSearch(q) },
    { label:'SHEIN',       url: affSheinSearch(q) }
  ];
}

async function main(){
  log('Generando', `${yyyy}-${mm}-${dd}`);
  const { products, news } = await collect();

  // === Productos ===
  const prodItems = [];
  for (const it of products.slice(0, 24)) {
    const titleEs = await toSpanish(it.title);
    const slug = (slugify(titleEs).slice(0,80) || `item-${Math.random().toString(36).slice(2,8)}`);
    const hero = await pexelsImage(titleEs);
    const review = await genReview(titleEs);

    const fm = [
      '---',
      `title: "${titleEs.replace(/"/g,'\\"')}"`,
      `slug: "${slug}"`,
      `date: "${new Date().toISOString()}"`,
      `niche: "${it.niche}"`,
      `score: ${it.count}`,
      `hero: "${hero}"`,
      '---'
    ].join('\n');

    const linksMd = buildLinks(titleEs).map(l => `- [${l.label}](${l.url})`).join('\n');
    const body = `${fm}

${review}

**Dónde comparar precios**
${linksMd}
`;
    fs.writeFileSync(path.join(outContentProd, `${slug}.md`), body, 'utf-8');
    prodItems.push({ slug, title: titleEs, niche: it.niche, score: it.count, hero });
  }
  fs.writeFileSync(path.join(outDataProd, 'index.json'), JSON.stringify({ date:`${yyyy}-${mm}-${dd}`, items: prodItems }, null, 2));

  // === Noticias (sólo título + hero) ===
  const newsItems = [];
  for (const it of news.slice(0, 24)) {
    const titleEs = await toSpanish(it.title);
    const slug = (slugify(titleEs).slice(0,80) || `news-${Math.random().toString(36).slice(2,8)}`);
    const hero = await pexelsImage(titleEs);

    const fm = [
      '---',
      `title: "${titleEs.replace(/"/g,'\\"')}"`,
      `slug: "${slug}"`,
      `date: "${new Date().toISOString()}"`,
      `niche: "${it.niche}"`,
      `score: ${it.count}`,
      `hero: "${hero}"`,
      '---'
    ].join('\n');

    const body = `${fm}

${titleEs}
`;
    fs.writeFileSync(path.join(outContentNews, `${slug}.md`), body, 'utf-8');
    newsItems.push({ slug, title: titleEs, niche: it.niche, score: it.count, hero });
  }
  fs.writeFileSync(path.join(outDataNews, 'index.json'), JSON.stringify({ date:`${yyyy}-${mm}-${dd}`, items: newsItems }, null, 2));

  log('Productos:', prodItems.length, 'Noticias:', newsItems.length);
}

main().catch(e => { console.error('Fallo crítico:', e); process.exit(1); });
