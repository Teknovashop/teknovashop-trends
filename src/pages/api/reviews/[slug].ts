import type { APIRoute } from 'astro';
import { supabase } from '@/lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const slug = params.slug!;
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);

  const { data, error } = await supabase
    .from('reviews')
    .select('id,name,rating,comment,created_at,verified')
    .eq('slug', slug)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const ratings = (data || []).map(r => r.rating);
  const avg = ratings.length ? +(ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(2) : 0;

  return new Response(JSON.stringify({ avg, count: ratings.length, items: data || [] }), {
    headers: { 'Content-Type':'application/json' }
  });
};
