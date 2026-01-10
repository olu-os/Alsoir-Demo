import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalysisResult, BusinessPolicy, MessageCategory, Sentiment, ResponseCost, Message } from "../types";
import { getEmbeddings, cosineSimilarity } from './embeddingService';

const OLLAMA_BASE_URL = ((import.meta as any).env?.VITE_OLLAMA_BASE_URL as string | undefined) || 'http://localhost:11434';
const OLLAMA_CHAT_MODEL = ((import.meta as any).env?.VITE_OLLAMA_CHAT_MODEL as string | undefined) || 'qwen2.5:7b-instruct';

let cachedOllamaModel: string | null = null;
const getOllamaChatModel = async (): Promise<string> => {
  if (cachedOllamaModel) return cachedOllamaModel;
  const base = String(OLLAMA_BASE_URL).replace(/\/$/, '');

  // If the env override is set, prefer it.
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

const findSimilarWithOllama = async (target: Message, candidates: Message[]): Promise<string[]> => {
  try {
    const url = `${String(OLLAMA_BASE_URL).replace(/\/$/, '')}/api/chat`;
    const model = await getOllamaChatModel();

    // Keep prompt small and fast for a demo
    const limited = candidates.slice(0, 25).map((m) => ({
      id: m.id,
      body: (m.body || '').slice(0, 280),
    }));

    const payload = {
      model,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'You compare customer support messages and decide if they are about the SAME issue. Output ONLY valid JSON.'
        },
        {
          role: 'user',
          content:
            `Target message:\n${(target.body || '').slice(0, 400)}\n\n` +
            `Candidates (JSON array of {id, body}):\n${JSON.stringify(limited)}\n\n` +
            `Return ONLY JSON in the shape {"similarIds": ["..."]}.\n` +
            `Only include IDs for messages asking about the EXACT SAME issue and can receive the SAME reply.\n` +
            `If none match, return {"similarIds": []}.`
        }
      ]
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return [];
    const json: any = await res.json();
    const text: string | undefined = json?.message?.content;
    if (!text) return [];

    // eslint-disable-next-line no-console
    console.log('Ollama similarity model used:', model);

    const parsed = JSON.parse(text);
    const ids = Array.isArray(parsed?.similarIds) ? parsed.similarIds.filter((x: any) => typeof x === 'string') : [];
    return ids;
  } catch (e) {
    console.warn('Ollama similarity fallback failed:', e);
    return [];
  }
};

const decodeHtmlEntities = (input: string): string => {
  // Handles strings like "it&#39;s" coming from HTML-encoded sources.
  try {
    if (typeof document === 'undefined') return input;
    const el = document.createElement('textarea');
    el.innerHTML = input;
    return el.value;
  } catch {
    return input;
  }
};

const normalizeForExactMatch = (input: string): string => {
  const decoded = decodeHtmlEntities(input || '');
  return decoded
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[“”‘’]/g, "'")
    .trim();
};

const analyzeWithOllama = async (text: string): Promise<AnalysisResult | null> => {
  try {
    const base = String(OLLAMA_BASE_URL).replace(/\/$/, '');
    const url = `${base}/api/chat`;
    const model = await getOllamaChatModel();

    const allowedCategories = Object.values(MessageCategory);
    const allowedSentiments = Object.values(Sentiment);
    const allowedCosts = Object.values(ResponseCost);

    const payload = {
      model,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert customer support triage assistant. Return ONLY valid JSON, with no extra text.'
        },
        {
          role: 'user',
          content:
            `Analyze this customer support message for a small online business.\n` +
            `Message: "${(text || '').slice(0, 1200)}"\n\n` +
            `Return ONLY JSON with exactly these keys:\n` +
            `{\n` +
            `  "category": one of ${JSON.stringify(allowedCategories)},\n` +
            `  "sentiment": one of ${JSON.stringify(allowedSentiments)},\n` +
            `  "predictedCost": one of ${JSON.stringify(allowedCosts)},\n` +
            `  "tags": array of 0-3 short keywords\n` +
            `}`
        }
      ]
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

    const parsed: any = JSON.parse(content);

    const category = allowedCategories.includes(parsed?.category) ? parsed.category : MessageCategory.General;
    const sentiment = allowedSentiments.includes(parsed?.sentiment) ? parsed.sentiment : Sentiment.Neutral;
    const predictedCost = allowedCosts.includes(parsed?.predictedCost) ? parsed.predictedCost : ResponseCost.Low;
    const tags = Array.isArray(parsed?.tags)
      ? parsed.tags.filter((t: any) => typeof t === 'string').map((t: string) => t.trim()).filter(Boolean).slice(0, 3)
      : [];

    // eslint-disable-next-line no-console
    console.log('Ollama triage model used:', model);

    return { category, sentiment, predictedCost, tags };
  } catch (e) {
    console.warn('Ollama triage failed:', e);
    return null;
  }
};

