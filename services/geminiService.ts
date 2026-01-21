
import { AnalysisResult, BusinessPolicy, MessageCategory, Sentiment, ResponseCost, Message } from "../types";
import { getEmbeddings, cosineSimilarity } from './embeddingService';
import { decodeHtmlEntities } from './text';


const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
const LLM_PROVIDER = env.VITE_LLM_PROVIDER || env.LLM_PROVIDER || '';
const GROQ_MODEL = env.VITE_GROQ_MODEL || 'openai/gpt-oss-120b';

const OLLAMA_BASE_URL = ((import.meta as any).env?.VITE_OLLAMA_BASE_URL as string | undefined) || 'http://localhost:11434';
const OLLAMA_CHAT_MODEL = ((import.meta as any).env?.VITE_OLLAMA_CHAT_MODEL as string | undefined) || 'gpt-oss:120b-cloud';

let cachedOllamaModel: string | null = null;
const getOllamaChatModel = async (): Promise<string> => {
  if (cachedOllamaModel) return cachedOllamaModel;
  const base = String(OLLAMA_BASE_URL).replace(/\/$/, '');

  if (((import.meta as any).env?.VITE_OLLAMA_CHAT_MODEL as string | undefined)) {
    cachedOllamaModel = OLLAMA_CHAT_MODEL;
    return cachedOllamaModel;
  }

  try {
    const res = await fetch(`${base}/api/tags`);
    if (!res.ok) throw new Error(`tags status ${res.status}`);
    const json: any = await res.json();
    const names: string[] = Array.isArray(json?.models) ? json.models.map((m: any) => m?.name).filter((n: any) => typeof n === 'string') : [];
    if (names.includes(OLLAMA_CHAT_MODEL)) {
      cachedOllamaModel = OLLAMA_CHAT_MODEL;
      return cachedOllamaModel;
    }
    if (names.length > 0) {
      cachedOllamaModel = names[0];
      return cachedOllamaModel;
    }
  } catch (e) {
    console.warn('Could not read Ollama /api/tags; falling back to default model name.', e);
  }

  cachedOllamaModel = OLLAMA_CHAT_MODEL;
  return cachedOllamaModel;
};

// Call Supabase Edge Function for Groq-powered similarity
const SUPABASE_FUNCTIONS_URL = env.VITE_SUPABASE_FUNCTIONS_URL || '';
const findSimilarWithGroq = async (target: Message, candidates: Message[]): Promise<string[]> => {
  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/groq/find-similar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, candidates }),
  });
  if (!response.ok) throw new Error('Groq backend API error');
  const data = await response.json();
  if (!Array.isArray(data.similarIds)) throw new Error('Groq backend API invalid response');
  return data.similarIds;
};

const findSimilarWithOllama = async (target: Message, candidates: Message[]): Promise<string[]> => {
  const url = `${String(OLLAMA_BASE_URL).replace(/\/$/, '')}/api/chat`;
  const model = await getOllamaChatModel();
  const limited = candidates.slice(0, 25).map((m) => ({ id: m.id, body: (m.body || '').slice(0, 200) }));
  const payload = {
    model,
    stream: false,
    messages: [
      {
        role: 'system',
        temperature: 0,
        content:
          'You compare customer support messages and decide if they are about the SAME issue. Output ONLY valid JSON. "reason": "<short reason>". At the end, add "ai_used": "Ollama".'
      },
      {
        role: 'user',
        content:
          `Target message:\n${(target.body || '').slice(0, 400)}\n\n` +
          `Candidates (JSON array of {id, body}):\n${JSON.stringify(limited)}\n\n` +
          `Return ONLY JSON in the shape {"similarIds": ["..."], "ai_used": "Ollama"}.\n` +
          `Only include IDs for messages asking about the SAME issue and can receive the SAME reply.\n` +
          `If none match, return {"similarIds": [], "ai_used": "Ollama"}.`
      }
    ]
  };
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new Error('Ollama fetch failed');
  }
  if (!res.ok) throw new Error('Ollama response not ok');
  const json: any = await res.json();
  const text: string | undefined = json?.message?.content;
  if (!text) throw new Error('Ollama response missing content');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { throw new Error('Ollama response invalid JSON'); }
    } else {
      throw new Error('Ollama response invalid JSON');
    }
  }
  if (parsed?.ai_used) {
    // eslint-disable-next-line no-console
    console.log('[AI] ai_used:', parsed.ai_used);
  }
  const ids = Array.isArray(parsed?.similarIds) ? parsed.similarIds.filter((x: any) => typeof x === 'string') : [];
  return ids;
};

