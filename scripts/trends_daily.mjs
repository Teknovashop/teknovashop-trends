// scripts/trends_daily.mjs
// Genera tendencias diarias en español SIEMPRE (con fallbacks de traducción)
// Salida:
//   - src/content/trends/YYYY/MM/DD/*.md
//   - src/data/trends/YYYY/MM/DD/index.json

import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import trends from 'google-trends-api';
import { slugify, affAmazonSearch, affAliExpressSearch, affSheinSearch } from './utils.mjs';

const ROOT = process.cwd();
const niches = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'niches.json'), 'utf-8'));

// === Afiliados (para enlaces de "Dónde comparar") ===
const AMAZON_TAG_ES = process.env.AMAZON_TAG_ES || 'teknovashop25-21';

// === Claves externas ===
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const CF_ACCOUNT_ID  = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN   = process.env.CF_API_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// === Fechas / directorios de salida ===
const today = new Date();
const yyyy = today.getFullYear();
const mm   = String(today.getMonth()+1).padStart(2,'0');
const dd   = String(today.getDate()).padStart(2,'0');

const outDirContent = path.join(ROOT, 'src', 'content', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirContent, { recursive: true });

const outDirData = path.join(ROOT, 'src', 'data', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirData, { recursive: true });

function log(...a){ console.log('[trends]', ...a); }

// ---------------------------------------------------------------------
// 1) UTILIDADES IA
// ---------------------------------------------------------------------

async function cfRun(model, payload){
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error('CF missing');
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type':'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Cloudflare AI ${res.status}`);
  const json = await res.json();
  // Workers AI puede devolver {result: {response: "..."} } o {result: {message: "..."}}
  return json?.result?.response ?? json?.result?.message ?? '';
}

async function openaiChatJSON(system, user){
  if (!OPENAI_API_KEY) throw new Error('OpenAI missing');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type':'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role:'system', content: system },
        { role:'user',   content: user }
      ],
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t}`);
  }
  const data = await res.json();
  const txt = data?.choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(txt); } catch { return {}; }
}

// Traducción robusta a ES con cadena de fallbacks (CF -> OpenAI -> local)
async function toSpanish(text){
  if (!text) return text;
  // 1) Cloudflare
  try{
    if (CF_ACCOUNT_ID && CF_API_TOKEN){
      const prompt = `Traduce al español (España) en una sola frase, sin comillas. Mantén marcas/modelos sin traducir.\n"${text}"`;
      const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
        messages:[{ role:'user', content: prompt }]
      });
      const val = (out||'').toString().trim();
      if (val) { log('traductor: CF'); return val; }
    }
  }catch(e){ log('CF translate falló:', e.message); }

  // 2) OpenAI
  try{
    if (OPENAI_API_KEY){
      const sys = 'Devuelve JSON con {"es": "..."}; traduce al español (España) manteniendo marcas/modelos.';
      const obj = await openaiChatJSON(sys, text);
      if (obj?.es) { log('traductor: OpenAI'); return String(obj.es).trim(); }
    }
  }catch(e){ log('OpenAI translate falló:', e.message); }

  // 3) Fallback local (muy básico)
  log('traductor: Fallback local');
  const replacements = [
    [/review/gi,'reseña'],
    [/best/gi,'mejor'],
    [/deal/gi,'oferta'],
    [/price/gi,'precio'],
    [/discount/gi,'descuento'],
  ];
  let out = text;
  replacements.forEach(([re, rep]) => { out = out.replace(re, rep); });
  // Capitaliza primera letra
  out = out.replace(/^./, m => m.toUpperCase());
  return out;
}

