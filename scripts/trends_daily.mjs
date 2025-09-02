// scripts/trends_daily.mjs
import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import trends from 'google-trends-api';
import pLimit from 'p-limit';
import {
  slugify,
  affAmazonSearch,
  affAliExpressSearch,
  affSheinSearch,
  refineImageQuery,
  imagePrompt,
} from './utils.mjs';

const ROOT = process.cwd();
const niches = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'niches.json'), 'utf-8')
);

// === TAG AMAZON ===
const AMAZON_TAG_ES = process.env.AMAZON_TAG_ES || 'teknovashop25-21';

// === Carpetas de salida ===
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');

const outDirContent = path.join(ROOT, 'src', 'content', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirContent, { recursive: true });

const outDirData = path.join(ROOT, 'src', 'data', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirData, { recursive: true });

const publicDir = path.join(ROOT, 'public', 'trends');
fs.mkdirSync(publicDir, { recursive: true });

// === Opcional: Workers AI (Cloudflare) ===
const cfAccount = process.env.CF_ACCOUNT_ID;
const cfToken = process.env.CF_API_TOKEN;

// === Pexels ===
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

// Logging muy simple
const log = (...a) => console.log('[trends]', ...a);

// ---------- IA opcional (CF) ----------
async function cfRun(model, payload) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Workers AI ${res.status}`);
  return await res.json();
}

async function genReview(title) {
  if (cfAccount && cfToken) {
    try {
      const prompt = `Eres un redactor de commerce en español (ES). 
Escribe una ficha rápida y profesional del producto "${title}" en 80-120 palabras:
- ¿Para quién es?
- 3 puntos clave (bullet)
- Pros y Contras (bullet)
- Veredicto corto (1 frase).
No inventes especificaciones.`;
      const out = await cfRun('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }],
      });
      return out?.result?.response || out?.result || '';
    } catch (e) {
      log('IA review fallback:', e.message);
    }
  }

  // Fallback sin IA (plantilla breve y profesional)
  return `**Para quién es**: usuarios que buscan buena relación calidad/precio sin complicaciones.
  
**Puntos clave**
- Configuración sencilla y uso diario.
- Vende bien y tiene demanda actual.
- Alternativas cercanas compiten en precio.

**Pros**
- Buena relación calidad/precio.
- Fácil de usar.

**Contras**
- Puede no encajar en todos los casos.
- Stock variable.

**Veredicto**: opción sólida si ajusta a tus necesidades y presupuesto.`;
}

// ---------- Imágenes ----------

async function imageFromPexels(query, slug) {
  if (!PEXELS_API_KEY) return null;
  try {
    const url = new URL('https://api.pexels.com/v1/search');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '1');
    url.searchParams.set('orientation', 'landscape');
    url.searchParams.set('size', 'large');
    url.searchParams.set('locale', 'es-ES');

    const res = await fetch(url, {
      headers: { Authorization: PEXELS_API_KEY },
    });
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    const data = await res.json();
    const photo = data?.photos?.[0];
    if (!photo) return null;

    // elegimos landscape/large2x cuando exista
    const src = photo.src?.landscape || photo.src?.large2x || photo.src?.large || photo.src?.original;
    if (!src) return null;

    // Descargamos al public/ para que quede estático
    const file = path.join(publicDir, `${slug}.jpg`);
    const imgRes = await fetch(src);
    if (!imgRes.ok) throw new Error(`Descarga img ${imgRes.status}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    fs.writeFileSync(file, buf);

    return `/trends/${slug}.jpg`;
  } catch (e) {
    log('Pexels error:', e.message);
    return null;
  }
}

async function genImage(title, slug, niche) {
  // 1) Pexels (preferido)
  const q = refineImageQuery(title, niche);
  const fromPexels = await imageFromPexels(q, slug);
  if (fromPexels) return fromPexels;

  // 2) (Opcional) Workers AI
  if (cfAccount && cfToken) {
    try {
      const out = await cfRun('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
        prompt: imagePrompt(title),
        num_steps: 20,
        width: 1280,
        height: 720,
      });
      const b64 = out?.result?.image;
      if (b64) {
        const file = path.join(publicDir, `${slug}.png`);
        fs.writeFileSync(file, Buffer.from(b64, 'base64'));
        return `/trends/${slug}.png`;
      }
    } catch (e) {
      log('IA image fallback:', e.message);
    }
  }

  // 3) Fallback local
  return '/placeholder.jpg';
}

// ---------- Fuentes de candidatos ----------

