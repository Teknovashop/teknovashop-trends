// scripts/trends_daily.mjs
import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import trends from 'google-trends-api';
import { slugify, affAmazonSearch, affAliExpressSearch, affSheinSearch } from './utils.mjs';

const ROOT = process.cwd();
const niches = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'niches.json'), 'utf-8'));
const AMAZON_TAG_ES = process.env.AMAZON_TAG_ES || 'teknovashop-21';

const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');

const outDirContent = path.join(ROOT, 'src', 'content', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirContent, { recursive: true });

const outDirData = path.join(ROOT, 'src', 'data', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirData, { recursive: true });

// Opcional IA (Cloudflare)
const cfAccount = process.env.CF_ACCOUNT_ID;
const cfToken = process.env.CF_API_TOKEN;

function log(...a) { console.log('[trends]', ...a); }

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

async function translateES(text) {
  const cleaned = text
    .replace(/\s+review\b/gi, ' reseña')
    .replace(/\bunder\s*\$?(\d+)/gi, 'por menos de $1 €')
    .trim();
  if (!cfAccount || !cfToken) return cleaned;
  try {
    const out = await cfRun('@cf/meta/m2m100-1.2b', {
      text: cleaned, source_lang: 'en', target_lang: 'es'
    });
    const txt = out?.translated_text || out?.text || cleaned;
    return txt.replace(/^\s*./, c => c.toUpperCase());
  } catch (e) {
    log('translate fallback:', e.message);
    return cleaned;
  }
}

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

function heroFor(titleES) {
  const q = encodeURIComponent(
    titleES
      .replace(/reseña|review|análisis/gi, '')
      .replace(/comparativa/gi, 'product gadget')
      .trim() || 'producto tecnología'
  );
  return `https://source.unsplash.com/1024x576/?${q}`;
}

// === REDDIT con timeout y UA ===
async function fetchRedditTitles(sub) {
  const parser = new Parser({
    headers: { 'User-Agent': 'TeknovashopTrendsBot/1.0 (+https://teknovashop-trends.vercel.app)' },
    timeout: 10000
  });
  const url = `https://www.reddit.com/r/${sub}/top/.rss?t=day&limit=50`;
  try {
    const feed = await parser.parseURL(url);
    return (feed.items || []).map(it => it.title).slice(0, 40);
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
    'dumbbell','bike','mattress','unboxing','hands-on'
  ];
  const s = q.toLowerCase();
  return kw.some(k => s.includes(k)) || /\b\d{2,}(\.\d+)?\s?(hz|w|mah|gb|tb|cm|mm)\b/i.test(q);
}

// === Google Trends fallback ===
async function fetchGoogleTrendsFallback() {
  try {
    const res = await trends.realTimeTrends({ geo: 'ES', category: 'all', hl: 'es' });
    const payload = JSON.parse(res);
    const titles = [];
    for (const st of (payload?.storySummaries?.trendingStories || [])) {
      for (const art of (st.articles || [])) if (art?.title) titles.push(art.title);
    }
    const uniq = [...new Set(titles)].slice(0, 40);
    log('GoogleTrends candidatos', uniq.length);
    return uniq;
  } catch (e) {
    log('GoogleTrends error', e.message);
    return [];
  }
}

// === Semillas locales como red de seguridad ===
function loadSeeds() {
  const defaultSeeds = {
    tecnologia: [
      'Auriculares inalámbricos con cancelación de ruido',
      'Monitor 27 pulgadas 144 Hz para gaming',
      'Disco SSD NVMe 1 TB alta velocidad',
      'Tablet Android compacta para estudiar',
      'Cámara de seguridad wifi para exterior'
    ],
    hogar: [
      'Robot aspirador con mapeo láser',
      'Freidora de aire 5 litros',
      'Lámpara LED regulable escritorio',
      'Cafetera de cápsulas compacta',
      'Purificador de aire HEPA'
    ]
  };
  try {
    const p = path.join(ROOT, 'src', 'data', 'seeds.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch { /* ignore */ }
  return defaultSeeds;
}

async function collectCandidates() {
  const out = {};
  for (const [niche, cfg] of Object.entries(niches)) {
    const titles = [];
    for (const sub of cfg.subreddits) {
      const t = await fetchRedditTitles(sub);
      titles.push(...t);
    }

    // Si Reddit vacío, tira de Google Trends
    if (titles.length === 0) {
      const gt = await fetchGoogleTrendsFallback();
      titles.push(...gt);
    }

    // Si aún vacío, usa semillas locales
    if (titles.length === 0) {
      const seeds = loadSeeds();
      titles.push(...(seeds[niche] || []));
      log(`Usando semillas locales para "${niche}":`, titles.length);
    }

    const cleaned = titles.map(t =>
      t.replace(/\[.*?\]|\(.*?\)|\b\d{2,}%\b|\b[\d,.]+\s?(%|eur|€|usd|\$)/gi, '').trim()
    );

    // Conteo y filtro flexible
    const freq = {};
    cleaned.forEach(t => { if (t.length >= 6) freq[t.toLowerCase()] = (freq[t.toLowerCase()] || 0) + 1; });
    let sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([title,count]) => ({ title, count }));

    // Aplica filtro “producto”; si quedan pocos, relaja
    let filtered = sorted.filter(x => looksLikeProduct(x.title));
    if (filtered.length < 5 && sorted.length > 0) {
      filtered = sorted.slice(0, 10); // relajamos filtro
      log(`Filtro relajado en "${niche}" (tomando ${filtered.length})`);
    }

    out[niche] = filtered.map(({title,count}) => ({ title: title.replace(/^./, m=>m.toUpperCase()), count }));
    log('Niche', niche, 'candidatos finales', out[niche].length);
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
  log('Inicio', `${yyyy}-${mm}-${dd}`);
  const candidates = await collectCandidates();

  const items = [];
  for (const [niche, arr] of Object.entries(candidates)) {
    for (const { title, count } of (arr || []).slice(0,5)) {
      const titleES = await translateES(title);
      const hero = heroFor(titleES);
      const review = await genReviewES(titleES);
      const slug = slugify(titleES).slice(0,80) || `item-${Math.random().toString(36).slice(2,8)}`;

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

      fs.writeFileSync(path.join(outDirContent, `${slug}.md`), body, 'utf-8');
      items.push({ slug, title: titleES, niche, score: count, hero });
      log('OK', niche, slug);
    }
  }

  const indexPayload = { date: `${yyyy}-${mm}-${dd}`, items };
  fs.writeFileSync(path.join(outDirData, 'index.json'), JSON.stringify(indexPayload, null, 2), 'utf-8');

  log('Total items', items.length, '→', path.join('src/data/trends', `${yyyy}/${mm}/${dd}`));
  if (items.length === 0) {
    log('ATENCIÓN: 0 items (sin red o feeds vacíos). Activa semillas en src/data/seeds.json si hace falta.');
  }
}

main().catch(e => { console.error('Fallo crítico:', e); process.exit(1); });