// Initialize Gemini Client
let genAIInstance: GoogleGenAI | null = null;
let warnedMissingKey = false;
let warnedQuota = false;
let geminiCooldownUntilMs = 0;

const getRetryDelayMsFromError = (error: unknown): number | null => {
  // `@google/genai` ApiError often stringifies the JSON error payload into `message`.
  const message = (error as any)?.message;
  if (typeof message !== 'string') return null;

  try {
    const parsed = JSON.parse(message);
    const retryDelay = parsed?.error?.details?.find((d: any) => d?.['@type']?.includes('RetryInfo'))?.retryDelay;
    if (typeof retryDelay === 'string' && retryDelay.endsWith('s')) {
      const seconds = Number(retryDelay.slice(0, -1));
      if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
    }
  } catch {
    // ignore
  }

  // Fallback: scrape "Please retry in XXs" if present.
  const match = message.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
  if (match?.[1]) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  }

  return null;
};

const isQuota429 = (error: unknown): boolean => {
  const message = (error as any)?.message;
  if (typeof message === 'string') {
    return message.includes('"code":429') || message.includes('RESOURCE_EXHAUSTED') || message.includes('Quota exceeded');
  }
  return false;
};
const getGenAI = () => {
  if (!genAIInstance) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    // If the key isn't configured, don't create a client with a dummy key.
    // That would cause every request to fail and spam fallback UI.
    if (!apiKey) {
      if (!warnedMissingKey) {
        warnedMissingKey = true;
        console.warn(
          "Missing VITE_GEMINI_API_KEY. Gemini features are disabled until it's set.",
        );
      }
      return null;
    }

    genAIInstance = new GoogleGenAI({ apiKey });
  }
  return genAIInstance;
};

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      enum: Object.values(MessageCategory),
      description: "The primary category of the message."
    },
    sentiment: {
      type: Type.STRING,
      enum: Object.values(Sentiment),
      description: "The emotional tone of the message."
    },
    predictedCost: {
      type: Type.STRING,
      enum: Object.values(ResponseCost),
      description: "Estimated effort/complexity to respond. Low for FAQs, High for disputes/complex custom requests."
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Up to 3 keywords describing the specific issue (e.g., 'Tracking', 'Broken Item', 'Pricing')."
    }
  },
  required: ["category", "sentiment", "predictedCost", "tags"]
};

const similaritySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    similarIds: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of IDs of messages that are semantically similar to the target message."
    }
  },
  required: ["similarIds"]
};

export const analyzeMessageContent = async (text: string): Promise<AnalysisResult> => {
  try {
    // If we recently hit quota, don't keep retrying on every render.
    if (Date.now() < geminiCooldownUntilMs) {
      const ollama = await analyzeWithOllama(text);
      if (ollama) return ollama;
      return {
        category: MessageCategory.General,
        sentiment: Sentiment.Neutral,
        predictedCost: ResponseCost.Low,
        tags: [],
      };
    }

    const genAI = getGenAI();
    if (!genAI) {
      const ollama = await analyzeWithOllama(text);
      if (ollama) return ollama;
      return {
        category: MessageCategory.General,
        sentiment: Sentiment.Neutral,
        predictedCost: ResponseCost.Low,
        tags: [],
      };
    }
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze the following customer support message coming into an inbox for a small business owner.
      
      Message: "${text}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction: "You are an expert at customer support triage. Be precise."
      }
    });

    const result = JSON.parse(response.text || "{}");
    return result as AnalysisResult;
  } catch (error) {
    if (isQuota429(error)) {
      const retryDelayMs = getRetryDelayMsFromError(error) ?? 30_000;
      geminiCooldownUntilMs = Date.now() + retryDelayMs;
      if (!warnedQuota) {
        warnedQuota = true;
        console.warn(
          `Gemini quota exceeded (429). Pausing AI calls for ~${Math.ceil(retryDelayMs / 1000)}s.`,
        );
      }
    } else {
      console.error("Gemini Analysis Failed", error);
    }
    // Fallback if API fails
    const ollama = await analyzeWithOllama(text);
    if (ollama) return ollama;
    return {
      category: MessageCategory.General,
      sentiment: Sentiment.Neutral,
      predictedCost: ResponseCost.Low,
      tags: []
    };
  }
};

