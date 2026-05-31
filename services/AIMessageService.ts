import { AnalysisResult, BusinessPolicy, MessageCategory, Sentiment, ResponseCost, Message } from "../types";
import { getEmbeddings, cosineSimilarity } from './embeddingService';
import { decodeHtmlEntities } from './text';
import { logEvent } from './telemetry';
import { supabase } from './supabaseClient';


const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
const LLM_PROVIDER = process.env.LLM_PROVIDER || env.VITE_LLM_PROVIDER || env.LLM_PROVIDER || (process.env.NODE_ENV === 'test' ? 'groq' : '');

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
  const tags = Array.isArray(data.tags) ? data.tags.filter((t: any) => typeof t === 'string') : [data.category];
  return {
    category: data.category as MessageCategory,
    sentiment: Sentiment.Neutral,
    predictedCost: data.predictedCost as ResponseCost || ResponseCost.Low,
    tags,
  };
}

async function categorizeWithOllama(text: string): Promise<AnalysisResult | null> {
  try {
    const base = String(OLLAMA_BASE_URL).replace(/\/$/, '');
    const url = `${base}/api/chat`;
    const model = await getOllamaChatModel();
    const prompt = `Categorize the following customer message into one of these categories: Shipping, Returns, Product, Custom, Complaint, General, Other. Also assign tags — an array of categories or topics that apply. A message can have multiple tags if multiple topics are relevant (e.g. a complaint about late shipping gets tags ["Shipping", "Complaint"]).\n\nMessage: "${text}"\n\nRespond ONLY with a valid JSON object: {"category": "<category>", "reason": "<short reason>", "tags": ["tag1", "tag2", ...]}`;
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
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((t: any) => typeof t === 'string')
      : [category];
    return {
      category: category as MessageCategory,
      sentiment: Sentiment.Neutral,
      predictedCost: ResponseCost.Low,
      tags,
    };
  } catch (e) {
    console.warn('Ollama categorization failed:', e);
    return null;
  }
}

export const analyzeMessageContent = async (text: string): Promise<AnalysisResult> => {
  const start = Date.now();
  // Try Groq first if provider is groq
  if (LLM_PROVIDER === 'groq') {
    const groqResult = await categorizeWithGroq(text);
    if (groqResult) {
      logEvent('AI_CLASSIFICATION', 'success', { provider: 'groq' }, Date.now() - start);
      return groqResult;
    }
    logEvent('AI_PROVIDER_FALLBACK', 'fallback', { from: 'groq', to: 'ollama', operation: 'categorize' }, Date.now() - start);
  }
  // Fallback to Ollama
  const ollamaResult = await categorizeWithOllama(text);
  if (ollamaResult) {
    logEvent('AI_CLASSIFICATION', 'success', { provider: 'ollama' }, Date.now() - start);
    return ollamaResult;
  }
  // Fallback to General
  logEvent('AI_CLASSIFICATION', 'failed', { provider: 'none', reason: 'all_providers_failed' }, Date.now() - start);
  return {
    category: MessageCategory.General,
    sentiment: Sentiment.Neutral,
    predictedCost: ResponseCost.Low,
    tags: [],
  };
};


// Call Supabase Edge Function for Groq-powered draft generation
export const generateDraftWithGroq = async (
  messageText: string,
  senderName: string,
  policies: BusinessPolicy[],
  businessName: string,
  signature: string,
  aiPersonality: 'support' | 'rapper' | 'medieval'
): Promise<string | null> => {
  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/groq/generate-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messageText,
      senderName,
      policies,
      businessName,
      signature,
      aiPersonality,
      aiDraftInstructions: 'Always use {NAME} as a variable for the customer’s name, never the full name. Do not use the customer’s full name in the reply.'
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || typeof data.draft !== 'string') return null;
  return data.draft;
};


