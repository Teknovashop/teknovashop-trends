// scripts/trends_daily.mjs
// Generador robusto de "Tendencias de productos" (ES) con imágenes coherentes.
// - Fuentes: subreddits de ofertas/productos + RSS tech/es.
// - Filtra títulos que no sean productos.
// - Traduce a ES (Cloudflare Workers AI si hay claves; si no, heurística mínima).
// - Elige imagen en Pexels según tipo de producto (mejora la concordancia).
// - Graba content MD y un índice JSON para /hoy y /archivo.

// Requisitos de entorno (antes ya usabas varios):
//  - PEXELS_API_KEY
//  - CF_ACCOUNT_ID  (opcional, para traducir)
//  - CF_API_TOKEN   (opcional, para traducir)
//  - AMAZON_TAG_ES  (opcional, sólo para links “Amazon (ES)”)

import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import fetch from 'node-fetch';

// ---------- Configura aquí lo mínimo ----------
const ROOT = process.cwd();
const NICHES_PATH = path.join(ROOT, 'data', 'niches.json'); // te dejo nuevo fichero más abajo
const niches = JSON.parse(fs.readFileSync(NICHES_PATH, 'utf-8'));

// ---------- Entorno ----------
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const AMAZON_TAG_ES  = process.env.AMAZON_TAG_ES  || ''; // ej. teknovashop25-21
const cfAccount = process.env.CF_ACCOUNT_ID || '';
const cfToken   = process.env.CF_API_TOKEN   || '';

function log(...a){ console.log('[trends]', ...a); }

// ---------- Fechas / rutas ----------
const today = new Date();
const yyyy = today.getFullYear();
const mm   = String(today.getMonth()+1).padStart(2,'0');
const dd   = String(today.getDate()).padStart(2,'0');

const outDirContent = path.join(ROOT, 'src', 'content', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirContent, { recursive: true });

const outDirData = path.join(ROOT, 'src', 'data', 'trends', String(yyyy), mm, dd);
fs.mkdirSync(outDirData, { recursive: true });

// ---------- Utilidades ----------
const STOPWORDS_EN_NEWSY = [
  'why','how','would','should','says','report','claims','lawsuit','court','reveals',
  'update','updated','breaking','announce','announces','launches','news','leak','leaks',
  'explained','opinion','question','reddit','help', 'psa'
];
const PRODUCT_TYPES_ES = [
  'smartphone','teléfono','móvil','tablet','portátil','laptop','monitor','televisor','tv',
  'barra de sonido','altavoz','auriculares','cascos','cámara','robot aspirador','aspirador',
  'airfryer','freidora de aire','router','ssd','disco','memoria','micro sd','tarjeta',
  'teclado','ratón','mouse','smartwatch','reloj','pulsera','proyector','impresora',
  'webcam','hub usb','cargador','powerbank','enchufe','bombilla','lampara','lámpara'
];

const BRANDS = [
  'Apple','Samsung','Xiaomi','Sony','LG','JBL','Bose','Anker','Garmin','Lenovo','Acer','ASUS',
  'MSI','HP','Dell','OnePlus','OPPO','Realme','Philips','TP-Link','Seagate','WD','Sandisk',
  'ADATA','Kingston','Razer','Logitech','TCL','Roborock','Dreame','iRobot','Roomba','Nothing'
];

// Quitar ruido frecuente de títulos
function cleanTitle(s=''){
  return s
    .replace(/\s*\[[^\]]*\]\s*/g,' ')
    .replace(/\s*\([^)]+\)\s*/g,' ')
    .replace(/\b(\d{2,}%|€|\$|usd)\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}

// ¿Parece producto?
function looksLikeProduct(s=''){
  const t = s.toLowerCase();
  const hasType  = PRODUCT_TYPES_ES.some(k => t.includes(k));
  const hasBrand = BRANDS.some(b => t.includes(b.toLowerCase()));
  const noNews   = !STOPWORDS_EN_NEWSY.some(k => t.includes(k));
  // patrón marca + modelo (letras y números) ayuda a cazar “Galaxy S24”, “JBL Xtreme 3”, etc.
  const modelish = /\b[a-z]{2,}\s?[a-z]?\d{2,}[a-z]?\b/i.test(s);
  return (hasType || (hasBrand && modelish)) && noNews;
}