const ALLOWED_CATEGORIES = [
  'Shipping',
  'Returns',
  'Product',
  'Custom',
  'Complaint',
  'General',
  'Other',
];

// Call Supabase Edge Function for Groq-powered categorization
async function categorizeWithGroq(text: string): Promise<AnalysisResult | null> {
  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/groq/categorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || typeof data.category !== 'string') return null;
  return {
    category: data.category as MessageCategory,
    sentiment: Sentiment.Neutral,
    predictedCost: data.predictedCost as ResponseCost || ResponseCost.Low,
    tags: [data.category],
  };
}

async function categorizeWithOllama(text: string): Promise<AnalysisResult | null> {
  try {
    const base = String(OLLAMA_BASE_URL).replace(/\/$/, '');
    const url = `${base}/api/chat`;
    const model = await getOllamaChatModel();
    const prompt = `Categorize the following customer message into one of these categories: Shipping, Returns, Product, Custom, Complaint, General, Other.\n\nMessage: "${text}"\n\nRespond ONLY with a valid JSON object: {"category": "<category>", "reason": "<short reason>"}`;
    const payload = {
      model,
      stream: false,
      messages: [
        { role: 'system', content: 'You are a customer support AI that classifies messages.' },
        { role: 'user', content: prompt },
      ],
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const content: string | undefined = json?.message?.content;
    if (!content) return null;
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Try to extract JSON from text if model added extra text
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { return null; }
      } else {
        return null;
      }
    }
    const category = typeof parsed.category === 'string' && ALLOWED_CATEGORIES.includes(parsed.category) ? parsed.category : 'General';
    return {
      category: category as MessageCategory,
      sentiment: Sentiment.Neutral,
      predictedCost: ResponseCost.Low,
      tags: [category],
    };
  } catch (e) {
    console.warn('Ollama categorization failed:', e);
    return null;
  }
}

export const analyzeMessageContent = async (text: string): Promise<AnalysisResult> => {
  // Try Groq first if provider is groq
  if (LLM_PROVIDER === 'groq') {
    const groqResult = await categorizeWithGroq(text);
    if (groqResult) return groqResult;
  }
  // Fallback to Ollama
  const ollamaResult = await categorizeWithOllama(text);
  if (ollamaResult) return ollamaResult;
  // Fallback to General
  return {
    category: MessageCategory.General,
    sentiment: Sentiment.Neutral,
    predictedCost: ResponseCost.Low,
    tags: [],
  };
};


// Call Supabase Edge Function for Groq-powered draft generation
const generateDraftWithGroq = async (
  messageText: string,
  senderName: string,
  policies: BusinessPolicy[],
  businessName: string,
  signature: string
): Promise<string | null> => {
  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/groq/generate-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageText, senderName, policies, businessName, signature }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || typeof data.draft !== 'string') return null;
  return data.draft;
};


