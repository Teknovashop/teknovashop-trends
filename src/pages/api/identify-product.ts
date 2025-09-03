// Minimal serverless endpoint (Vercel/Astro) para identificar producto a partir de imagen o URL.
// Requiere OPENAI_API_KEY en los secrets (ya lo tienes).

export const prerender = false;

export async function POST({ request }) {
  try {
    const { imageDataUrl, pageUrl, hint } = await request.json();

    if (!imageDataUrl && !pageUrl && !hint) {
      return new Response(JSON.stringify({ error: 'Falta imageDataUrl o pageUrl o hint' }), { status: 400 });
    }

    const sys = `Eres un asistente experto en retail. 
Devuelve un JSON compacto con: 
- "query": string breve para buscar el producto (marca + modelo + variante si aplica),
- "attrs": lista corta de atributos clave detectados (p.ej. 27", 144Hz, VA, USB-C, 1TB, etc),
- "confidence": número 0-1 sobre tu seguridad.
Si te pasan una URL, extrae el posible nombre real (marca+modelo).
No inventes datos.`;

    const userParts: any[] = [];
    if (hint) userParts.push({ type: "text", text: `Pista del usuario: ${hint}` });
    if (pageUrl) userParts.push({ type: "text", text: `URL de producto o referencia: ${pageUrl}` });
    if (imageDataUrl) {
      userParts.push({
        type: "input_image",
        image_url: { url: imageDataUrl }
      });
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userParts }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!res.ok) {
      const errTxt = await res.text();
      return new Response(JSON.stringify({ error: 'OpenAI error', detail: errTxt }), { status: 500 });
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "{}";
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { query: hint || "", attrs: [], confidence: 0.3 }; }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Unknown error' }), { status: 500 });
  }
}