export const generateDraftReply = async (
  messageText: string,
  senderName: string,
  policies: BusinessPolicy[]
): Promise<string> => {
  try {
    const policyContext = policies.map(p => `${p.title}: ${p.content}`).join('\n\n');
    const genAI = getGenAI();
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Customer Name: ${senderName}
      Message: "${messageText}"
      
      Relevant Business Policies:
      ${policyContext}
      
      Instructions:
      Draft a friendly, professional, and concise response. 
      Use the provided policies to answer specific questions (e.g., shipping times, returns).
      If the user is angry, be empathetic and apologetic but firm on policy if needed.
      Keep it short (under 150 words).
      Do not include placeholders like "[Your Name]" unless absolutely necessary, assume the signature is handled by the system.`
    });

    return response.text || "Could not generate draft.";
  } catch (error) {
    console.error("Gemini Draft Failed", error);
    return "Error generating draft. Please write manually.";
  }
};

export const findSimilarMessages = async (
  target: Message,
  candidates: Message[]
): Promise<string[]> => {
  // Filter locally first.
  // If categories are still defaulted to General, don't restrict by category.
  const restrictByCategory = !!target.category && target.category !== MessageCategory.General;
  const potentialMatches = candidates.filter((m) => {
    if (m.id === target.id) return false;
    if (restrictByCategory && m.category !== target.category) return false;
    return true;
  });

  if (potentialMatches.length === 0) return [];

  // Deterministic exact-duplicate match (covers the "literally duplicate" case)
  const targetNorm = normalizeForExactMatch(target.body);
  if (targetNorm) {
    const exactIds = potentialMatches
      .filter((m) => normalizeForExactMatch(m.body) === targetNorm)
      .map((m) => m.id);
    if (exactIds.length > 0) return exactIds;
  }

  try {
    // Build list: target + candidates
    const texts = [target.body, ...potentialMatches.map((m) => m.body)];
    const embeddings = await getEmbeddings(texts);
    if (!embeddings || embeddings.length < 2) return [];

    const targetVec = embeddings[0];
    const candidateVecs = embeddings.slice(1);

    // compute similarity for all candidates
    const sims: { id: string; sim: number }[] = [];
    for (let i = 0; i < candidateVecs.length; i++) {
      const sim = cosineSimilarity(targetVec, candidateVecs[i]);
      sims.push({ id: potentialMatches[i].id, sim });
    }

    // log for debugging in the demo
    try {
      // eslint-disable-next-line no-console
      console.groupCollapsed('Similarity scores for', target.id || 'target');
      sims.forEach(s => console.log(s.id, s.sim.toFixed(3)));
      console.groupEnd();
    } catch {}

    // primary threshold (demo-friendly)
    const threshold = 0.6;
    const passing = sims.filter(s => s.sim >= threshold).map(s => s.id);
    if (passing.length > 0) return passing;

    // fallback: return top 3 closest matches (if any have non-zero similarity)
    const sorted = sims.sort((a, b) => b.sim - a.sim);
    const top = sorted.slice(0, 3).filter(s => s.sim > 0.15).map(s => s.id);
    if (top.length > 0) return top;

    // If embeddings are unavailable/too weak (e.g., TF-IDF fallback), use local Ollama chat.
    return await findSimilarWithOllama(target, potentialMatches);
  } catch (error) {
    console.error('Similarity via embeddings failed', error);
    // Last resort fallback
    return await findSimilarWithOllama(target, potentialMatches);
  }
};