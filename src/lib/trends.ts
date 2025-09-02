// src/lib/trends.ts
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'src', 'data', 'trends');

const pad = (n: number | string) => String(n).padStart(2, '0');

type TrendItem = {
  slug: string;
  title: string;
  niche: string;
  score?: number;
  hero?: string;
};

export type IndexPayload = {
  date: string;         // YYYY-MM-DD
  items: TrendItem[];
};

function readJsonFile(p: string) {
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Lee el index.json de una fecha concreta. */
export function readIndex(yyyy: string, mm: string, dd: string): IndexPayload | null {
  const file = path.join(DATA_DIR, yyyy, mm, dd, 'index.json');
  return readJsonFile(file);
}

/** Devuelve {yyyy,mm,dd} del último índice disponible y su payload. */
export function findLatestIndex():
  | { y: string; m: string; d: string; data: IndexPayload }
  | null {
  if (!fs.existsSync(DATA_DIR)) return null;
  const years = fs.readdirSync(DATA_DIR).filter(f => /^\d{4}$/.test(f)).sort().reverse();
  for (const y of years) {
    const yDir = path.join(DATA_DIR, y);
    const months = fs.readdirSync(yDir).filter(f => /^\d{2}$/.test(f)).sort().reverse();
    for (const m of months) {
      const mDir = path.join(yDir, m);
      const days = fs.readdirSync(mDir).filter(f => /^\d{2}$/.test(f)).sort().reverse();
      for (const d of days) {
        const data = readIndex(y, m, d);
        if (data && Array.isArray(data.items)) {
          return { y, m, d, data };
        }
      }
    }
  }
  return null;
}

/** Devuelve el índice del día actual o fallback al último disponible. */
export function getTodayOrLatest(): { dateLabel: string; data: IndexPayload } | null {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());

  const today = readIndex(y, m, d);
  if (today && Array.isArray(today.items)) {
    return { dateLabel: `${y}-${m}-${d}`, data: today };
  }
  const latest = findLatestIndex();
  if (!latest) return null;
  return {
    dateLabel: `${latest.y}-${latest.m}-${latest.d}`,
    data: latest.data,
  };
}

/** Recorre todos los index.json y devuelve un array plano con la fecha. */
export function gatherAllItems(): Array<TrendItem & { date: string }> {
  const out: Array<TrendItem & { date: string }> = [];
  if (!fs.existsSync(DATA_DIR)) return out;

  const years = fs.readdirSync(DATA_DIR).filter(f => /^\d{4}$/.test(f)).sort();
  for (const y of years) {
    const yDir = path.join(DATA_DIR, y);
    const months = fs.readdirSync(yDir).filter(f => /^\d{2}$/.test(f)).sort();
    for (const m of months) {
      const mDir = path.join(yDir, m);
      const days = fs.readdirSync(mDir).filter(f => /^\d{2}$/.test(f)).sort();
      for (const d of days) {
        const idx = readIndex(y, m, d);
        if (idx?.items?.length) {
          const date = `${y}-${m}-${d}`;
          for (const it of idx.items) out.push({ ...it, date });
        }
      }
    }
  }
  // orden descendente por fecha
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

/** Busca un item por slug recorriendo todos los index.json. */
export function getItemBySlug(slug: string): (TrendItem & { date: string }) | null {
  const all = gatherAllItems();
  return all.find(i => i.slug === slug) ?? null;
}
