// scripts/trends_daily.mjs
// Generador diario de tendencias en español con filtro de “producto” y
// mejora de imágenes por Pexels. Compatible con OpenAI o CF Workers AI.

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

// === IA ===
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CF_ACCOUNT_ID  = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN   = process.env.CF_API_TOKEN;

function log(...a){ console.log('[trends]', ...a); }

// === Fechas y rutas de salida ===
const today = new Date();
const yyyy = today.getFullYear();
const mm   = String(today.getMonth()+1).padStart(2,'0');
const dd   = String(today.getDate()).padStart(2,'0');

const outDirContent = path.join(ROOT, 'src', 'content', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirContent, { recursive: true });

const outDirData = path.join(ROOT, 'src', 'data', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirData, { recursive: true });

// ---------- IA helpers ----------

async function openaiChatJSON(messages, temperature=0.2){
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature,
      response_format:{ type:'json_object' },
      messages
    })
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

async function cfRun(model, payload){
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    method:'POST',
    headers:{
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type':'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`WorkersAI ${res.status}`);
  return await res.json();
}

// Traducción a ES (OpenAI -> CF -> original)
async function toSpanish(text){
  if (!text) return text;
  // 1) OpenAI
  if (OPENAI_API_KEY){
    try{
      const out = await openaiChatJSON([
        { role:'system', content: 'Eres traductor al español de España. Devuelve JSON {"es":"..."} con una frase natural, sin comillas exteriores.' },
        { role:'user', content: text }
      ], 0.1);
      return out.es?.trim() || text;
    }catch(e){ log('OpenAI toSpanish:', e.message); }
  }
  // 2) Cloudflare
  if (CF_ACCOUNT_ID && CF_API_TOKEN){
    try{
      const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
        messages:[{ role:'user', content:`Traduce al español (ES) en una sola frase, sin comillas:\n${text}` }]
      });
      return (out?.result?.response || out?.result?.message || '').trim() || text;
    }catch(e){ log('CF toSpanish:', e.message); }
  }
  // 3) Original
  return text;
}

// Clasificación: ¿parece un producto?
async function isProductTitle(title){
  // Heurística rápida
  const quick = /\b(review|precio|oferta|comprar|características|especificaciones|modelo|lanzamiento)\b/i.test(title) ||
                /\b(\d{2,}\s?(hz|w|mah|gb|tb|cm|mm))\b/i.test(title);
  if (quick) return true;

  // OpenAI si se puede
  if (OPENAI_API_KEY){
    try{
      const out = await openaiChatJSON([
        { role:'system', content:'Responde JSON {"ok":true|false}. TRUE si el título trata de un producto físico concreto (marca/modelo o gadget). Nada de opiniones, historias ni preguntas generales.' },
        { role:'user', content: title }
      ], 0);
      return !!out.ok;
    }catch(e){ log('OpenAI isProduct:', e.message); }
  }
  // Cloudflare si se puede
  if (CF_ACCOUNT_ID && CF_API_TOKEN){
    try{
      const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
        messages:[{ role:'user', content:`Responde solo true/false si es producto físico concreto:\n${title}` }]
      });
      const txt = String(out?.result?.response || out?.result?.message || '').toLowerCase();
      return txt.includes('true');
    }catch(e){ log('CF isProduct:', e.message); }
  }

  return quick;
}

// Extraer “marca + modelo” para buscar imagen en Pexels
async function extractBrandModel(title){
  // OpenAI preferente
  if (OPENAI_API_KEY){
    try{
      const out = await openaiChatJSON([
        { role:'system', content:'Devuelve JSON {"query":"marca modelo"} a partir del título. Si no hay marca+modelo, devuélvelo lo más compacto posible (2-4 palabras). Sin signos raros.' },
        { role:'user', content: title }
      ], 0.2);
      return out.query?.trim() || title;
    }catch(e){ log('OpenAI extractBrandModel:', e.message); }
  }
  // Cloudflare
  if (CF_ACCOUNT_ID && CF_API_TOKEN){
    try{
      const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
        messages:[{ role:'user', content:`Devuelve solo una línea con "marca modelo" ideal para buscar imágenes del producto:\n${title}` }]
      });
      return (out?.result?.response || out?.result?.message || '').trim() || title;
    }catch(e){ log('CF extractBrandModel:', e.message); }
  }
  return title;
}

