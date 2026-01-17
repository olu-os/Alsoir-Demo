// AI relevance filter: only keep if AI says it's a business/support inquiry
async function aiIsRelevant(subject: string, body: string): Promise<{ relevant: boolean; reason?: string }> {
  try {
    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") || "http://localhost:11434";
    const model = Deno.env.get("OLLAMA_CHAT_MODEL") || "gpt-oss:120b-cloud";
    const url = `${ollamaUrl.replace(/\/$/, '')}/api/chat`;
    const prompt = `Is the following email a business/customer support inquiry (not marketing, spam, or transactional)?\n\nSubject: ${subject}\nBody: ${body}\n\nRespond ONLY with a valid JSON object: {\"relevant\": true/false, \"reason\": \"<short reason>\"}`;
    const payload = {
      model,
      stream: false,
      messages: [
        { role: 'system', content: 'You are a customer support AI that filters messages.' },
        { role: 'user', content: prompt },
      ],
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { relevant: true };
    const json = await res.json();
    const content = json?.message?.content;
    if (!content) return { relevant: true };
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { return { relevant: true }; }
      } else {
        return { relevant: true };
      }
    }
    return { relevant: !!parsed.relevant, reason: parsed.reason };
  } catch (e) {
    console.warn('Ollama AI relevance filter failed:', e);
    return { relevant: true };
  }
}
// Local type for AI categorization result
type AnalysisResult = {
  category: string;
  sentiment: string;
  predicted_cost: string; // 'Low' | 'Medium' | 'High'
  tags: string[];
};
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GMAIL_API_URL = "https://www.googleapis.com/gmail/v1/users/me/messages";

const DEFAULT_MAX_RESULTS = 30;

const DEFAULT_GMAIL_QUERY =
  `in:inbox -from:me -in:spam -in:trash -category:social -category:forums -category:promotions`;

// CORS headers to allow browser calls to this Edge Function
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const readResponseBody = async (resp: Response) => {
  const contentType = resp.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
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

const getHeaderValue = (headers: any[], name: string): string =>
  headers.find((h: any) => String(h?.name || "").toLowerCase() === name.toLowerCase())
    ?.value ?? "";

const parseFromHeader = (fromHeader: string) => {
  const senderName = fromHeader.split("<")[0].trim();
  const senderHandle = fromHeader.match(/<(.+)>/)?.[1] || fromHeader;
  return { senderName, senderHandle };
};

type GmailMessageId = { id: string };

type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  labelIds?: unknown;
  snippet?: string;
  payload?: { headers?: any[] };
};

