import rss from '@astrojs/rss';
import fs from 'fs';
import path from 'path';

export async function GET(context) {
  // ✅ Lee siempre desde el repo (no desde dist)
  const rootDir = process.cwd();
  const trendsRoot = path.join(rootDir, 'src', 'content', 'trends');

  // Si no existe aún (primer build), devuelve un feed vacío válido
  let files = [];
  try {
    // Recorre recursivamente buscando .md (excluye index.json)
    const walk = (dir) => {
      let out = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          out = out.concat(walk(full));
        } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.json') {
          out.push(full);
        }
      }
      return out;
    };
    if (fs.existsSync(trendsRoot)) {
      files = walk(trendsRoot);
    }
  } catch {
    files = [];
  }

  const posts = files
    .map((fp) => {
      const txt = fs.readFileSync(fp, 'utf-8');
      const get = (k) => new RegExp(`${k}:\\s*\"?([^\"\\n]+)`).exec(txt)?.[1] || '';
      return {
        slug: get('slug'),
        title: get('title'),
        date: get('date'),
      };
    })
    .filter((p) => p.slug && p.title && p.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30);

  return rss({
    title: 'Teknovashop Tendencias',
    description: 'Ranking diario con mini-reviews y links de compra',
    site: context.site,
    items: posts.map((p) => ({
      title: p.title,
      pubDate: new Date(p.date),
      link: `/producto/${p.slug}`,
    })),
  });
}
