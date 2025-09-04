import type { APIRoute } from 'astro';
import { supabase } from '@/lib/supabase';

export const prerender = false;

function bad(s?:string){ return !s || s.trim().length===0; }

export const POST: APIRoute = async ({ request }) => {
  try {
    const { slug, name, rating, comment, hp } = await request.json();

    if (hp) return new Response(JSON.stringify({ ok:true }), { status: 200 }); // honeypot

    if (bad(slug) || bad(name) || bad(comment)) {
      return new Response(JSON.stringify({ error:'Datos incompletos' }), { status: 400 });
    }
    const r = parseInt(rating, 10);
    if (Number.isNaN(r) || r < 1 || r > 5) {
      return new Response(JSON.stringify({ error:'Rating inválido' }), { status: 400 });
    }

    const { error } = await supabase.from('reviews').insert({
      slug, name: String(name).slice(0,40), rating: r, comment: String(comment).slice(0,1200)
    });

    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ ok:true }), { status: 200 });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e.message || 'Error' }), { status: 500 });
  }
};