type MessageRow = {
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
  category?: string;
  sentiment?: string;
  predicted_cost?: string;
  tags?: string[];
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

async function categorizeWithOllama(subject: string, body: string): Promise<AnalysisResult | null> {
  try {
    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") || "http://localhost:11434";
    const model = Deno.env.get("OLLAMA_CHAT_MODEL") || "gpt-oss:120b-cloud";
    const url = `${ollamaUrl.replace(/\/$/, '')}/api/chat`;
    const prompt = `Categorize the following customer message into one of these categories: Shipping, Returns, Product, Custom, Complaint, General, Other.\n\nSubject: ${subject}\nBody: ${body}\n\nFor the field predicted_cost, think: What happens if I don't respond to this soon? Is there a risk of a bad review, lost customer, or serious negative consequence if this is not handled promptly? If the message doesn't display dissatisfaction, it will be low predicted cost\n\nRespond ONLY with a valid JSON object: {\"category\": \"<category>\", \"predicted_cost\": \"Low|Medium|High\", \"reason\": \"<short reason>\"}`;
    const payload = {
      model,
      stream: false,
      temperature: 0,
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
    const json = await res.json();
    const content = json?.message?.content;
    if (!content) return null;
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { return null; }
      } else {
        return null;
      }
    }
    const category = typeof parsed.category === 'string' && ALLOWED_CATEGORIES.includes(parsed.category) ? parsed.category : 'General';
    let predicted_cost = typeof parsed.predicted_cost === 'string' ? parsed.predicted_cost.trim() : '';
    if (!['Low', 'Medium', 'High'].includes(predicted_cost)) predicted_cost = 'Low';
    return {
      category,
      sentiment: 'Neutral',
      predicted_cost,
      tags: [category],
    };
  } catch (e) {
    console.warn('Ollama AI categorization failed:', e);
    return null;
  }
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
      if (index < items.length) { // Re-check to prevent race conditions
        results[index] = await fn(items[index], index);
      }
    }
  });

  await Promise.all(workers);
  return results;
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
    const { session, userId: debugUserId, query, maxResults, purgeIrrelevant } = body as {
      session?: any;
      userId?: string;
      query?: string;
      maxResults?: number;
      purgeIrrelevant?: boolean;
    };

    const SUPABASE_URL =
      Deno.env.get("FUNCTION_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ??
        "";
    const SERVICE_ROLE_KEY =
      Deno.env.get("FUNCTION_SERVICE_ROLE_KEY") ??
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse(
        {
          error:
            "Missing Supabase admin secrets (FUNCTION_SUPABASE_URL / FUNCTION_SERVICE_ROLE_KEY)",
        },
        500,
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (debug && debugUserId) {
      // Debug mode: seed a sample message for the given user without Gmail API
      const sampleId = crypto.randomUUID();
      const sample = {
        id: sampleId,
        user_id: debugUserId,
        channel: "Email",
        sender_name: "Debug User",
        sender_handle: "debug@example.com",
        subject: "Hello from Debug",
        body: "This is a seeded message to verify pipeline.",
        received_at: new Date().toISOString(),
        is_read: false,
        is_replied: false,
        category: "General",
        sentiment: "Neutral",
        predicted_cost: "Low",
        tags: ["Debug"],
      };
      const { error } = await supabaseAdmin.from("messages").upsert(sample, { onConflict: "id" });
      if (error) {
        console.error("Debug seed upsert error:", error);
        return jsonResponse({ error: error.message }, 500);
      }
      return jsonResponse({ message: "Seeded 1 debug message", ids: [sampleId] }, 200);
    }

    if (!session) {
      console.error("Request body missing session");
      return jsonResponse({ error: "Missing session in request body" }, 400);
    }
    if (!session.provider_token) {
      console.error("Session missing provider_token. Ensure Google OAuth has correct scopes and offline access.");
      return jsonResponse({ error: "Missing provider_token on session" }, 400);
    }

    const userId = session?.user?.id;
    if (!userId) {
      console.error("Session missing user.id");
      return jsonResponse({ error: "Missing session.user.id" }, 400);
    }

    // Exclude outbound messages; ingest inbound customer email.
    // Additionally, constrain results to likely business/support/order emails.
    const safeMaxResultsRaw =
      typeof maxResults === "number" && Number.isFinite(maxResults)
        ? Math.floor(maxResults)
        : DEFAULT_MAX_RESULTS;
    const safeMaxResults = Math.max(1, Math.min(50, safeMaxResultsRaw));
    const q = 'in:inbox category:primary';

    const response = await fetch(
      `${GMAIL_API_URL}?q=${encodeURIComponent(q)}&maxResults=${safeMaxResults}`,
      {
      headers: {
        Authorization: `Bearer ${session.provider_token}`,
      },
      },
    );

    if (!response.ok) {
      const body = await readResponseBody(response);
      console.error("Gmail API Error:", response.status, body);
      return jsonResponse(
        {
          error: "Gmail API request failed",
          status: response.status,
          statusText: response.statusText,
          details: body,
        },
        response.status === 401 ? 401 : 502,
      );
    }

    const listJson = await response.json();
    const messages: GmailMessageId[] = Array.isArray(listJson?.messages)
      ? listJson.messages
      : [];
    if (!messages || messages.length === 0) {
      return jsonResponse({ message: "No new messages found." }, 200);
    }

    // Fetch existing Gmail IDs from DB to avoid reprocessing
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("user_id", userId);
    if (existingError) {
      console.error("Failed to fetch existing message IDs:", existingError);
    }
    const existingIds = new Set((existingRows ?? []).map((row: any) => row.id));

    const irrelevantIds: string[] = [];

    const newEmails = (await mapWithLimit(messages, 2, async (message) => {
      if (existingIds.has(message.id)) {
        // Skip messages already in DB
        return null;
      }
      const msgResponse = await fetch(`${GMAIL_API_URL}/${message.id}`, {
        headers: { Authorization: `Bearer ${session.provider_token}` },
      });
      if (!msgResponse.ok) {
        const body = await readResponseBody(msgResponse);
        console.error("Gmail message fetch failed:", msgResponse.status, body);
        return null;
      }

      const email = (await msgResponse.json()) as GmailMessage;

      const headers = Array.isArray(email?.payload?.headers)
        ? (email.payload!.headers as any[])
        : [];
      const fromHeader = getHeaderValue(headers, "From");
      const subjectHeader = getHeaderValue(headers, "Subject");
      const dateHeader = getHeaderValue(headers, "Date") || new Date().toISOString();

      const labelIds = Array.isArray(email?.labelIds) ? (email.labelIds as any[]) : [];
      const internalDateMs = Number.parseInt(String(email?.internalDate ?? ""), 10);
      const receivedAtIso = Number.isFinite(internalDateMs)
        ? new Date(internalDateMs).toISOString()
        : new Date(dateHeader).toISOString();

      const { senderName, senderHandle } = parseFromHeader(fromHeader);

      const row: MessageRow = {
        id: email.id,
        thread_id: email.threadId,
        internal_date_ms: internalDateMs,
        user_id: userId,
        channel: "Email",
        sender_name: senderName,
        sender_handle: senderHandle,
        subject: subjectHeader,
        body: email.snippet || "",
        received_at: receivedAtIso,
        is_read: !labelIds.includes("UNREAD"),
        is_replied: false,
      };
      return row;
    })).filter(Boolean) as MessageRow[];

    // If any irrelevant IDs were fetched, optionally delete them from the DB to preserve space.
    // This only deletes rows that match the fetched IDs for this user.
    const shouldPurge = purgeIrrelevant !== false;
    let deletedIrrelevantCount = 0;
    if (shouldPurge && irrelevantIds.length > 0) {
      const { error: delErr, data: delData } = await supabaseAdmin
        .from("messages")
        .delete()
        .eq("user_id", userId)
        .in("id", irrelevantIds);
      if (delErr) {
        console.warn("Failed to purge irrelevant messages from DB:", delErr);
      } else if (Array.isArray(delData)) {
        deletedIrrelevantCount = delData.length;
      }
    }

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
        const sentTimestamp = Number(m.internalDate);
        if (Number.isFinite(sentTimestamp) && sentTimestamp > maxSent) maxSent = sentTimestamp;
      }
      if (maxSent >= 0) threadLatestSentMs.set(threadId, maxSent);
    });


    // Batch enrichment and upsert logic
    const enrichedEmailsBatch: MessageRow[] = [];
    let totalEnriched = 0;
    let batchIds: string[] = [];
    for (const [i, e] of newEmails.entries()) {
      // Compute replied status
      const sentMs = e.thread_id ? threadLatestSentMs.get(e.thread_id) : undefined;
      const inboundMs = e.internal_date_ms;
      const isReplied =
        typeof sentMs === "number" &&
        Number.isFinite(sentMs) &&
        typeof inboundMs === "number" &&
        Number.isFinite(inboundMs) &&
        sentMs > inboundMs;

      // AI relevance filter (after business keyword check)
      const aiRelevance = await aiIsRelevant(e.subject, e.body);
      if (!aiRelevance.relevant) {
        irrelevantIds.push(e.id);
        continue;
      }

      let analysis = await categorizeWithOllama(e.subject, e.body);
      if (!analysis) {
        // fallback to keyword logic (old method)
        analysis = {
          category: 'General',
          sentiment: 'Neutral',
          predicted_cost: 'Low',
          tags: [],
        };
      }
      const enriched = {
        ...e,
        is_replied: isReplied,
        ...analysis,
      };
      enrichedEmailsBatch.push(enriched);
      batchIds.push(enriched.id);

      // If batch size is 2, upsert to Supabase
      if (enrichedEmailsBatch.length === 2) {
        const { error } = await supabaseAdmin.from("messages").upsert(
          enrichedEmailsBatch,
          {
            onConflict: "id",
          },
        );
        if (error) throw error;
        totalEnriched += enrichedEmailsBatch.length;
        enrichedEmailsBatch.length = 0;
      }
    }
    // Upsert any remaining emails in the final batch
    if (enrichedEmailsBatch.length > 0) {
      const { error } = await supabaseAdmin.from("messages").upsert(
        enrichedEmailsBatch,
        {
          onConflict: "id",
        },
      );
      if (error) throw error;
      totalEnriched += enrichedEmailsBatch.length;
    }

    const ids = batchIds.slice(0, 2);
    const skippedCount = irrelevantIds.length;
    return jsonResponse(
      {
        message: `Synced ${totalEnriched} emails (in batches of 2). Skipped ${skippedCount}. Purged ${deletedIrrelevantCount}.`,
        ids,
        skippedCount,
        purgedCount: deletedIrrelevantCount,
        query: q,
        maxResults: safeMaxResults,
      },
      200,
    );

  } catch (error) {
    console.error("Function Error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
