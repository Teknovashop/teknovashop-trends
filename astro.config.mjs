// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';
import path from 'node:path';

// Nota:
// - output: 'hybrid' para poder desplegar rutas /api en Vercel (serverless).
// - alias "@": apunta a ./src para que import "@/..." funcione en todos los .astro/.ts.
// - No hace falta tocar nada más: tu Base.astro y el resto seguirán tal cual.

export default defineConfig({
  output: 'hybrid',
  adapter: vercel(),
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(new URL('./src', import.meta.url).pathname),
      },
    },
  },
});