// Mini review
async function genReviewES(titleEs){
  const fallback = `**Resumen**: Tendencia destacada del día.

**Pros**
- Buena relación calidad/precio
- Útil en el día a día
- Sencillo de usar

**Contras**
- Puede no encajar en todos los casos
- Stock variable

**Recomendación**: compara precios y opiniones antes de comprar.`;

  if (OPENAI_API_KEY){
    try{
      const out = await openaiChatJSON([
        { role:'system', content:`Eres redactor de e-commerce. Devuelve JSON {"review":"markdown"} (70–100 palabras) con:
- 1 frase resumen profesional
- Pros (3 bullets)
- Contras (2 bullets)
- Recomendación corta y neutra
No inventes especificaciones.` },
        { role:'user', content: `Producto: ${titleEs}` }
      ], 0.3);
      return out.review?.trim() || fallback;
    }catch(e){ log('OpenAI review:', e.message); }
  }

  if (CF_ACCOUNT_ID && CF_API_TOKEN){
    try{
      const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
        messages:[{ role:'user', content:
`Eres redactor de e-commerce. Escribe en español (70–100 palabras) con:
- 1 frase resumen profesional
- Pros (3 bullets)
- Contras (2 bullets)
- Recomendación corta
No inventes datos.
Producto: ${titleEs}` }]
      });
      return (out?.result?.response || out?.result?.message || '').trim() || fallback;
    }catch(e){ log('CF review:', e.message); }
  }

  return fallback;
}

// ---------- Imágenes (Pexels) ----------

async function pexelsImage(query){
  if (!PEXELS_API_KEY) return '/placeholder.jpg';
  try{
    const url = new URL('https://api.pexels.com/v1/search');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '8');
    url.searchParams.set('orientation', 'landscape');

    const res = await fetch(url, { headers:{ Authorization: PEXELS_API_KEY } });
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

// ---------- Fuentes de candidatos ----------

async function fetchRedditTitles(sub){
  const parser = new Parser({
    headers: { 'User-Agent':'TeknovashopTrendsBot/1.0 (contact: trends@teknovashop.com)' }
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

async function fetchGoogleTrendsFallback(){
  try{
    const res = await trends.realTimeTrends({ geo:'ES', category:'all', hl:'es' });
    const payload = JSON.parse(res);
    const titles = [];
    for (const st of (payload?.storySummaries?.trendingStories || [])) {
      for (const art of (st.articles || [])) {
        if (art?.title) titles.push(art.title);
      }
    }
    const uniq = [...new Set(titles)].slice(0, 30);
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

    // limpieza básica
    const cleaned = titles
      .map(t => t.replace(/\[.*?\]|\(.*?\)|\b\d{2,}%\b|\b[\d,.]+\s?(%|eur|€|usd|\$)/gi, '').trim())
      .filter(Boolean);

    const freq = {};
    cleaned.forEach(t => { if (t.length >= 8) freq[t.toLowerCase()] = (freq[t.toLowerCase()] || 0) + 1; });

    let sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([title,count]) => ({ title, count }));

    if (sorted.length === 0) {
      const gt = await fetchGoogleTrendsFallback();
      sorted = gt.map(t => ({ title: t, count: 1 }));
    }

    out[niche] = sorted;
    log('Niche', niche, 'candidatos', out[niche].length);
  }
  return out;
}

// ---------- Enlaces (con afiliado para ES) ----------
function buildLinks(q){
  return [
    { label:'Amazon (ES)', url: affAmazonSearch(q, AMAZON_TAG_ES) },
    { label:'AliExpress',  url: affAliExpressSearch(q) },
    { label:'SHEIN',       url: affSheinSearch(q) }
  ];
}

// ---------- MAIN ----------
async function main(){
  log('Inicio generación', `${yyyy}-${mm}-${dd}`);

  const candidates = await collectCandidates();
  const items = [];

  for (const [niche, arr] of Object.entries(candidates)) {
    // Máximo 5 por nicho
    for (const { title, count } of (arr || []).slice(0, 5)) {

      // 0) Filtrar que tenga pinta de producto
      if (!(await isProductTitle(title))) continue;

      // 1) Título ES
      const titleEs = await toSpanish(title);

      // 2) Slug
      const slug = slugify(titleEs).slice(0,80) || `item-${Math.random().toString(36).slice(2,8)}`;

      // 3) Imagen: query “marca + modelo” para Pexels
      const productQuery = await extractBrandModel(titleEs);
      const hero = await pexelsImage(productQuery);

      // 4) Mini-review ES
      const review = await genReviewES(titleEs);

      // 5) Front matter + body
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

      const linksMd = buildLinks(productQuery).map(l => `- [${l.label}](${l.url})`).join('\n');

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
    log('ATENCIÓN: 0 items generados. Revisa conectividad/keys (OPENAI / CF / Pexels).');
  }
}

main().catch(e => { console.error('Fallo crítico:', e); process.exit(1); });
