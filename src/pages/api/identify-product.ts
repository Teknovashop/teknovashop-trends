// src/pages/api/identify-product.ts
// Endpoint serverless (Vercel/Astro) para identificar producto con imagen/URL.
// Requiere OPENAI_API_KEY en Vercel (Project → Settings → Environment Variables).

export const prerender = false;
export const runtime = 'node';

type BodyIn = {
  imageDataUrl?: string;
  pageUrl?: string;
  hint?: string;
};

export async function POST({ request }: { request: Request }) {
  try {
    const { imageDataUrl, pageUrl, hint } = (await request.json()) as BodyIn;

    if (!imageDataUrl && !pageUrl && !hint) {
      return json({ error: 'Falta imageDataUrl o pageUrl o hint' }, 400);
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
    if (!OPENAI_API_KEY) {
      return json(
        {
          error:
            'Falta OPENAI_API_KEY en el entorno del servidor. Añádela en Vercel → Project → Settings → Environment Variables (Production y Preview) y redeploy con Clear Cache.',
        },
        500
      );
    }

    const sys = `Eres un asistente experto en retail. 
Devuelve un JSON compacto con: 
- "query": string breve (marca + modelo + variante),
- "attrs": lista corta de atributos (p.ej. 27", 144Hz, VA, USB-C, 1TB...),
- "confidence": número 0-1.
Si te pasan una URL, extrae el posible nombre real.
No inventes datos.`;

    const userParts: any[] = [];
    if (hint) userParts.push({ type: 'text', text: `Pista del usuario: ${hint}` });
    if (pageUrl) userParts.push({ type: 'text', text: `URL: ${pageUrl}` });
    if (imageDataUrl) userParts.push({ type: 'input_image', image_url: { url: imageDataUrl } });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userParts },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errTxt = await res.text();
      return json({ error: 'OpenAI error', detail: safeTruncate(errTxt, 2000) }, 500);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '{}';

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { query: hint || '', attrs: [], confidence: 0.3 };
    }

    return json(parsed, 200);
  } catch (e: any) {
    return json({ error: e?.message || 'Unknown error' }, 500);
  }
}

// Helpers
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function safeTruncate(s: string, n: number) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n) + '…' : s;
}
