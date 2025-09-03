// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://teknovashop-trends.vercel.app',
  output: 'hybrid',
  adapter: vercel({
    // Fuerza el runtime moderno compatible con Vercel
    runtime: 'nodejs22.x'
  })
});
