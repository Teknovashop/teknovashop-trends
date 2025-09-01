// scripts/trends_daily.mjs
import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import trends from 'google-trends-api';
import { slugify, affAmazonSearch, affAliExpressSearch, affSheinSearch, imagePrompt, reviewPromptES } from './utils.mjs';

const ROOT = process.cwd();

const nichesPath = path.join(ROOT, 'data', 'niches.json');
const niches = JSON.parse(fs.readFileSync(nichesPath, 'utf-8'));

const AMAZON_TAG_ES = process.env.AMAZON_TAG_ES || 'teknovashop-21';

// Fecha de hoy
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');

// Salidas
const outDirContent = path.join(ROOT, 'src', 'content', 'trends', String(yyyy), mm, dd); // .md
const outDirData    = path.join(ROOT, 'src', 'data',    'trends', String(yyyy), mm, dd); // index.json
const publicDir     = path.join(ROOT, 'public', 'trends');                                // imágenes

fs.mkdirSync(outDirContent, { recursive: true });
fs.mkdirSync(outDirData,    { recursive: true });
fs.mkdirSync(publicDir,     { recursive: true });

// Cloudflare Workers AI
const cfAccount = process.env.CF_ACCOUNT_ID;
const cfToken   = process.env.CF_API_TOKEN;

function log(...a) { console.log('[trends]', ...a); }

// ---------------------------------
// Helpers Cloudflare Workers AI
// ---------------------------------
async function cfRun(model, payload) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Workers AI ${res.status}`);
  return await res.json();
}

// ---------------------------------
// Español: detección ligera + traducción
// ---------------------------------
const EN_STOP = [' the ', ' and ', ' of ', ' with ', ' for ', ' to ', ' in ', ' is '];

function looksEnglish(s) {
  const t = ` ${String(s || '').toLowerCase()} `;
  return EN_STOP.some(w => t.includes(w)) && !(t.includes(' el ') || t.includes(' la ') || t.includes(' los ') || t.includes(' las '));
}

async function toSpanish(text) {
  // si ya parece español, devuélvelo
  if (!looksEnglish(text)) return text;

  // usamos IA si hay credenciales
  if (cfAccount && cfToken) {
    try {
      const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: `Traduce de forma natural al español (España), sin añadir nada, este texto: "${text}".` }]
      });
      const r = out?.result?.response || '';
      if (r && r.length > 3) return r.replace(/^"|"$/g,'');
    } catch (e) {
      log('Traducción fallida, continúo:', e.message);
    }
  }
  return text;
}

// ---------------------------------
// Mini-review en español
// ---------------------------------
async function genReview(titleEs) {
  const prompt = reviewPromptES(titleEs);

  if (!cfAccount || !cfToken) {
    // fallback si no hay IA (mensaje neutro monetizable)
    return `Resumen: tendencia del día.\n\nPros:\n- Buena relación calidad/precio\n- Fácil de usar\n- Útil para el día a día\nContras:\n- Puede no encajar con todos los casos\n- Stock variable\nRecomendación: compara precios y opiniones antes de comprar.`;
  }

  try {
    const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role: 'user', content: prompt }] });
    return out?.result?.response || '';
  } catch (e) {
    log('IA review fallback:', e.message);
    return `Resumen: tendencia del día.\n\nPros:\n- Buena relación calidad/precio\n- Fácil de usar\n- Útil para el día a día\nContras:\n- Puede no encajar con todos los casos\n- Stock variable\nRecomendación: compara precios y opiniones antes de comprar.`;
  }
}

// ---------------------------------
// Imagen 16:9 profesional
// ---------------------------------
async function genImage(titleEs, slug) {
  const localFile = path.join(publicDir, `${slug}.png`);
  if (fs.existsSync(localFile)) return `/trends/${slug}.png`;

  if (cfAccount && cfToken) {
    try {
      const out = await cfRun('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
        prompt: imagePrompt(titleEs), num_steps: 20, width: 1024, height: 576
      });
      const b64 = out?.result?.image;
      if (b64) {
        fs.writeFileSync(localFile, Buffer.from(b64, 'base64'));
        return `/trends/${slug}.png`;
      }
    } catch (e) {
      log('IA image fallback:', e.message);
    }
  }

  // Fallback (por si faltaran credenciales o hay rate limit puntual)
  return `https://source.unsplash.com/1024x576/?${encodeURIComponent(titleEs)}`;
}

// ---------------------------------
// Fuentes / filtrado
// ---------------------------------
async function fetchRedditTitles(sub) {
  const parser = new Parser({ headers: { 'User-Agent': 'TeknovashopTrendsBot/1.0 (contact: trends@teknovashop.com)' } });
  const url = `https://www.reddit.com/r/${sub}/top/.rss?t=day`;
  try {
    const feed = await parser.parseURL(url);
    return (feed.items || []).map(it => it.title).slice(0, 30);
  } catch (e) {
    log('Reddit error', sub, e.message);
    return [];
  }
}