export const generateDraftWithOllama = async (
  messageText: string,
  senderName: string,
  policies: BusinessPolicy[],
  businessName: string,
  signature: string,
  aiPersonality: 'support' | 'rapper' | 'medieval'
): Promise<string | null> => {
  try {
    const base = String(OLLAMA_BASE_URL).replace(/\/$/, '');
    const url = `${base}/api/chat`;
    const model = await getOllamaChatModel();
    const policyContext = policies
      .map((p) => `${p.title}: ${p.content}`)
      .join('\n\n')
      .slice(0, 6000);

    const personalityPrompt = (() => {
      switch (aiPersonality) {
        case 'rapper':
          return `Reply as a rap, endearing and respectful. Use shorter lines, keep it concise, prioritize rhyming.`;
        case 'medieval':
          return `Reply as a courteous medieval attendant. Be polite and respectful, using light old‑fashioned phrasing without sounding archaic or hard to read.`;
        default:
          return `Reply as a helpful, professional customer support agent. Be concise, warm, and clear.`;
      }
    })();

    const payload = {
      model,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            `${personalityPrompt} Sign with: "${signature}". Output ONLY the reply text, no extra fields, no 'thinking', no JSON. When referring to the customer, ALWAYS use {NAME} as a variable for their name, NEVER the full name. Do not use the customer’s full name in the reply.`,
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
  signature: string,
  aiPersonality: 'support' | 'rapper' | 'medieval'
): Promise<string> => {
  const start = Date.now();
  let draft: string | null = null;
  if (LLM_PROVIDER === 'groq') {
    draft = await generateDraftWithGroq(messageText, senderName, policies, businessName, signature, aiPersonality);
    if (draft) {
      logEvent('AI_DRAFT_GENERATED', 'success', { provider: 'groq', personality: aiPersonality }, Date.now() - start);
      return draft;
    }
    logEvent('AI_PROVIDER_FALLBACK', 'fallback', { from: 'groq', to: 'ollama', operation: 'generate-draft' }, Date.now() - start);
  }
  draft = await generateDraftWithOllama(messageText, senderName, policies, businessName, signature, aiPersonality);
  if (draft) {
    logEvent('AI_DRAFT_GENERATED', 'success', { provider: 'ollama', personality: aiPersonality }, Date.now() - start);
    return draft;
  }
  // Template fallback
  logEvent('AI_DRAFT_GENERATED', 'fallback', { provider: 'template', reason: 'all_providers_failed' }, Date.now() - start);
  return (
    `Hi ${senderName || 'there'},\n\n` +
    `Thanks for reaching out to ${businessName || 'us'}. I'm looking into this now and will help get it resolved. ` +
    `Could you confirm your order number and any relevant details (e.g., tracking number or photos if applicable)?\n\n` +
    `Thanks!`
  );
};



async function checkSimilarityCache(targetId: string, candidateIds: string[]): Promise<{ cachedSimilar: string[]; uncached: string[] }> {
  const { data } = await supabase
    .from('similarities')
    .select('message_a_id, message_b_id, are_similar')
    .or(`message_a_id.eq.${targetId},message_b_id.eq.${targetId}`);

  const cache = new Map<string, boolean>();
  for (const row of data || []) {
    if (row.message_a_id === targetId) cache.set(row.message_b_id, row.are_similar);
    if (row.message_b_id === targetId) cache.set(row.message_a_id, row.are_similar);
  }

  const cachedSimilar: string[] = [];
  const uncached: string[] = [];
  for (const id of candidateIds) {
    if (cache.has(id)) {
      if (cache.get(id)) cachedSimilar.push(id);
    } else {
      uncached.push(id);
    }
  }
  return { cachedSimilar, uncached };
}

async function storeSimilarityCache(targetId: string, results: Array<{ candidateId: string; areSimilar: boolean }>) {
  const entries = results.map(r => {
    const [a, b] = [targetId, r.candidateId].sort();
    return { message_a_id: a, message_b_id: b, are_similar: r.areSimilar };
  });
  try {
    await supabase.from('similarities').upsert(entries, { onConflict: 'message_a_id,message_b_id' });
  } catch (e) {
    console.warn('Failed to cache similarity results:', e);
  }
}

export const findSimilarMessages = async (
  target: Message,
  candidates: Message[]
): Promise<string[]> => {
  const withoutTarget = candidates.filter((m) => m.id !== target.id);
  if (withoutTarget.length === 0) return [];

  const targetTags = (target.tags || []).filter((t) => t !== 'General');
  if (targetTags.length === 0) return [];

  const tagged = withoutTarget.filter(
    (m) => m.tags && m.tags.some((t) => t !== 'General' && targetTags.includes(t))
  );
  if (tagged.length === 0) return [];

  let potentialMatches = tagged.slice(0, 50);

  // Check similarity cache first
  const candidateIds = potentialMatches.map(m => m.id);
  const { cachedSimilar, uncached } = await checkSimilarityCache(target.id, candidateIds);
  if (uncached.length === 0) return cachedSimilar;

  // Filter to only uncached candidates for AI computation
  const uncachedMessages = potentialMatches.filter(m => uncached.includes(m.id));
  potentialMatches = uncachedMessages;

  const start = Date.now();
  let computedIds: string[] = [];
  try {
    if (LLM_PROVIDER === 'groq') {
      try {
        computedIds = await findSimilarWithGroq(target, potentialMatches);
        logEvent('FIND_SIMILAR', 'success', { provider: 'groq', matchCount: computedIds.length, cachedCount: cachedSimilar.length }, Date.now() - start);
      } catch (groqError) {
        logEvent('AI_PROVIDER_FALLBACK', 'fallback', { from: 'groq', to: 'ollama', operation: 'find-similar' }, Date.now() - start);
        throw groqError;
      }
    } else {
      computedIds = await findSimilarWithOllama(target, potentialMatches);
      logEvent('FIND_SIMILAR', 'success', { provider: 'ollama', matchCount: computedIds.length, cachedCount: cachedSimilar.length }, Date.now() - start);
    }
  } catch (e) {
    console.warn('Falling back to cosine similarity:', (e as any)?.message || e);
    logEvent('AI_PROVIDER_ERROR', 'failed', { operation: 'find-similar', fallback: 'cosine' }, Date.now() - start, (e as any)?.message);
    const allTexts = [target.body, ...potentialMatches.map(m => m.body)];
    const allEmbeddings = await getEmbeddings(allTexts);
    const targetEmbedding = allEmbeddings[0];
    computedIds = potentialMatches
      .map((m, i) => ({ id: m.id, sim: cosineSimilarity(targetEmbedding, allEmbeddings[i + 1]) }))
      .filter(r => r.sim > 0.15)
      .map(r => r.id);
  }
  
  const computedSet = new Set(computedIds);
  const cacheResults = potentialMatches.map(m => ({
    candidateId: m.id,
    areSimilar: computedSet.has(m.id),
  }));
  await storeSimilarityCache(target.id, cacheResults);

  return [...cachedSimilar, ...computedIds];
};