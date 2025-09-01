import slugifyLib from 'slugify';
export function slugify(s){ return slugifyLib(s,{lower:true,strict:true}); }
export function affAmazonSearch(q, tag){ const u=new URL('https://www.amazon.es/s'); u.searchParams.set('k',q); u.searchParams.set('tag',tag||'teknovashop-21'); return u.toString(); }
export function affAliExpressSearch(q){ const u=new URL('https://www.aliexpress.com/wholesale'); u.searchParams.set('SearchText',q); return u.toString(); }
export function affSheinSearch(q){ const u=new URL('https://www.shein.com/pdsearch'); u.searchParams.set('q',q); return u.toString(); }
export function imagePrompt(title){ return `product collage, infographic style, flat lay, white background, trending item: ${title}`; }