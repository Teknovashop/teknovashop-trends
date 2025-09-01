# Teknovashop Tendencias (0 € infra)
Web autónoma que publica un **ranking diario de productos** por nicho (tecnología, hogar, fitness, moda) a partir de **RSS de Reddit**. Mini‑reseñas con IA (Workers AI).

## Despliegue
1) Sube este repo a GitHub (público).
2) Cloudflare Pages → Create Project → conecta repo (Build: `npm run build`, Output: `dist`).
3) Secrets del repo (Settings → Secrets → Actions):
   - `AMAZON_TAG_ES` (p.ej., teknovashop-21)
   - `CF_ACCOUNT_ID` y `CF_API_TOKEN` (opcional para IA).

## Cron
- `.github/workflows/daily.yml` ejecuta `npm run trends:daily` a las 07:00 Madrid aprox.
- Genera ficheros MD en `src/content/trends/YYYY/MM/DD` y hace commit.

## Desarrollo
```
npm i
npm run trends:daily
npm run dev  # http://localhost:4321
```
