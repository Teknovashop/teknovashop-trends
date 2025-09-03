import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://teknovashop-trends.vercel.app',
  output: 'hybrid',
  adapter: vercel({
    runtime: 'nodejs20.x', // <- fuerza Node 20 para las Serverless Functions
  }),
});
