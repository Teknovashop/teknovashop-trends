// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';
import path from 'node:path';

// Usa PUBLIC_SITE_URL si la defines en Vercel; si no, cae al dominio por defecto.
const SITE =
  process.env.PUBLIC_SITE_URL?.trim() ||
  'https://teknovashop-trends.vercel.app';

export default defineConfig({
  site: SITE,            // <- requerido por @astrojs/rss
  output: 'hybrid',      // para /api en Vercel
  adapter: vercel(),
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(new URL('./src', import.meta.url).pathname),
      },
    },
  },
});