async function fetchRedditTitles(sub) {
  const parser = new Parser({
    headers: {
      'User-Agent': 'TeknovashopTrendsBot/1.0 (contact: trends@teknovashop.com)',
    },
  });
  const url = `https://www.reddit.com/r/${sub}/top/.rss?t=day`;
  try {
    const feed = await parser.parseURL(url);
    return (feed.items || []).map((it) => it.title).slice(0, 30);
  } catch (e) {
    log('Reddit error', sub, e.message);
    return [];
  }
}

function looksLikeProduct(q) {
  const kw = [
    'mejor',
    'review',
    'oferta',
    'comprar',
    'precio',
    'auriculares',
    'teclado',
    'ratón',
    'robot',
    'aspirador',
    'airfryer',
    'silla',
    'monitor',
    'ssd',
    'iphone',
    'samsung',
    'xiaomi',
    'zapatillas',
    'chaqueta',
    'lámpara',
    'cafetera',
    'tablet',
    'portátil',
    'router',
    'cámara',
    'barbacoa',
    'mancuernas',
    'bicicleta',
    'colchón',
  ];
  const s = q.toLowerCase();
  return kw.some((k) => s.includes(k)) || /\b\d{2,}(\.\d+)?\s?(hz|w|mah|gb|tb|cm|mm)\b/i.test(q);
}

async function fetchGoogleTrendsFallback() {
  try {
    const res = await trends.realTimeTrends({ geo: 'ES', category: 'all', hl: 'es' });
    const payload = JSON.parse(res);
    const titles = [];
    for (const st of payload?.storySummaries?.trendingStories || []) {
      for (const art of st.articles || []) {
        if (art?.title) titles.push(art.title);
      }
    }
    const uniq = [...new Set(titles)].filter(looksLikeProduct).slice(0, 20);
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
    const cleaned = titles
      .map((t) =>
        t
          .replace(/\[.*?\]|\(.*?\)|\b\d{2,}%\b|\b[\d,.]+\s?(%|eur|€|usd|\$)/gi, '')
          .replace(/[-–—••]/g, ' ')
          .trim()
      )
      .filter(Boolean);

    const freq = {};
    cleaned.forEach((t) => {
      if (t.length >= 8) freq[t.toLowerCase()] = (freq[t.toLowerCase()] || 0) + 1;
    });

    let sorted = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([title, count]) => ({ title, count }));

    if (sorted.length === 0) {
      const gt = await fetchGoogleTrendsFallback();
      sorted = gt.map((t) => ({ title: t, count: 1 }));
    }

    // Capitalizar primera letra
    out[niche] = sorted.map(({ title, count }) => ({
      title: title.replace(/^./, (m) => m.toUpperCase()),
      count,
    }));
  }
  return out;
}

// ---------- Links ----------
function buildLinks(q) {
  return [
    { label: 'Amazon (ES)', url: affAmazonSearch(q, AMAZON_TAG_ES) },
    { label: 'AliExpress', url: affAliExpressSearch(q) },
    { label: 'SHEIN', url: affSheinSearch(q) },
  ];
}

// ---------- Main ----------
async function main() {
  log('Inicio generación', `${yyyy}-${mm}-${dd}`);

  const candidates = await collectCandidates();
  const limit = pLimit(4);

  const items = [];

  const tasks = [];
  for (const [niche, arr] of Object.entries(candidates)) {
    for (const { title, count } of (arr || []).slice(0, 5)) {
      tasks.push(
        limit(async () => {
          const slug = slugify(title) || `item-${Math.random().toString(36).slice(2, 8)}`;
          const review = await genReview(title);
          const hero = await genImage(title, slug, niche);

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

          const links = buildLinks(title)
            .map((l) => `- [${l.label}](${l.url})`)
            .join('\n');

          const body = `${fm}

${review}

**Dónde comparar precios**
${links}
`;

          fs.writeFileSync(path.join(outDirContent, `${slug}.md`), body, 'utf-8');

          items.push({ slug, title, niche, score: count, hero });
          log('Escrito', niche, slug);
        })
      );
    }
  }

  await Promise.all(tasks);

  const indexPayload = { date: `${yyyy}-${mm}-${dd}`, items };
  fs.writeFileSync(
    path.join(outDirData, 'index.json'),
    JSON.stringify(indexPayload, null, 2),
    'utf-8'
  );

  log('Total items', items.length, 'Salida', path.join('src/data/trends', `${yyyy}/${mm}/${dd}`));
  if (items.length === 0) {
    log('ATENCIÓN: 0 items generados. Revisa conectividad desde el runner.');
  }
}

main().catch((e) => {
  console.error('Fallo crítico:', e);
  process.exit(1);
});