// slug sencillo
function slugify(s=''){
  return s
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-')
    .replace(/(^-|-$)/g,'')
    .slice(0,80) || ('item-' + Math.random().toString(36).slice(2,8));
}

// ---------- Traducción a ES (si CF disponible) ----------
async function cfTranslate(text){
  if (!text) return text;
  if (!cfAccount || !cfToken) return text;
  try{
    const prompt = `Traduce al español de España, claro y natural, sin comillas:
"${text}"`;
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
      {
        method:'POST',
        headers:{ Authorization:`Bearer ${cfToken}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ messages:[{ role:'user', content: prompt }] })
      }
    );
    if (!res.ok) throw new Error(String(res.status));
    const js = await res.json();
    return (js?.result?.response || js?.result?.message || '').trim() || text;
  }catch(e){
    log('cfTranslate error', e.message);
    return text;
  }
}

// “Traducción” fallback: si es inglés, aplica cambios mínimos.
// (No perfecto, pero evita mayúsculas/ruido si no hay CF)
function fallbackEs(s=''){
  return s
    .replace(/\bbluetooth\b/gi,'Bluetooth')
    .replace(/\bsmartwatch\b/gi,'reloj inteligente')
    .replace(/\bwireless\b/gi,'inalámbrico')
    .trim();
}
async function toEs(s){ 
  const t = await cfTranslate(s);
  return (t===s ? fallbackEs(t) : t);
}

// ---------- Imagen Pexels coherente ----------
function guessTypeFromTitle(title){
  const t = title.toLowerCase();
  for (const key of PRODUCT_TYPES_ES){
    if (t.includes(key)) return key;
  }
  // fallback
  return 'tecnología';
}
function brandFromTitle(title){
  const hit = BRANDS.find(b => title.toLowerCase().includes(b.toLowerCase()));
  return hit || '';
}
async function fetchPexelsImage(title){
  if (!PEXELS_API_KEY) return '/placeholder.jpg';
  const tipo  = guessTypeFromTitle(title);
  const marca = brandFromTitle(title);
  const q = [marca, tipo].filter(Boolean).join(' ') || title;

  try{
    const url = new URL('https://api.pexels.com/v1/search');
    url.searchParams.set('query', q);
    url.searchParams.set('per_page','12');
    url.searchParams.set('orientation','landscape');
    url.searchParams.set('size','large');

    const res = await fetch(url, { headers:{ Authorization: PEXELS_API_KEY } });
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    const data = await res.json();

    // Preferir fotos sin personas (para producto).
    const ranked = (data.photos || []).sort((a,b)=>{
      const hasFaceA = (a.alt||'').match(/\b(person|people|woman|man|girl|boy)\b/i) ? 1 : 0;
      const hasFaceB = (b.alt||'').match(/\b(person|people|woman|man|girl|boy)\b/i) ? 1 : 0;
      return hasFaceA - hasFaceB; // primero “sin personas”
    });

    const photo = ranked[0];
    if (!photo) return '/placeholder.jpg';
    const best = photo.src?.landscape || photo.src?.large || photo.src?.medium || photo.src?.original;
    if (!best) return '/placeholder.jpg';
    return `${best}${best.includes('?')?'&':'?'}auto=compress&cs=tinysrgb&w=1200&h=675&fit=crop`;
  }catch(e){
    log('Pexels error', e.message);
    return '/placeholder.jpg';
  }
}

// ---------- Fuentes ----------
// Reddit RSS (modo público) + RSS tech ES. Más fácil de mantener en /data/niches.json
const parser = new Parser({
  headers:{ 'User-Agent': 'TeknovashopTrendsBot/1.1 (contact: trends@teknovashop.com)' }
});

async function fetchReddit(sub){
  const url = `https://www.reddit.com/r/${sub}/top/.rss?t=day`;
  try{
    const feed = await parser.parseURL(url);
    return (feed.items || []).map(i => i.title).slice(0, 50);
  }catch(e){
    log('Reddit error', sub, e.message);
    return [];
  }
}
async function fetchRSS(url){
  try{
    const feed = await parser.parseURL(url);
    return (feed.items || []).map(i => i.title).slice(0, 50);
  }catch(e){
    log('RSS error', url, e.message);
    return [];
  }
}

// ---------- Links para comparar ----------
function amazonEsSearch(q){
  if (!AMAZON_TAG_ES) return `https://www.amazon.es/s?k=${encodeURIComponent(q)}`;
  return `https://www.amazon.es/s?k=${encodeURIComponent(q)}&tag=${encodeURIComponent(AMAZON_TAG_ES)}`;
}
function sheinSearch(q){
  return `https://www.shein.com/pdsearch/${encodeURIComponent(q)}`;
}
function aliexpressSearch(q){
  return `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`;
}
function buildCompareLinks(q){
  return [
    { label:'Amazon (ES)', url: amazonEsSearch(q) },
    { label:'AliExpress',  url: aliexpressSearch(q) },
    { label:'SHEIN',       url: sheinSearch(q) }
  ];
}

// ---------- Colector principal ----------
async function collectCandidates(){
  const out = {};

  for (const [niche, cfg] of Object.entries(niches)){
    const bucket = [];

    for (const sub of (cfg.subreddits || [])){
      const t = await fetchReddit(sub);
      bucket.push(...t);
    }
    for (const feed of (cfg.rss || [])){
      const t = await fetchRSS(feed);
      bucket.push(...t);
    }

    // limpieza y filtro
    const cleaned = bucket.map(cleanTitle).filter(Boolean);
    const productish = cleaned.filter(looksLikeProduct);

    // dedupe (case-insensitive)
    const uniqMap = new Map();
    for (const t of productish){
      const k = t.toLowerCase();
      uniqMap.set(k, (uniqMap.get(k)||0)+1);
    }
    const sorted = [...uniqMap.entries()]
      .sort((a,b)=>b[1]-a[1])
      .map(([title,count])=>({ title, count }));

    out[niche] = sorted;
    log('Niche', niche, 'candidatos', sorted.length);
  }

  return out;
}

// ---------- Mini review sencilla (ES) ----------
function miniReview(titleEs){
  // No IA (determinista y rápido). Si quieres IA: puedes enchufar CF como antes.
  const base = `**Resumen:** ${titleEs} destaca por su relación calidad/precio y utilidad en el día a día.

**Pros**
- Diseño y materiales cuidados
- Buen rendimiento para su categoría
- Valor sólido frente a alternativas

**Contras**
- Puede no ser la mejor opción para usos muy exigentes
- El precio puede variar por tienda

**Recomendación:** compara precio y reseñas por tienda antes de comprar.`;
  return base;
}

// ---------- Main ----------
async function main(){
  log('Inicio', `${yyyy}-${mm}-${dd}`);

  const candidates = await collectCandidates();
  const items = [];

  for (const [niche, arr] of Object.entries(candidates)){
    for (const { title, count } of (arr || []).slice(0,8)){ // hasta 8 por nicho
      // A) español sólido
      const titleEs = await toEs(title);

      // B) imagen coherente
      const hero = await fetchPexelsImage(titleEs);

      // C) slug
      const slug = slugify(titleEs);

      // D) cuerpo
      const body = [
        '---',
        `title: "${titleEs.replace(/"/g,'\\"')}"`,
        `slug: "${slug}"`,
        `date: "${new Date().toISOString()}"`,
        `niche: "${niche}"`,
        `score: ${count}`,
        `hero: "${hero}"`,
        '---',
        '',
        miniReview(titleEs),
        '',
        '**Dónde comparar precios**',
        ...buildCompareLinks(titleEs).map(l => `- [${l.label}](${l.url})`)
      ].join('\n');

      fs.writeFileSync(path.join(outDirContent, `${slug}.md`), body, 'utf-8');

      items.push({ slug, title: titleEs, niche, score: count, hero });
      log('OK', niche, slug);
    }
  }

  // índice del día
  const indexPayload = { date: `${yyyy}-${mm}-${dd}`, items };
  fs.writeFileSync(path.join(outDirData, 'index.json'), JSON.stringify(indexPayload, null, 2), 'utf-8');

  log('Total items', items.length);
  if (items.length === 0){
    log('ATENCIÓN: 0 items. Revisa PEXELS_API_KEY / fuentes en data/niches.json');
  }
}

main().catch(e => { console.error('Fallo crítico:', e); process.exit(1); });
