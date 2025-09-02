// scripts/products_daily.mjs
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

// ---------- ENV ----------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || "";
const AMAZON_TAG_ES = process.env.AMAZON_TAG_ES || "teknovashop25-21";
const SHEIN_PID = process.env.SHEIN_PID || "5798341419";

// ---------- Helpers ----------
const today = new Date();
const yyyy = today.getUTCFullYear().toString();
const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
const dd = String(today.getUTCDate()).padStart(2, "0");
const outDir = `src/data/trends/${yyyy}/${mm}/${dd}`;
const outFile = `${outDir}/index.json`;

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function toSlug(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function amazonSearchUrl(query, tag) {
  const q = encodeURIComponent(query);
  return `https://www.amazon.es/s?k=${q}&language=es_ES&tag=${encodeURIComponent(tag)}`;
}
function aliexpressSearchUrl(query) {
  const q = encodeURIComponent(query);
  return `https://es.aliexpress.com/wholesale?SearchText=${q}`;
}
function sheinSearchUrl(query, pid) {
  // Búsqueda simple (si tienes deeplink de afiliación, cámbialo aquí)
  const q = encodeURIComponent(query);
  // PDSearch funciona bien para búsquedas genéricas
  return `https://es.shein.com/pdsearch/${q}/?src_identifier=fc%3DHome%60sc%3Dsearchbar%60tc%3D0&pid=${encodeURIComponent(pid)}`;
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  return await res.json();
}

// ---------- PEXELS ----------
async function pexelsImage(query) {
  if (!PEXELS_API_KEY) return null;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
    query
  )}&per_page=1&orientation=landscape`;
  const res = await fetch(url, {
    headers: { Authorization: PEXELS_API_KEY },
  });
  if (!res.ok) {
    console.warn("[pexels] no ok:", res.status);
    return null;
  }
  const data = await res.json();
  const photo = data?.photos?.[0];
  if (!photo) return null;
  // src.landscape suele ser 1200x627 aprox. Le añadimos parámetros de compresión suaves si existen
  return photo.src?.landscape || photo.src?.medium || photo.src?.original || null;
}

// ---------- IA ----------
async function openaiJSON(system, user) {
  if (!OPENAI_API_KEY) return null;
  const url = "https://api.openai.com/v1/chat/completions";
  const body = {
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn("[openai] not ok:", res.status);
    return null;
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function generateIdeasES() {
  // Si no hay IA, fallback
  if (!OPENAI_API_KEY) {
    return [
      { query: "auriculares bluetooth con cancelación de ruido", title: "Auriculares Bluetooth con cancelación de ruido", category: "tecnologia" },
      { query: "monitor 27 pulgadas 144 hz gaming", title: "Monitor 27\" 144 Hz para gaming", category: "tecnologia" },
      { query: "ssd nvme 1tb", title: "SSD NVMe 1 TB de alto rendimiento", category: "tecnologia" },
      { query: "robot aspirador con mapeo láser", title: "Robot aspirador con mapeo láser", category: "hogar" },
      { query: "tablet android 10 pulgadas", title: "Tablet Android de 10 pulgadas", category: "tecnologia" },
      { query: "camara seguridad wifi exterior", title: "Cámara de seguridad Wi-Fi para exterior", category: "hogar" }
    ];
  }

  const system =
    "Eres un experto en ecommerce en España. Devuelve ideas de compra populares en español, útiles y con intención de compra.";
  const user = `
Devuélveme entre 6 y 10 ideas de productos pensados para ESPAÑA, en español.
Formato estricto JSON:
{
 "items":[
   {"query":"texto búsqueda para tiendas","title":"título limpio y corto","category":"tecnologia|hogar|deporte|oficina|gaming|salud"}
 ]
}
Evita marcas concretas. Piensa en búsquedas genéricas con intención de compra.
`;

  const json = await openaiJSON(system, user);
  return json?.items || [];
}

async function generateReviewES(title) {
  // Fallback simple si no hay IA
  if (!OPENAI_API_KEY) {
    return {
      summary:
        "Tendencia del día: buena relación calidad/precio, conveniente para el uso diario. Recomendado comparar precios y opiniones antes de comprar.",
      pros: ["Buena relación calidad/precio", "Fácil de usar", "Útil a diario"],
      cons: ["Puede no encajar en todos los casos", "Stock variable"],
    };
  }

  const system =
    "Eres copywriter de ecommerce en España. Escribe en español, neutro, directo y útil para comprar.";
  const user = `
Producto: "${title}"
Devuelve JSON:
{
 "summary":"2-3 frases",
 "pros":["punto","punto","punto"],
 "cons":["punto","punto"]
}
No inventes especificaciones improbables. Manténlo general y honesto.
`;

  const json = await openaiJSON(system, user);
  if (!json) {
    return {
      summary:
        "Tendencia del día: buena relación calidad/precio, conveniente para el uso diario. Recomendado comparar precios y opiniones antes de comprar.",
      pros: ["Buena relación calidad/precio", "Fácil de usar", "Útil a diario"],
      cons: ["Puede no encajar en todos los casos", "Stock variable"],
    };
  }
  return json;
}

// ---------- Main ----------
async function main() {
  console.log("▶ Generando tendencias de productos (IA) para", `${yyyy}-${mm}-${dd}`);

  const ideas = await generateIdeasES();
  if (!Array.isArray(ideas) || ideas.length === 0) {
    console.error("No se generaron ideas.");
    process.exit(1);
  }

  const items = [];
  for (const idea of ideas) {
    const title = idea.title || idea.query || "Tendencia";
    const category = (idea.category || "tecnologia").toLowerCase();
    const slug = toSlug(title);
    const query = idea.query || title;

    // Imagen
    let hero = await pexelsImage(title);
    if (!hero) {
      hero = await pexelsImage(query);
    }
    // Si no hay imagen, usa un placeholder local si lo tienes en /public
    if (!hero) hero = "/placeholder.jpg";

    // Review (summary + pros/cons)
    const review = await generateReviewES(title);

    // Enlaces
    const links = {
      amazon: amazonSearchUrl(query, AMAZON_TAG_ES),
      aliexpress: aliexpressSearchUrl(query),
      shein: sheinSearchUrl(query, SHEIN_PID),
    };

    items.push({
      slug,
      title,
      niche: category,
      score: 1,
      hero,
      summary: review.summary,
      pros: review.pros,
      cons: review.cons,
      links,
    });
  }

  ensureDir(outDir);
  const payload = { date: `${yyyy}-${mm}-${dd}`, items };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf-8");
  console.log("✓ Guardado:", outFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
