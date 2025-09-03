// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  // Tienes páginas estáticas y también endpoints (/api/*) → híbrido
  output: 'hybrid',

  // URL pública para @astrojs/rss y metas OG
  site: process.env.PUBLIC_SITE_URL || 'https://teknovashop-trends.vercel.app',

  // Adapter Vercel Serverless con runtime soportado
  adapter: vercel({
    runtime: 'nodejs20.x',
  }),
});
