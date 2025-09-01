import rss from '@astrojs/rss';
import fs from 'fs';

export async function GET(context) {
  const root = new URL('../content/trends/', import.meta.url);

  function walk(dir) {
    const p = new URL('.', dir);
    const entries = fs.readdirSync(p);
    let files = [];
    for (const e of entries) {
      const full = new URL(e + '/', p);
      if (fs.statSync(full).isDirectory()) {
        files = files.concat(walk(full));
      } else if (e.endsWith('.md') && e !== 'index.json') {
        files.push(new URL(e, p));
      }
    }
    return files;
  }

  const files = walk(root);
  const posts = files
    .map((u) => {
      const txt = fs.readFileSync(u, 'utf-8');
      const get = (k) => new RegExp(`${k}:\\s*\"?([^\"\\n]+)`).exec(txt)?.[1] || '';
      return {
        slug: get('slug'),
        title: get('title'),
        date: get('date'),
      };
    })
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
