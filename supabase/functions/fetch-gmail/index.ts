import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI, type Schema, Type } from "npm:@google/genai";

const GMAIL_API_URL = "https://www.googleapis.com/gmail/v1/users/me/messages";

// CORS headers to allow browser calls to this Edge Function
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Keep these aligned with `types.ts` MessageCategory enum.
const MESSAGE_CATEGORIES = [
  "Shipping",
  "Returns",
  "Product",
  "Custom",
  "General",
  "Complaint",
  "Other",
] as const;

const SENTIMENTS = ["Positive", "Neutral", "Negative"] as const;
const RESPONSE_COSTS = ["Low", "Medium", "High"] as const;

type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];
type Sentiment = (typeof SENTIMENTS)[number];
type ResponseCost = (typeof RESPONSE_COSTS)[number];

type MessageAnalysis = {
  category: MessageCategory;
  sentiment: Sentiment;
  predictedCost: ResponseCost;
  tags: string[];
};

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING, enum: [...MESSAGE_CATEGORIES] },
    sentiment: { type: Type.STRING, enum: [...SENTIMENTS] },
    predictedCost: { type: Type.STRING, enum: [...RESPONSE_COSTS] },
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["category", "sentiment", "predictedCost", "tags"],
};

const defaultAnalysis: MessageAnalysis = {
  category: "General",
  sentiment: "Neutral",
  predictedCost: "Low",
  tags: [],
};

function getGeminiApiKey(): string {
  return Deno.env.get("FUNCTION_GEMINI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY") ?? "";
}

async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

