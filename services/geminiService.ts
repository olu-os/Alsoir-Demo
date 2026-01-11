import { AnalysisResult, BusinessPolicy, MessageCategory, Sentiment, ResponseCost, Message } from "../types";
import { getEmbeddings, cosineSimilarity } from './embeddingService';
import { decodeHtmlEntities } from './text';

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

const heuristicAnalyze = (text: string): AnalysisResult => {
  const raw = decodeHtmlEntities(text || '');
  const t = raw.toLowerCase();

  // Returns
  if (/(return|refund|exchange|rma|send\s+back|wrong\s+item|cancel\s+my\s+order)/i.test(t)) {
    return {
      category: MessageCategory.Returns,
      sentiment: /(angry|upset|unacceptable|terrible|worst|mad|furious|fraud|scam)/i.test(t)
        ? Sentiment.Negative
        : Sentiment.Neutral,
      predictedCost: /(chargeback|dispute|fraud|scam)/i.test(t) ? ResponseCost.High : ResponseCost.Medium,
      tags: ['Return', 'Refund'].filter(Boolean),
    };
  }

  // Shipping
  if (/(where\s+is\s+my\s+order|tracking|shipment|shipping|deliver|delivery|arrive|eta|package|lost|late|delay|carrier|usps|ups|fedex)/i.test(t)) {
    return {
      category: MessageCategory.Shipping,
      sentiment: /(angry|upset|unacceptable|terrible|worst|mad|furious)/i.test(t)
        ? Sentiment.Negative
        : Sentiment.Neutral,
      predictedCost: /(lost|stolen|missing|never\s+arrived)/i.test(t) ? ResponseCost.Medium : ResponseCost.Low,
      tags: ['Tracking', 'Delivery'].filter(Boolean),
    };
  }

  // Custom requests
  if (/(custom|personaliz|engrave|size\s+change|modify|different\s+color|rush\s+order|special\s+request)/i.test(t)) {
    return {
      category: MessageCategory.Custom,
      sentiment: Sentiment.Neutral,
      predictedCost: ResponseCost.Medium,
      tags: ['Custom'].filter(Boolean),
    };
  }

  // Complaints
  if (/(broken|damaged|defect|doesn\'?t\s+work|not\s+working|terrible|worst|unhappy|angry|upset|disappointed|complain)/i.test(t)) {
    return {
      category: MessageCategory.Complaint,
      sentiment: Sentiment.Negative,
      predictedCost: ResponseCost.High,
      tags: ['Complaint'].filter(Boolean),
    };
  }

  // Product questions
  if (/(material|dimensions?|size\s+chart|how\s+big|does\s+it\s+fit|ingredients?|compatible|warranty|care\s+instructions|how\s+to\s+use)/i.test(t)) {
    return {
      category: MessageCategory.Product,
      sentiment: Sentiment.Neutral,
      predictedCost: ResponseCost.Low,
      tags: ['Product'].filter(Boolean),
    };
  }

  return {
    category: MessageCategory.General,
    sentiment: Sentiment.Neutral,
    predictedCost: ResponseCost.Low,
    tags: [],
  };
};

const isDefaultAnalysis = (a: AnalysisResult): boolean => {
  return (
    a.category === MessageCategory.General &&
    a.sentiment === Sentiment.Neutral &&
    a.predictedCost === ResponseCost.Low &&
    (a.tags?.length ?? 0) === 0
  );
};

export const analyzeMessageContent = async (text: string): Promise<AnalysisResult> => {
  const heuristic = heuristicAnalyze(text);
  try {
    const ollama = await analyzeWithOllama(text);
    if (ollama && !isDefaultAnalysis(ollama)) return ollama;
  } catch (e) {
    console.warn('Ollama analyze failed; using heuristic:', e);
  }
  return heuristic;
};

const generateDraftWithOllama = async (
  messageText: string,
  senderName: string,
  policies: BusinessPolicy[],
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
            'Say replies just like you\'re 50 cent rapping but still be endearing and respectful. Don\'t mention that you\'re 50 Cent or an AI. Keep it concise and readable. Use shorter lines and prioritize rhyming. Use Lower East Siders & Co. as a name',
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
  policies: BusinessPolicy[]
): Promise<string> => {
  const draft = await generateDraftWithOllama(messageText, senderName, policies);
  if (draft) return draft;

  // Fallback: simple, professional template (deterministic)
  return (
    `Hi ${senderName || 'there'},\n\n` +
    `Thanks for reaching out. I’m looking into this now and will help get it resolved. ` +
    `Could you confirm your order number and any relevant details (e.g., tracking number or photos if applicable)?\n\n` +
    `Thanks!`
  );
};

export const findSimilarMessages = async (
  target: Message,
  candidates: Message[]
): Promise<string[]> => {
  // Compare against all other messages.
  // We *prefer* same-category matches (for quality/speed) but we do not restrict,
  // because categorization can be wrong/unfinished and it hides valid duplicates.
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

  // Hard cap to keep embeddings + Ollama prompts fast.
  potentialMatches = potentialMatches.slice(0, 50);

  // eslint-disable-next-line no-console
  console.log(
    `FindSimilar: pool=${candidates.length}, comparing=${potentialMatches.length}, preferCategory=${shouldPreferCategory ? String(target.category) : 'none'}`,
  );

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