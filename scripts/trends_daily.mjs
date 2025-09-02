// scripts/trends_daily.mjs
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const TODAY = new Date().toISOString().split("T")[0];
const BASE_DIR = path.join("src", "data", "trends", TODAY.replace(/-/g, "/"));
const OUT_FILE = path.join(BASE_DIR, "index.json");

// Lee clave de Pexels desde variables de entorno
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

if (!PEXELS_API_KEY) {
  console.error("❌ Falta la clave PEXELS_API_KEY en secrets/env");
  process.exit(1);
}

// Función auxiliar: busca una imagen en Pexels
async function getImageFromPexels(query) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: PEXELS_API_KEY },
    });
    const data = await res.json();
    if (data.photos && data.photos.length > 0) {
      return data.photos[0].src.medium; // URL de imagen mediana
    }
  } catch (err) {
    console.error("Error buscando imagen en Pexels:", err);
  }
  // fallback: placeholder local
  return "/placeholder.jpg";
}

// Simulación de trending data (ejemplo, deberías sustituir por tu scraper o API real)
const mockTrends = [
  { slug: "auriculares-inalambricos-con-cancelacion-de-ruido", title: "Auriculares inalámbricos con cancelación de ruido", niche: "tecnología" },
  { slug: "monitor-27-pulgadas-144-hz-para-gaming", title: "Monitor 27 pulgadas 144 Hz para gaming", niche: "tecnología" },
  { slug: "disco-ssd-nvme-1-tb-alta-velocidad", title: "Disco SSD NVMe 1TB alta velocidad", niche: "tecnología" },
  { slug: "robot-aspirador-mapeo-laser", title: "Robot aspirador con mapeo láser", niche: "hogar" },
];

// Generar data enriquecida con imágenes
async function main() {
  console.log("📊 Generando tendencias para", TODAY);

  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
  }

  const items = [];
  for (const trend of mockTrends) {
    const hero = await getImageFromPexels(trend.title);

    items.push({
      slug: trend.slug,
      title: trend.title,
      niche: trend.niche,
      score: 1,
      hero,
    });
  }

  const output = { date: TODAY, items };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), "utf-8");
  console.log("✅ Archivo generado en", OUT_FILE);
}

main();