// Mini-review en ES (CF -> OpenAI -> plantilla)
async function genReviewES(titleEs){
  // 1) Cloudflare
  try{
    if (CF_ACCOUNT_ID && CF_API_TOKEN){
      const system = `Eres redactor español (ES). Escribe mini-review 70–100 palabras en ES:
- 1 frase resumen profesional (sin hype).
- 3 Pros (•).
- 2 Contras (•).
- Recomendación final corta y neutra.
No inventes especificaciones.`;
      const msg = `${system}\nProducto: ${titleEs}`;
      const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', { messages:[{role:'user', content: msg}]});
      const val = (out||'').toString().trim();
      if (val) { log('review: CF'); return val; }
    }
  }catch(e){ log('CF review falló:', e.message); }

  // 2) OpenAI
  try{
    if (OPENAI_API_KEY){
      const sys = `Devuelve JSON con {"review": "…"} en español (ES), 70–100 palabras, con secciones:
Resumen: …
Pros
- …
- …
- …
Contras
- …
- …
Recomendación: …
No inventes especificaciones.`;
      const obj = await openaiChatJSON(sys, `Producto: ${titleEs}`);
      if (obj?.review){ log('review: OpenAI'); return String(obj.review).trim(); }
    }
  }catch(e){ log('OpenAI review falló:', e.message); }

  // 3) Plantilla
  log('review: Plantilla');
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

// Imagen desde Pexels (usando el título EN ESPAÑOL para buscar)
async function pexelsImage(queryEs){
  if (!PEXELS_API_KEY) return '/placeholder.jpg';
  try{
    const url = new URL('https://api.pexels.com/v1/search');
    url.searchParams.set('query', queryEs);
    url.searchParams.set('per_page', '10');
    url.searchParams.set('orientation', 'landscape');
    const res = await fetch(url, { headers:{ Authorization: PEXELS_API_KEY }});
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

// ---------------------------------------------------------------------
// 2) RECOGIDA DE CANDIDATOS
// ---------------------------------------------------------------------

async function fetchRedditTitles(sub){
  const parser = new Parser({ headers:{ 'User-Agent':'TeknovashopTrendsBot/1.0 (contact: trends@teknovashop.com)' }});
  const url = `https://www.reddit.com/r/${sub}/top/.rss?t=day`;
  try{
    const feed = await parser.parseURL(url);
    return (feed.items || []).map(it => it.title).slice(0, 30);
  }catch(e){
    log('Reddit error', sub, e.message);
    return [];
  }
}

function looksLikeProduct(q){
  const kw = [
    'mejor','review','oferta','rebaja','comprar','precio','auriculares','teclado','ratón','robot','aspirador',
    'airfryer','silla','monitor','ssd','iphone','samsung','xiaomi','zapatillas','chaqueta','lámpara','cafetera',
    'tablet','portátil','router','cámara','barbacoa','mancuernas','bicicleta','colchón','android','smartwatch','reloj',
    'barato','gama media','calidad precio','cancelación de ruido','nvme','micro sd','memoria',
    'best','deal','discount','buy','price','headphones','keyboard','mouse','vacuum','air fryer','chair','monitor',
    'ssd','iphone','samsung','xiaomi','sneakers','jacket','lamp','coffee','tablet','laptop','router','camera',
    'grill','dumbbell','bike','mattress','smartwatch','noise cancelling'
  ];
  const s = q.toLowerCase();
  return kw.some(k => s.includes(k)) || /\b\d{2,}(\.\d+)?\s?(hz|w|mah|gb|tb|cm|mm)\b/i.test(q);
}

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

async function collectCandidates(){
  const out = {};
  for (const [niche, cfg] of Object.entries(niches)) {
    const titles = [];
    for (const sub of (cfg.subreddits || [])) {
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

    out[niche] = sorted.map(({title,count}) => ({
      title: title.replace(/^./, m=>m.toUpperCase()),
      count
    }));
    log('Niche', niche, 'candidatos', out[niche].length);
  }
  return out;
}

// ---------------------------------------------------------------------
// 3) GENERACIÓN
// ---------------------------------------------------------------------

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
      // 1) Forzar título ES con fallbacks
      const titleEs = await toSpanish(title);

      // 2) Slug
      const slug = slugify(titleEs).slice(0,80) || `item-${Math.random().toString(36).slice(2,8)}`;

      // 3) Imagen Pexels con query ES
      const hero = await pexelsImage(titleEs);

      // 4) Mini-review ES (con fallbacks)
      const review = await genReviewES(titleEs);

      // (Opcional) Valoración simulada si quieres que todas las tarjetas muestren estrellas
      // Si prefieres sólo cuando lo pongas a mano, comenta estas dos líneas:
      const rating = 4.1 + Math.random() * 0.4;     // 4.1–4.5 aprox
      const ratingCount = Math.floor(50 + Math.random()*120); // 50–170

      // 5) MD con front-matter + cuerpo
      const fm = [
        '---',
        `title: "${titleEs.replace(/"/g, '\\"')}"`,
        `slug: "${slug}"`,
        `date: "${new Date().toISOString()}"`,
        `niche: "${niche}"`,
        `score: ${count}`,
        `hero: "${hero}"`,
        `rating: ${rating.toFixed(1)}`,
        `ratingCount: ${ratingCount}`,
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
    log('ATENCIÓN: 0 items generados. Revisa conectividad/keys (Pexels / CF / OpenAI).');
  }
}

main().catch(e => { console.error('Fallo crítico:', e); process.exit(1); });
