// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  // Necesario porque tienes páginas estáticas + endpoints (/api/compare)
  output: 'hybrid',
  adapter: vercel({
    // 👉 Fuerza runtime soportado por Vercel
    runtime: 'nodejs20.x',
  }),
  // Importante para @astrojs/rss y meta tags
  site: process.env.PUBLIC_SITE_URL || 'https://teknovashop-trends.vercel.app',
});
