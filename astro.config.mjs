import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/edge';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://teknovashop-trends.vercel.app',
  output: 'hybrid',
  adapter: vercel()
});
