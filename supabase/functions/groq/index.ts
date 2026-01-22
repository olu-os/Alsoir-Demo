const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
// Supabase Edge Function for Groq-powered features
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-120b";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

async function callGroq(messages, max_tokens = 1024, temperature = 0) {
  const payload = {
    model: GROQ_MODEL,
    messages,
    max_tokens,
    temperature,
  };
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Groq API error");
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

serve(async (req) => {
  const { pathname } = new URL(req.url);
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }
  try {
    if (pathname.endsWith("/find-similar")) {
      const { target, candidates } = await req.json();
      const limited = (candidates || []).slice(0, 25).map((m) => ({ id: m.id, body: (m.body || '').slice(0, 200) }));
      const prompt = [
        'You are an expert customer support AI. Compare the target message to each candidate and decide if they are about the SAME issue.',
        'Output ONLY valid JSON. At the end, add "ai_used": "Groq".',
        'Return ONLY JSON in the shape {"similarIds": ["..."], "ai_used": "Groq"}.',
        'Only include IDs for messages asking about the SAME issue and can receive the SAME reply.',
        'If none match, return {"similarIds": [], "ai_used": "Groq"}.',
        '',
        `Target message:\n${(target.body || '').slice(0, 400)}`,
        `Candidates (JSON array of {id, body}):\n${JSON.stringify(limited)}`
      ].join('\n');
      const messages = [
        { role: 'system', content: 'You are an expert customer support AI.' },
        { role: 'user', content: prompt },
      ];
      const text = await callGroq(messages);
      let parsed;
      try { parsed = JSON.parse(text); } catch { const match = text.match(/\{[\s\S]*\}/); parsed = match ? JSON.parse(match[0]) : { similarIds: [] }; }
      return new Response(JSON.stringify({ similarIds: parsed.similarIds || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (pathname.endsWith("/categorize")) {
      const { text } = await req.json();
      const prompt = [
        'You are a customer support AI that classifies messages.',
        'Categorize the following customer message into one of these categories: Shipping, Returns, Product, Custom, Complaint, General, Other.',
        'For the field predicted_cost, think: What happens if I don\'t respond to this soon? Is there a risk of a bad review, lost customer, or serious negative consequence if this is not handled promptly? If the message doesn\'t display dissatisfaction, it will be low predicted cost.',
        'Respond ONLY with a valid JSON object: {"category": "<category>", "predicted_cost": "Low|Medium|High", "reason": "<short reason>"}',
        '',
        `Message: "${text}"`
      ].join('\n');
      const messages = [
        { role: 'system', content: 'You are a customer support AI that classifies messages.' },
        { role: 'user', content: prompt },
      ];
      const content = await callGroq(messages, 512);
      let parsed;
      try { parsed = JSON.parse(content); } catch { const match = content.match(/\{[\s\S]*\}/); parsed = match ? JSON.parse(match[0]) : {}; }
      return new Response(JSON.stringify({
        category: parsed.category || 'General',
        predictedCost: parsed.predicted_cost || 'Low',
        reason: parsed.reason || ''
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (pathname.endsWith("/generate-draft")) {
      const { messageText, senderName, policies, businessName, signature } = await req.json();
      const policyContext = (policies || []).map((p) => `${p.title}: ${p.content}`).join('\n\n').slice(0, 6000);
      const prompt = [
        `Reply as a rap, endearing and respectful. Use shorter lines, keep it concise, prioritize rhyming. Sign with: "${signature}". If signature is undefined, end it normally. Output ONLY the reply text, no extra fields, no 'thinking', no JSON.`,
        `Customer name: ${senderName}`,
        `Message: ${messageText}`,
        `Business policies (reference as needed):\n${policyContext}`,
        `Write the reply.`
      ].join('\n\n');
      const messages = [
        { role: 'system', content: 'You are a customer support AI that writes replies.' },
        { role: 'user', content: prompt },
      ];
      const content = await callGroq(messages, 512, 0.3);
      return new Response(JSON.stringify({ draft: content.trim() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response("Not Found", { status: 404, headers: corsHeaders });
  } catch (e) {
    return new Response(`Error: ${e.message || e}`, { status: 500, headers: corsHeaders });
  }
});