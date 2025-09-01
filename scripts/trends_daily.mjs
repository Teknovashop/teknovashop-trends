// scripts/trends_daily.mjs
import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import trends from 'google-trends-api';
import { slugify, affAmazonSearch, affAliExpressSearch, affSheinSearch, imagePrompt } from './utils.mjs';

const ROOT = process.cwd();
const niches = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'niches.json'), 'utf-8'));
const AMAZON_TAG_ES = process.env.AMAZON_TAG_ES || 'teknovashop-21';

const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');

// ✅ Contenido (.md) en content/
const outDirContent = path.join(ROOT, 'src', 'content', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirContent, { recursive: true });

// ✅ Índice (JSON) en data/
const outDirData = path.join(ROOT, 'src', 'data', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirData, { recursive: true });

// ✅ Imágenes generadas
const publicDir = path.join(ROOT, 'public', 'trends');
fs.mkdirSync(publicDir, { recursive: true });

// Opcional IA (Cloudflare)
const cfAccount = process.env.CF_ACCOUNT_ID;
const cfToken = process.env.CF_API_TOKEN;

function log(...a) { console.log('[trends]', ...a); }

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

async function genReview(title) {
  const system = `Eres un redactor de commerce en español (ES). Escribe una mini-review de 60–90 palabras con pros/contras puntuales y una recomendación breve. No inventes especificaciones.`;
  const prompt = `${system}\nProducto: ${title}`;
  if (!cfAccount || !cfToken) {
    return `**Resumen**: Tendencia del día.\n\n**Pros**: práctico, buena relación calidad/precio. **Contras**: depende del caso.\n\n**Recomendación**: comparar precios y opiniones.`;
  }
  try {
    const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role: 'user', content: prompt }] });
    return out?.result?.response || out?.result?.message || out?.result || '';
  } catch (e) {
    log('IA review fallback:', e.message);
    return `**Resumen**: Tendencia del día.\n\n**Pros**: práctico, buena relación calidad/precio. **Contras**: depende del caso.\n\n**Recomendación**: comparar precios y opiniones.`;
  }
}

async function genImage(title, slug) {
  if (!cfAccount || !cfToken) return '/placeholder.jpg';
  try {
    const out = await cfRun('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
      prompt: imagePrompt(title), num_steps: 20, width: 1024, height: 576
    });
    const b64 = out?.result?.image;
    if (!b64) return '/placeholder.jpg';
    const file = path.join(publicDir, `${slug}.png`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    return `/trends/${slug}.png`;
  } catch (e) {
    log('IA image fallback:', e.message);
    return '/placeholder.jpg';
  }
}

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
  const kw = ['mejor', 'review', 'oferta', 'rebaja', 'comprar', 'precio',
    'auriculares', 'teclado', 'ratón', 'robot', 'aspirador', 'airfryer', 'silla',
    'monitor', 'ssd', 'iphone', 'samsung', 'xiaomi', 'zapatillas', 'chaqueta',
    'lámpara', 'cafetera', 'tablet', 'portátil', 'router', 'cámara', 'barbacoa',
    'mancuernas', 'bicicleta', 'colchón'];
  const s = q.toLowerCase();
  return kw.some(k => s.includes(k)) || /\b\d{2,}(\.\d+)?\s?(hz|w|mah|gb|tb|cm|mm)\b/i.test(q);
}

async function fetchGoogleTrendsFallback(niche) {
  try {
    const res = await trends.realTimeTrends({ geo: 'ES', category: 'all', hl: 'es' });
    const payload = JSON.parse(res);
    const titles = [];
    for (const st of (payload?.storySummaries?.trendingStories || [])) {
      for (const art of (st.articles || [])) {
        if (art?.title) titles.push(art.title);
      }
    }
    const uniq = [...new Set(titles)].filter(looksLikeProduct).slice(0, 20);
    log('GoogleTrends', niche, 'candidatos', uniq.length);
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
      const gt = await fetchGoogleTrendsFallback(niche);
      sorted = gt.map(t => ({ title: t, count: 1 }));
    }

    out[niche] = sorted.map(({title,count}) => ({ title: title.replace(/^./, m=>m.toUpperCase()), count }));
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
      const slug = slugify(title).slice(0,80) || `item-${Math.random().toString(36).slice(2,8)}`;
      const review = await genReview(title);
      const hero = await genImage(title, slug);

      const fm = [
        '---',
        `title: "${title.replace(/"/g, '\\"')}"`,
        `slug: "${slug}"`,
        `date: "${new Date().toISOString()}"`,
        `niche: "${niche}"`,
        `score: ${count}`,
        `hero: "${hero}"`,
        '---',
      ].join('\n');

      const links = buildLinks(title).map(l => `- [${l.label}](${l.url})`).join('\n');

      const body = `${fm}

${review}

**Dónde comparar precios**
${links}
`;
      // ✅ MD en content/
      fs.writeFileSync(path.join(outDirContent, `${slug}.md`), body, 'utf-8');

      items.push({ slug, title, niche, score: count, hero });
      log('Escrito', niche, slug);
    }
  }

  // ✅ Índice en data/
  const indexPayload = { date: `${yyyy}-${mm}-${dd}`, items };
  fs.writeFileSync(
    path.join(outDirData, 'index.json'),
    JSON.stringify(indexPayload, null, 2),
    'utf-8'
  );

  log('Total items', items.length, 'Salida', path.join('src/data/trends', `${yyyy}/${mm}/${dd}`));

  if (items.length === 0) {
    log('ATENCIÓN: 0 items generados. Revisa conectividad Reddit/Google Trends desde el runner.');
  }
}

main().catch(e => { console.error('Fallo crítico:', e); process.exit(1); });
