import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

// Si tienes la variable de entorno, úsala; si no, un fallback razonable:
const site = process.env.PUBLIC_SITE_URL || 'https://teknovashop-trends.vercel.app';

export default defineConfig({
  site,
  output: 'hybrid',    // Mantén 'hybrid' si usas /api; usa 'static' si no tienes endpoints
  adapter: vercel()
});