async function analyzeMessageContent(
  genAI: GoogleGenAI,
  content: string,
): Promise<MessageAnalysis> {
  const trimmed = content.trim();
  if (!trimmed) return defaultAnalysis;

  try {
    const prompt = `Analyze this message and return JSON strictly matching the schema.\n\nMessage:\n${trimmed}`;
    const resp = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    const text = resp.text;
    if (!text) return defaultAnalysis;
    const parsed = JSON.parse(text) as MessageAnalysis;

    if (!MESSAGE_CATEGORIES.includes(parsed.category)) return defaultAnalysis;
    if (!SENTIMENTS.includes(parsed.sentiment)) return defaultAnalysis;
    if (!RESPONSE_COSTS.includes(parsed.predictedCost)) return defaultAnalysis;
    if (!Array.isArray(parsed.tags)) return defaultAnalysis;

    return {
      category: parsed.category,
      sentiment: parsed.sentiment,
      predictedCost: parsed.predictedCost,
      tags: parsed.tags.map((t) => String(t)).filter(Boolean).slice(0, 20),
    };
  } catch (err) {
    console.error("Gemini analyze failed:", err);
    return defaultAnalysis;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "true";
    const body = await req.json().catch(() => ({}));
    const { session, userId: debugUserId } = body as { session?: any; userId?: string };

    const SUPABASE_URL =
      Deno.env.get("FUNCTION_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY =
      Deno.env.get("FUNCTION_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({
          error: "Missing Supabase admin secrets (FUNCTION_SUPABASE_URL / FUNCTION_SERVICE_ROLE_KEY)",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (debug && debugUserId) {
      // Debug mode: seed a sample message for the given user without Gmail API
      const sampleId = crypto.randomUUID();
      const sample = {
        id: sampleId,
        user_id: debugUserId,
        channel: 'Email',
        sender_name: 'Debug User',
        sender_handle: 'debug@example.com',
        subject: 'Hello from Debug',
        body: 'This is a seeded message to verify pipeline.',
        received_at: new Date().toISOString(),
        is_read: false,
        is_replied: false,
        category: 'General',
        sentiment: 'Neutral',
        predicted_cost: 'Low',
        tags: ['Debug']
      };
      const { error } = await supabaseAdmin.from("messages").upsert(sample, { onConflict: 'id' });
      if (error) {
        console.error('Debug seed upsert error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }
      return new Response(JSON.stringify({ message: "Seeded 1 debug message", ids: [sampleId] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (!session) {
      console.error("Request body missing session");
      return new Response(JSON.stringify({ error: "Missing session in request body" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    if (!session.provider_token) {
      console.error("Session missing provider_token. Ensure Google OAuth has correct scopes and offline access.");
      return new Response(JSON.stringify({ error: "Missing provider_token on session" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const readResponseBody = async (resp: Response) => {
      const contentType = resp.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        try {
          return { json: await resp.json() };
        } catch {
          // fall through to text
        }
      }
      try {
        return { text: await resp.text() };
      } catch {
        return {};
      }
    };

    // Exclude outbound messages; we want to ingest inbound customer email.
    // `from:me` is supported by Gmail search.
    const response = await fetch(`${GMAIL_API_URL}?q=in:inbox -from:me&maxResults=20`, {
      headers: {
        Authorization: `Bearer ${session.provider_token}`,
      },
    });

    if (!response.ok) {
      const body = await readResponseBody(response);
      console.error("Gmail API Error:", response.status, body);
      return new Response(
        JSON.stringify({
          error: "Gmail API request failed",
          status: response.status,
          statusText: response.statusText,
          details: body,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: response.status === 401 ? 401 : 502,
        },
      );
    }

    const { messages } = await response.json();
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ message: "No new messages found." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const emailPromises = messages.map(async (message: { id: string }) => {
      const msgResponse = await fetch(`${GMAIL_API_URL}/${message.id}`, {
        headers: { Authorization: `Bearer ${session.provider_token}` },
      });
      if (!msgResponse.ok) {
        const body = await readResponseBody(msgResponse);
        console.error('Gmail message fetch failed:', msgResponse.status, body);
        return null;
      }
      const email = await msgResponse.json();
      
      const headers = Array.isArray(email?.payload?.headers) ? email.payload.headers : [];
      const fromHeader = headers.find((h: any) => h.name === 'From')?.value || '';
      const subjectHeader = headers.find((h: any) => h.name === 'Subject')?.value || '';
      const dateHeader = headers.find((h: any) => h.name === 'Date')?.value || new Date().toISOString();

      const labelIds = Array.isArray(email?.labelIds) ? email.labelIds : [];
      const internalDateMs = Number.parseInt(String(email?.internalDate ?? ""), 10);
      const receivedAtIso = Number.isFinite(internalDateMs)
        ? new Date(internalDateMs).toISOString()
        : new Date(dateHeader).toISOString();

      return {
        id: email.id,
        thread_id: email.threadId,
        internal_date_ms: internalDateMs,
        user_id: session.user.id,
        channel: 'Email',
        sender_name: fromHeader.split('<')[0].trim(),
        sender_handle: fromHeader.match(/<(.+)>/)?.[1] || fromHeader,
        subject: subjectHeader,
        body: email.snippet,
        received_at: receivedAtIso,
        is_read: !labelIds.includes('UNREAD'),
        // Determined later from thread history (whether there's a later SENT message).
        is_replied: false,
      };
    });

    const newEmails = (await Promise.all(emailPromises)).filter(Boolean) as Array<{
      id: string;
      thread_id?: string;
      internal_date_ms?: number;
      user_id: string;
      channel: string;
      sender_name: string;
      sender_handle: string;
      subject: string;
      body: string;
      received_at: string;
      is_read: boolean;
      is_replied: boolean;
      category?: MessageCategory;
      sentiment?: Sentiment;
      predicted_cost?: ResponseCost;
      tags?: string[];
    }>;

    // Compute replied status per message: mark replied only if there exists a SENT
    // message in the same thread with a later internalDate than this inbound message.
    const threadIds = Array.from(
      new Set(newEmails.map((e) => e.thread_id).filter((t): t is string => !!t)),
    );

    const threadLatestSentMs = new Map<string, number>();
    await mapWithLimit(threadIds, 3, async (threadId) => {
      const threadResp = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata`,
        { headers: { Authorization: `Bearer ${session.provider_token}` } },
      );
      if (!threadResp.ok) {
        const body = await readResponseBody(threadResp);
        console.warn('Gmail thread fetch failed:', threadResp.status, body);
        return;
      }
      const thread = await threadResp.json();
      const msgs = Array.isArray(thread?.messages) ? thread.messages : [];

      let maxSent = -1;
      for (const m of msgs) {
        const labelIds = Array.isArray(m?.labelIds) ? m.labelIds : [];
        if (!labelIds.includes('SENT')) continue;
        const ms = Number.parseInt(String(m?.internalDate ?? ""), 10);
        if (Number.isFinite(ms) && ms > maxSent) maxSent = ms;
      }
      if (maxSent >= 0) threadLatestSentMs.set(threadId, maxSent);
    });

    const newEmailsWithReplyState = newEmails.map((e) => {
      const sentMs = e.thread_id ? threadLatestSentMs.get(e.thread_id) : undefined;
      const inboundMs = e.internal_date_ms;
      const isReplied =
        typeof sentMs === 'number' &&
        Number.isFinite(sentMs) &&
        typeof inboundMs === 'number' &&
        Number.isFinite(inboundMs) &&
        sentMs > inboundMs;

      return { ...e, is_replied: isReplied };
    });

    const geminiApiKey = getGeminiApiKey();
    const genAI = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

    const enrichedEmails = genAI
      ? await mapWithLimit(newEmailsWithReplyState, 5, async (email) => {
          const analysis = await analyzeMessageContent(
            genAI,
            `${email.subject}\n\n${email.body}`,
          );
          return {
            ...email,
            category: analysis.category,
            sentiment: analysis.sentiment,
            predicted_cost: analysis.predictedCost,
            tags: analysis.tags,
          };
        })
      : newEmailsWithReplyState.map((email) => ({
          ...email,
          category: "General" as const,
          sentiment: "Neutral" as const,
          predicted_cost: "Low" as const,
          tags: [],
        }));

    if (enrichedEmails.length > 0) {
      // Allow updates on conflict so reply/read state can be corrected on later syncs.
      const { error } = await supabaseAdmin.from("messages").upsert(enrichedEmails, {
        onConflict: 'id',
      });
      if (error) throw error;
    }

    const ids = enrichedEmails.map((m) => m.id).slice(0, 5);
    return new Response(JSON.stringify({ message: `Synced ${enrichedEmails.length} emails.`, ids }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Function Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
