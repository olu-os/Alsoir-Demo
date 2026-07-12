import { rateLimitOrResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
// Supabase Edge Function for Groq-powered features
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

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
  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(JSON.stringify({
    event: 'groq_request',
    requestId,
    model: GROQ_MODEL,
  }));
  const start = Date.now();
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const latency = Date.now() - start;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.log(JSON.stringify({
      event: 'groq_response',
      requestId,
      status: res.status,
      latency,
      error: body.slice(0, 500),
    }));
    throw new Error("Groq API error");
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  console.log(JSON.stringify({
    event: 'groq_response',
    requestId,
    status: res.status,
    latency
  }));
  return content;
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
      const { target, candidates, userId } = await req.json();
      if (userId) {
        const limited = await rateLimitOrResponse("groq:find-similar", userId, RATE_LIMIT, RATE_WINDOW_MS);
        if (limited) return limited;
      }
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
      const { text, userId } = await req.json();
      if (userId) {
        const limited = await rateLimitOrResponse("groq:categorize", userId, RATE_LIMIT, RATE_WINDOW_MS);
        if (limited) return limited;
      }
      const prompt = [
        'You are a customer support AI that classifies messages.',
        'Categorize the following customer message into one of these categories: Shipping, Returns, Product, Custom, Complaint, General, Other.',
        'Also assign tags — an array of categories or topics that apply to this message. A message CAN have multiple tags if multiple topics are relevant (e.g. a complaint about a late shipment could have tags ["Shipping", "Complaint"]; a question about returns after 2 years could have tags ["Returns", "General"]; a wrong-item complaint could have tags ["Product", "Complaint", "Returns"]). The primary category is the single best fit; tags can be broader.',
        'For the field predicted_cost, think: What happens if I don\'t respond to this soon? Is there a risk of a bad review, lost customer, or serious negative consequence if this is not handled promptly? If the message doesn\'t display dissatisfaction, it will be low predicted cost.',
        'Respond ONLY with a valid JSON object: {"category": "<category>", "predicted_cost": "Low|Medium|High", "reason": "<short reason>", "tags": ["tag1", "tag2", ...]}',
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
      const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t: any) => typeof t === 'string') : [parsed.category || 'General'];
      return new Response(JSON.stringify({
        category: parsed.category || 'General',
        predictedCost: parsed.predicted_cost || 'Low',
        reason: parsed.reason || '',
        tags
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (pathname.endsWith("/generate-draft")) {
      const { messageText, senderName, policies, businessName, signature, aiPersonality, userId } = await req.json();
      if (userId) {
        const limited = await rateLimitOrResponse("groq:generate-draft", userId, RATE_LIMIT, RATE_WINDOW_MS);
        if (limited) return limited;
      }
      const policyContext = (policies || []).map((p) => `${p.title}: ${p.content}`).join('\n\n').slice(0, 6000);
      const personalityPrompt = (() => {
        switch (aiPersonality) {
          case 'rapper':
            return `Reply as a rap, endearing and respectful. Use shorter lines, keep it concise, prioritize rhyming.`;
          case 'medieval':
            return `Reply as a courteous medieval attendant. Be polite and respectful, using light old-fashioned phrasing without sounding archaic or hard to read.`;
          default:
            return `Reply as a helpful, professional customer support agent. Be concise, warm, and clear.`;
        }
      })();
      const prompt = [
        `${personalityPrompt} Sign with: "${signature}". If signature is undefined, end it normally. Output ONLY the reply text, no extra fields, no 'thinking', no JSON. When referring to the customer, ALWAYS use {NAME} as a variable for their name, NEVER the full name. Do not use the customer’s full name in the reply.`,
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
    if (pathname.endsWith("/analyze-incident")) {
      const { prompt, system_prompt, userId } = await req.json();
      if (userId) {
        const limited = await rateLimitOrResponse("groq:analyze-incident", userId, RATE_LIMIT, RATE_WINDOW_MS);
        if (limited) return limited;
      }
      const messages = [
        { role: 'system', content: system_prompt || 'You are an expert SRE incident analyst. Return only JSON.' },
        { role: 'user', content: prompt },
      ];
      const content = await callGroq(messages, 512, 0);
      let parsed;
      try { parsed = JSON.parse(content); } catch { const match = content.match(/\{[\s\S]*\}/); parsed = match ? JSON.parse(match[0]) : {}; }
      return new Response(JSON.stringify({
        incident: parsed.incident || 'Unclassified incident',
        rootCause: parsed.rootCause || 'Unknown',
        severity: parsed.severity || 'medium',
        fix: parsed.fix || 'Investigate logs',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response("Not Found", { status: 404, headers: corsHeaders });
  } catch (e) {
    return new Response(`Error: ${e.message || e}`, { status: 500, headers: corsHeaders });
  }
});