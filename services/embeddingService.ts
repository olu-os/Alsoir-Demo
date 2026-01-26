// Lightweight embedding service with Ollama-first, TF-IDF fallback.

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
  const provider = env.VITE_LLM_PROVIDER || env.LLM_PROVIDER || '';
  if (provider === 'ollama') {
    try {
      const baseUrl = env.VITE_OLLAMA_BASE_URL || 'http://localhost:11434';
      const base = String(baseUrl).replace(/\/$/, '');
      const embeddings = await tryOllamaEmbed(base, texts);
      if (embeddings) return embeddings;
    } catch (e) {
      console.warn('Ollama embeddings unavailable, falling back to TF-IDF:', e);
    }
    return computeTfIdfEmbeddings(texts);
  }
  // Non-Ollama: use Supabase Edge Function for embeddings first
  const SUPABASE_FUNCTIONS_URL = env.VITE_SUPABASE_FUNCTIONS_URL || '';
  try {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
    });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.embeddings)) {
        return data.embeddings.map((row: any) => Array.isArray(row) ? row.map(Number) : []);
      }
      if (Array.isArray(data.data)) {
        return data.data.map((d: any) => Array.isArray(d.embedding) ? d.embedding.map(Number) : []);
      }
      if (Array.isArray(data.embedding)) {
        return [data.embedding.map(Number)];
      }
    }
  } catch (e) {
    console.warn('Supabase embedding function unavailable, falling back to TF-IDF:', e);
  }
  // Fallback: simple TF-IDF bag-of-words embeddings (deterministic, no deps)
  return computeTfIdfEmbeddings(texts);
}

let cachedEmbedEndpoint: '/api/embed' | '/api/embeddings' | 'none' | null = null;

async function tryOllamaEmbed(base: string, texts: string[]): Promise<number[][] | null> {
  if (cachedEmbedEndpoint === 'none') return null;

  const endpoints: Array<'/api/embed' | '/api/embeddings'> = cachedEmbedEndpoint
    ? cachedEmbedEndpoint === '/api/embed' || cachedEmbedEndpoint === '/api/embeddings'
      ? [cachedEmbedEndpoint]
      : ['/api/embed', '/api/embeddings']
    : ['/api/embed', '/api/embeddings'];

  for (const ep of endpoints) {
    const url = `${base}${ep}`;
    const headers = { 'Content-Type': 'application/json' };
    const body = JSON.stringify({ model: 'nomic-embed-text', input: texts });
    // Log request details
    console.log('[Ollama Embed] Request:', { url, headers, body });
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body
      });
    } catch (err) {
      console.error('[Ollama Embed] Fetch error:', err);
      continue;
    }
    // Log response status and headers
    console.log('[Ollama Embed] Response:', {
      url,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries())
    });

    if (res.status === 404) {
      continue;
    }

    if (!res.ok) {
      // Log response body for errors
      let errorText = '';
      try { errorText = await res.text(); } catch {}
      console.error('[Ollama Embed] Error response body:', errorText);
      // If auth/proxy/etc blocks, don't keep retrying.
      cachedEmbedEndpoint = 'none';
      return null;
    }

    let json: any;
    try {
      json = await res.json();
    } catch (err) {
      console.error('[Ollama Embed] Failed to parse JSON:', err);
      cachedEmbedEndpoint = 'none';
      return null;
    }

    // Log parsed JSON
    console.log('[Ollama Embed] Parsed JSON:', json);

    if (Array.isArray(json?.embeddings)) {
      cachedEmbedEndpoint = ep;
      return json.embeddings.map((row: any) => Array.isArray(row) ? row.map(Number) : []);
    }
    if (Array.isArray(json?.data)) {
      cachedEmbedEndpoint = ep;
      return json.data.map((d: any) => Array.isArray(d.embedding) ? d.embedding.map(Number) : []);
    }
    if (Array.isArray(json?.embedding)) {
      cachedEmbedEndpoint = ep;
      return [json.embedding.map(Number)];
    }

    cachedEmbedEndpoint = 'none';
    return null;
  }

  cachedEmbedEndpoint = 'none';
  return null;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/["'`\-_/\\()\[\]{}.,!?;:@#$%^&*=+<>~]|\n|\r/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function computeTfIdfEmbeddings(docs: string[]): number[][] {
  const tokensList = docs.map(tokenize);
  const df: Record<string, number> = {};
  for (const tokens of tokensList) {
    const seen = new Set<string>();
    for (const t of tokens) {
      if (!seen.has(t)) {
        df[t] = (df[t] || 0) + 1;
        seen.add(t);
      }
    }
  }

  const vocab = Object.keys(df).sort();
  const idf: Record<string, number> = {};
  const N = docs.length;
  for (const term of vocab) {
    idf[term] = Math.log(1 + N / (1 + (df[term] || 0)));
  }

  const vectors: number[][] = [];
  for (const tokens of tokensList) {
    const tf: Record<string, number> = {};
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
    const vec = vocab.map((term) => (tf[term] || 0) * idf[term]);
    // normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    vectors.push(vec.map((v) => v / norm));
  }

  return vectors;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    // zero-pad smaller one
    const n = Math.max(a.length, b.length);
    const a2 = new Array(n).fill(0);
    const b2 = new Array(n).fill(0);
    for (let i = 0; i < a.length; i++) a2[i] = a[i];
    for (let i = 0; i < b.length; i++) b2[i] = b[i];
    a = a2; b = b2;
  }
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
