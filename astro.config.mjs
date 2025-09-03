import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

// URL pública para cosas como RSS (si tienes la variable, se usará)
const site = process.env.PUBLIC_SITE_URL || 'https://teknovashop-trends.vercel.app';

export default defineConfig({
  site,
  output: 'hybrid',       // puedes dejar "static" si no usas /api; con 'hybrid' mantienes /api/compare
  adapter: vercel()
});