function looksLikeProduct(q) {
  const kw = [
    'mejor','review','oferta','rebaja','comprar','precio','descuento',
    'auriculares','teclado','ratón','robot','aspirador','airfryer','silla',
    'monitor','ssd','iphone','samsung','xiaomi','zapatillas','chaqueta',
    'lámpara','cafetera','tablet','portátil','router','cámara','barbacoa',
    'mancuernas','bicicleta','colchón','altavoz','smartwatch','tv','impresora'
  ];
  const s = String(q).toLowerCase();
  return kw.some(k => s.includes(k)) || /\b\d{2,}(\.\d+)?\s?(hz|w|mah|gb|tb|cm|mm)\b/i.test(q);
}

const EXCLUDE = [
  // evitar titulares políticos/financieros/noticiosos
  'trump','biden','election','medicare','cuban','stock','market','fed','policy',
  'ceo','earnings','report','quarter','plan','company','says','gen z'
];

function cleanTitle(t) {
  let s = String(t || '').replace(/\s+/g,' ').trim();
  if (s.length > 120) s = s.slice(0,117)+'…';
  return s;
}

async function fetchGoogleTrendsFallback() {
  try {
    const res = await trends.realTimeTrends({ geo: 'ES', category: 'all', hl: 'es' });
    const payload = JSON.parse(res);
    const titles = [];
    for (const st of (payload?.storySummaries?.trendingStories || [])) {
      for (const art of (st.articles || [])) {
        if (art?.title) titles.push(art.title);
      }
    }
    const uniq = [...new Set(titles)]
      .map(cleanTitle)
      .filter(t => !EXCLUDE.some(w => t.toLowerCase().includes(w)))
      .filter(looksLikeProduct)
      .slice(0, 20);
    log('GoogleTrends candidatos', uniq.length);
    return uniq;
  } catch (e) {
    log('GoogleTrends error', e.message);
    return [];
  }
}

async function collectCandidates() {
  const out = {};
  for (const [niche, cfg] of Object.entries(niches)) {
    const titles = [];
    for (const sub of cfg.subreddits) {
      const t = await fetchRedditTitles(sub);
      titles.push(...t);
    }

    let cleaned = titles
      .map(t => t.replace(/\[.*?\]|\(.*?\)|\b\d{2,}%\b|\b[\d,.]+\s?(%|eur|€|usd|\$)/gi, '').trim())
      .map(cleanTitle)
      .filter(t => !EXCLUDE.some(w => t.toLowerCase().includes(w)))
      .filter(looksLikeProduct);

    if (cleaned.length === 0) cleaned = await fetchGoogleTrendsFallback();

    const freq = {};
    cleaned.forEach(t => { if (t.length >= 6) freq[t.toLowerCase()] = (freq[t.toLowerCase()] || 0) + 1; });
    const sorted = Object.entries(freq)
      .sort((a,b)=>b[1]-a[1])
      .map(([title,count]) => ({ title: title.replace(/^./, m => m.toUpperCase()), count }));

    out[niche] = sorted;
    log('Niche', niche, 'candidatos', out[niche].length);
  }
  return out;
}

// ---------------------------------
// Enlaces afiliados (3 comparadores)
// ---------------------------------
function buildLinks(q) {
  return [
    { label:'Amazon (ES)', url: affAmazonSearch(q, AMAZON_TAG_ES) },
    { label:'AliExpress',  url: affAliExpressSearch(q) },
    { label:'SHEIN',       url: affSheinSearch(q) }
  ];
}

// ---------------------------------
// MAIN
// ---------------------------------
async function main(){
  log('Inicio generación', `${yyyy}-${mm}-${dd}`);

  const candidates = await collectCandidates();

  const items = [];
  for (const [niche, arr] of Object.entries(candidates)) {
    for (const { title, count } of (arr || []).slice(0,5)) {
      // Normalizamos a español
      const titleEs = await toSpanish(title);

      const slug  = slugify(titleEs) || `item-${Math.random().toString(36).slice(2,8)}`;
      const hero  = await genImage(titleEs, slug);
      const review = await genReview(titleEs);

      const frontmatter = [
        '---',
        `title: "${titleEs.replace(/"/g, '\\"')}"`,
        `slug: "${slug}"`,
        `date: "${new Date().toISOString()}"`,
        `niche: "${niche}"`,
        `score: ${count}`,
        `hero: "${hero}"`,
        '---',
      ].join('\n');

      const links = buildLinks(titleEs).map(l => `- [${l.label}](${l.url})`).join('\n');

      const body = `${frontmatter}

${review}

**Dónde comparar precios**
${links}
`;

      fs.writeFileSync(path.join(outDirContent, `${slug}.md`), body, 'utf-8');

      items.push({ slug, title: titleEs, niche, score: count, hero });
      log('Escrito', niche, slug);
    }
  }

  const indexPayload = { date: `${yyyy}-${mm}-${dd}`, items };
  fs.writeFileSync(
    path.join(outDirData, 'index.json'),
    JSON.stringify(indexPayload, null, 2),
    'utf-8'
  );

  log('Total items', items.length, 'Salida', path.join('src/data/trends', `${yyyy}/${mm}/${dd}`));
  if (items.length === 0) log('ATENCIÓN: 0 items generados. Revisa conectividad/credenciales desde el runner.');
}

main().catch(e => { console.error('Fallo crítico:', e); process.exit(1); });