const generateDraftWithOllama = async (
  messageText: string,
  senderName: string,
  policies: BusinessPolicy[],
  businessName: string,
  signature: string
): Promise<string | null> => {
  try {
    const base = String(OLLAMA_BASE_URL).replace(/\/$/, '');
    const url = `${base}/api/chat`;
    const model = await getOllamaChatModel();
    const policyContext = policies
      .map((p) => `${p.title}: ${p.content}`)
      .join('\n\n')
      .slice(0, 6000);

    const payload = {
      model,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            `Reply as a rap, endearing and respectful. Use shorter lines, keep it concise, prioritize rhyming. Sign with: "${signature}". Output ONLY the reply text, no extra fields, no 'thinking', no JSON.`,
        },
        {
          role: 'user',
          content:
            `Customer name: ${senderName}\n` +
            `Message: ${decodeHtmlEntities(messageText || '').slice(0, 1500)}\n\n` +
            `Business policies (reference as needed):\n${policyContext}\n\n` +
            `Write the reply.`,
        },
      ],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const content: string | undefined = json?.message?.content;
    if (!content) return null;
    return content.trim();
  } catch (e) {
    console.warn('Ollama draft failed:', e);
    return null;
  }
};

export const generateDraftReply = async (
  messageText: string,
  senderName: string,
  policies: BusinessPolicy[],
  businessName: string,
  signature: string
): Promise<string> => {
  let draft: string | null = null;
  if (LLM_PROVIDER === 'groq') {
    draft = await generateDraftWithGroq(messageText, senderName, policies, businessName, signature);
  }
  if (!draft) {
    draft = await generateDraftWithOllama(messageText, senderName, policies, businessName, signature);
  }
  if (!draft) {
    // Fallback: simple, professional template (deterministic)
    draft = (
      `Hi ${senderName || 'there'},\n\n` +
      `Thanks for reaching out to ${businessName || 'us'}. I’m looking into this now and will help get it resolved. ` +
      `Could you confirm your order number and any relevant details (e.g., tracking number or photos if applicable)?\n\n` +
      `Thanks!`
    );
  }
  return draft;
};



export const findSimilarMessages = async (
  target: Message,
  candidates: Message[]
): Promise<string[]> => {
  // Remove the target from candidates
  const withoutTarget = candidates.filter((m) => m.id !== target.id);
  if (withoutTarget.length === 0) return [];

  let potentialMatches = withoutTarget;
  const shouldPreferCategory =
    !!target.category && target.category !== MessageCategory.General;

  if (shouldPreferCategory) {
    const sameCategory = withoutTarget.filter((m) => m.category === target.category);
    const otherCategory = withoutTarget.filter((m) => m.category !== target.category);
    potentialMatches = [...sameCategory, ...otherCategory];
  }

  // Hard cap to keep prompts fast.
  potentialMatches = potentialMatches.slice(0, 50);

  // Debug logging for provider selection
  // eslint-disable-next-line no-console
  console.log('[AI DEBUG] LLM_PROVIDER:', LLM_PROVIDER);

  // Try AI similarity (Groq or Ollama) as the primary method
  try {
    if (LLM_PROVIDER === 'groq') {
      // eslint-disable-next-line no-console
      console.log('[AI DEBUG] Using Groq as provider');
      try {
        return await findSimilarWithGroq(target, potentialMatches);
      } catch (groqError) {
        // eslint-disable-next-line no-console
        console.error('[Groq ERROR] Failed to get response from Groq:', groqError && (groqError.stack || groqError.message || groqError));
        throw groqError;
      }
    }
    // eslint-disable-next-line no-console
    console.log('[AI DEBUG] Using Ollama as provider');
    return await findSimilarWithOllama(target, potentialMatches);
  } catch (e) {
    // Fallback: use cosine similarity
    // eslint-disable-next-line no-console
    console.warn('Falling back to cosine similarity:', e?.message || e);
    const [targetEmbedding] = await getEmbeddings([target.body]);
    const results = await Promise.all(
      potentialMatches.map(async (m) => {
        const [emb] = await getEmbeddings([m.body]);
        return { id: m.id, sim: cosineSimilarity(targetEmbedding, emb) };
      })
    );
    // Return IDs with similarity above 0.15
    return results.filter(r => r.sim > 0.15).map(r => r.id);
  }
};