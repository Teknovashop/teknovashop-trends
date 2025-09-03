// src/pages/api/debug-env.ts
export const prerender = false;
export const runtime = 'node';

export async function GET() {
  const val = process.env.OPENAI_API_KEY;
  const present = Boolean(val && val.trim());
  const len = val?.trim()?.length ?? 0;
  const masked = present ? `*** (len=${len})` : '(absent)';
  return new Response(
    JSON.stringify({
      OPENAI_API_KEY_present: present,
      OPENAI_API_KEY_masked: masked,
      runtime: 'node',
      note: 'Si present=false, el runtime no ve la variable en Vercel.',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
