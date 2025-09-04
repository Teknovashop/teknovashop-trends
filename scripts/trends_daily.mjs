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

// === Opcional IA (Cloudflare Workers AI) ===
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

    const best = photo.src?.landscape || photo.src?.medium || photo.src?.large || photo.src?.original;
    if (!best) return '/placeholder.jpg';
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

// ============ NUEVO: generación automática de rating y reseñas ============

// Escapa comillas dobles para YAML inline
function esc(s=''){ return String(s).replace(/"/g, '\\"'); }

// Convierte array de reseñas a YAML (indentado 2 espacios)
function reviewsToYAML(revs = []){
  if (!Array.isArray(revs) || revs.length === 0) return '[]';
  const lines = [];
  for (const r of revs) {
    lines.push('  - author: "' + esc(r.author || 'Usuario') + '"');
    lines.push('    rating: ' + (Number(r.rating || 0).toFixed(1)));
    if (r.title) lines.push('    title: "' + esc(r.title) + '"');
    if (r.text)  lines.push('    text: "'  + esc(r.text)  + '"');
    if (r.date)  lines.push('    date: "'  + esc(r.date)  + '"');
    if (typeof r.verified === 'boolean') lines.push('    verified: ' + (r.verified ? 'true' : 'false'));
  }
  return '\n' + lines.join('\n');
}

// IA (si hay CF) para crear social proof breve y seguro
async function aiSocialProof(titleEs){
  const sys = `Eres un generador de resumen de reseñas. Devuelve JSON estricto con:
{
  "rating": number (entre 3.8 y 4.9),
  "ratingCount": integer (entre 25 y 400),
  "reviews": [
    {"author": string, "rating": number 1..5, "title": string, "text": string 12..35 palabras, "date": "YYYY-MM-DD", "verified": boolean},
    ... (3 reseñas)
  ]
}
Todo en español de España. No menciones marcas no presentes. No inventes especificaciones técnicas.`;
  const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `Producto: ${titleEs}` }
    ],
    // Forzamos JSON
    max_tokens: 600,
  });
  // Algunos modelos devuelven en .result.response; otros en .result.message
  const raw = out?.result?.response || out?.result?.message || '';
  // Intenta extraer JSON
  const match = raw.match(/\{[\s\S]*\}/);
  const jsonStr = match ? match[0] : raw;
  try {
    const parsed = JSON.parse(jsonStr);
    // sanea valores
    const rating = Math.min(4.9, Math.max(3.8, Number(parsed.rating || 4.4)));
    const ratingCount = Math.max(25, Math.min(400, Math.floor(Number(parsed.ratingCount || 120))));
    let reviews = Array.isArray(parsed.reviews) ? parsed.reviews.slice(0,3) : [];
    reviews = reviews.map((r)=>({
      author: r.author || 'Usuario',
      rating: Math.min(5, Math.max(1, Number(r.rating || 5))),
      title: r.title || '',
      text: r.text || '',
      date: r.date || new Date().toISOString().slice(0,10),
      verified: !!r.verified
    }));
    return { rating, ratingCount, reviews };
  } catch {
    // fallback mínimo si JSON no parsea
    return null;
  }
}

// Generador determinista (sin IA) para rating/reseñas verosímiles
function fallbackSocialProof(titleEs, score=1){
  // rating base por score
  const base = 4.1 + Math.min(0.6, (Number(score)||1) * 0.08);
  const rating = Math.round((base + (Math.random()*0.2 - 0.1)) * 10)/10; // +-0.1
  const ratingCount = Math.max(28, Math.min(380, 30 + (Number(score)||1) * 10 + Math.floor(Math.random()*80)));

  const templates = [
    {
      author: 'María',
      title: 'Buen equilibrio calidad/precio',
      text: 'Cumple lo prometido y la experiencia es sólida. Fácil de usar y con detalles bien resueltos.',
    },
    {
      author: 'Javier',
      title: 'Satisfecho con la compra',
      text: 'Tras varios días de uso el rendimiento es estable. El envío llegó en buen estado.',
    },
    {
      author: 'Lucía',
      title: 'Me ha sorprendido',
      text: 'Instalación sencilla y resultado por encima de lo esperado para el rango de precio.',
    },
  ];

  const reviews = templates.map((t, i)=>({
    author: t.author,
    rating: Math.min(5, Math.max(4, Math.round((rating + (i===1?-0.3:0.2))*2)/2)),
    title: t.title,
    text: t.text,
    date: new Date(Date.now() - (i+1)*86400000).toISOString().slice(0,10),
    verified: i !== 1 // una sin verificar para naturalidad
  }));

  return { rating, ratingCount, reviews };
}

// Empaqueta social proof, usando IA si disponible
async function genSocialProof(titleEs, score){
  if (cfAccount && cfToken) {
    try {
      const ai = await aiSocialProof(titleEs);
      if (ai) return ai;
    } catch (e) {
      log('IA social proof fallback:', e.message);
    }
  }
  return fallbackSocialProof(titleEs, score);
}

// ========================================================================

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

      // 4) Mini-review (markdown)
      const review = await genReview(titleEs);

      // 5) Social proof (rating + reviews)
      const social = await genSocialProof(titleEs, count);
      const rating = Number(social.rating.toFixed(1));
      const ratingCount = Math.floor(social.ratingCount);
      const reviewsYAML = reviewsToYAML(social.reviews);

      // 6) Front-matter + cuerpo
      const fm = [
        '---',
        `title: "${esc(titleEs)}"`,
        `slug: "${slug}"`,
        `date: "${new Date().toISOString()}"`,
        `niche: "${niche}"`,
        `score: ${count}`,
        `hero: "${esc(hero)}"`,
        `rating: ${rating}`,
        `ratingCount: ${ratingCount}`,
        'reviews:' + reviewsYAML,
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
