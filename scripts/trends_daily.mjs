// scripts/trends_daily.mjs
import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import trends from 'google-trends-api';
import { slugify, affAmazonSearch, affAliExpressSearch, affSheinSearch } from './utils.mjs';

const ROOT = process.cwd();
const niches = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'niches.json'), 'utf-8'));
const AMAZON_TAG_ES = process.env.AMAZON_TAG_ES || 'teknovashop-21';

// Fechas
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');

// Salidas
const outDirContent = path.join(ROOT, 'src', 'content', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirContent, { recursive: true });

const outDirData = path.join(ROOT, 'src', 'data', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirData, { recursive: true });

// Cloudflare Workers AI (opcional pero recomendado)
const cfAccount = process.env.CF_ACCOUNT_ID;
const cfToken = process.env.CF_API_TOKEN;

function log(...a) { console.log('[trends]', ...a); }

// -----------------------------
// Helpers IA
// -----------------------------
async function cfRun(model, payload) {
  if (!cfAccount || !cfToken) throw new Error('CF creds missing');
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Workers AI ${res.status}`);
  const json = await res.json();
  return json?.result;
}

// Traducción EN→ES con fallback
async function translateES(text) {
  // Normaliza cosas típicas antes de traducir
  const cleaned = text
    .replace(/\s+review\b/gi, ' reseña')
    .replace(/\bunder\s*\$?(\d+)/gi, 'por menos de $1 €')
    .trim();
  if (!cfAccount || !cfToken) return cleaned; // sin IA: devuelve tal cual
  try {
    // Modelo multilingüe: @cf/meta/m2m100-1.2b
    const out = await cfRun('@cf/meta/m2m100-1.2b', {
      text: cleaned,
      source_lang: 'en',
      target_lang: 'es'
    });
    const txt = out?.translated_text || out?.text || cleaned;
    // Capitaliza un poco
    return txt.replace(/^\s*./, c => c.toUpperCase());
  } catch (e) {
    log('translate fallback:', e.message);
    return cleaned;
  }
}

// Reseña corta en español
async function genReviewES(tituloES) {
  if (!cfAccount || !cfToken) {
    return `**Resumen**: tendencia del día.

**Pros**
- Buena relación calidad/precio
- Útil para el uso diario

**Contras**
- Puede no encajar en todos los casos
- Stock variable

**Recomendación**: compara precios y opiniones antes de comprar.`;
  }
  try {
    const prompt = `Eres redactor de comercio en español (ES).
Escribe una mini reseña (60–90 palabras) del siguiente producto/tendencia, con una lista breve de pros y contras y una recomendación final. No inventes especificaciones.

TÍTULO: ${tituloES}`;
    const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }]
    });
    return out?.response || out?.message || out || '';
  } catch (e) {
    log('review fallback:', e.message);
    return `**Resumen**: tendencia del día.

**Pros**
- Buena relación calidad/precio
- Útil para el uso diario

**Contras**
- Puede no encajar en todos los casos
- Stock variable

**Recomendación**: compara precios y opiniones antes de comprar.`;
  }
}

// Imagen “limpia” (sin marca) usando Unsplash Source
function heroFor(titleES) {
  // Terminos en español para búsquedas más “comerciales”
  const q = encodeURIComponent(
    titleES
      .replace(/reseña|review|análisis/gi, '')
      .replace(/comparativa/gi, 'product gadget')
      .trim() || 'producto tecnología'
  );
  return `https://source.unsplash.com/1024x576/?${q}`;
}

// -----------------------------
// Feeds
// -----------------------------
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
    'best','review','deal','buy','price',
    'headphones','keyboard','mouse','robot','vacuum','airfryer','chair',
    'monitor','ssd','iphone','samsung','xiaomi','sneakers','jacket',
    'lamp','coffee','tablet','laptop','router','camera','bbq',
    'dumbbell','bike','mattress'
  ];
  const s = q.toLowerCase();
  return kw.some(k => s.includes(k)) || /\b\d{2,}(\.\d+)?\s?(hz|w|mah|gb|tb|cm|mm)\b/i.test(q);
}

async function fetchGoogleTrendsFallback() {
  try {
    const res = await trends.realTimeTrends({ geo: 'ES', category: 'all', hl: 'es' });
    const payload = JSON.parse(res);
    const titles = [];
    for (const st of (payload?.storySummaries?.trendingStories || [])) {
      for (const art of (st.articles || [])) if (art?.title) titles.push(art.title);
    }
    const uniq = [...new Set(titles)].filter(looksLikeProduct).slice(0, 20);
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

    out[niche] = sorted.map(({title,count}) => ({ title: title.replace(/^./, m=>m.toUpperCase()), count }));
    log('Niche', niche, 'candidatos', out[niche].length);
  }
  return out;
}

// Enlaces de afiliado
function buildLinks(q){
  return [
    { label:'Amazon (ES)', url: affAmazonSearch(q, AMAZON_TAG_ES) },
    { label:'AliExpress',  url: affAliExpressSearch(q) },
    { label:'SHEIN',       url: affSheinSearch(q) }
  ];
}

// -----------------------------
// Main
// -----------------------------
async function main(){
  log('Inicio', `${yyyy}-${mm}-${dd}`);
  const candidates = await collectCandidates();

  const items = [];
  for (const [niche, arr] of Object.entries(candidates)) {
    for (const { title, count } of (arr || []).slice(0,5)) {
      // 1) Traducir título a ES
      const titleES = await translateES(title);

      // 2) Imagen basada en el título ES
      const hero = heroFor(titleES);

      // 3) Reseña en español
      const review = await genReviewES(titleES);

      // 4) Slug desde título ES
      const slug = slugify(titleES).slice(0,80) || `item-${Math.random().toString(36).slice(2,8)}`;

      // 5) Frontmatter + cuerpo
      const fm = [
        '---',
        `title: "${titleES.replace(/"/g, '\\"')}"`,
        `slug: "${slug}"`,
        `date: "${new Date().toISOString()}"`,
        `niche: "${niche}"`,
        `score: ${count}`,
        `hero: "${hero}"`,
        '---',
      ].join('\n');

      const links = buildLinks(titleES).map(l => `- [${l.label}](${l.url})`).join('\n');

      const body = `${fm}

${review}

**Dónde comparar precios**
${links}
`;

      // Guardar MD
      fs.writeFileSync(path.join(outDirContent, `${slug}.md`), body, 'utf-8');

      // Item para el índice
      items.push({ slug, title: titleES, niche, score: count, hero });
      log('OK', niche, slug);
    }
  }

  // Índice ES
  const indexPayload = { date: `${yyyy}-${mm}-${dd}`, items };
  fs.writeFileSync(path.join(outDirData, 'index.json'), JSON.stringify(indexPayload, null, 2), 'utf-8');

  log('Total items', items.length, '→', path.join('src/data/trends', `${yyyy}/${mm}/${dd}`));
  if (items.length === 0) log('ATENCIÓN: 0 items (revisa conectividad en el runner).');
}

main().catch(e => { console.error('Fallo crítico:', e); process.exit(1); });
