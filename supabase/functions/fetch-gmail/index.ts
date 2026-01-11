import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GMAIL_API_URL = "https://www.googleapis.com/gmail/v1/users/me/messages";

const DEFAULT_MAX_RESULTS = 30;
const BUSINESS_KEYWORDS = [
  "order",
  "purchase",
  "invoice",
  "receipt",
  "billing",
  "charge",
  "payment",
  "tracking",
  "shipment",
  "shipping",
  "delivery",
  "delivered",
  "eta",
  "return",
  "refund",
  "exchange",
  "replacement",
  "cancel",
  "cancellation",
  "address",
  "support",
  "help",
  "issue",
  "problem",
  "broken",
  "damaged",
  "missing",
  "late",
  "delay",
  "complaint",
  "warranty",
  "subscription",
];

// Gmail search syntax: https://support.google.com/mail/answer/7190
// Keyword-based so it works without AI.
const DEFAULT_GMAIL_QUERY =
  `in:inbox -from:me -in:spam -in:trash -category:social -category:forums -category:promotions (` +
  BUSINESS_KEYWORDS.join(" OR ") +
  `)`;

const hasExcludedLabels = (labelIds: unknown): boolean => {
  const labels = Array.isArray(labelIds) ? labelIds : [];
  const set = new Set(labels.filter((x) => typeof x === "string"));
  return (
    set.has("SPAM") ||
    set.has("TRASH") ||
    set.has("CATEGORY_PROMOTIONS") ||
    set.has("CATEGORY_SOCIAL") ||
    set.has("CATEGORY_FORUMS")
  );
};

const normalizeForKeywordMatch = (input: string): string =>
  (input || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”‘’]/g, "'")
    .trim();

const isBusinessRelevant = (subject: string, snippet: string): boolean => {
  const text = normalizeForKeywordMatch(`${subject}\n${snippet}`);
  if (!text) return false;
  return BUSINESS_KEYWORDS.some((kw) => text.includes(kw));
};

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

interface AnalysisResult {
  category: "Urgent" | "Important" | "General" | "Promotional" | "Spam";
  sentiment: "Positive" | "Neutral" | "Negative";
  predicted_cost: "High" | "Medium" | "Low";
  tags: string[];
}

async function analyzeEmailWithOllama(
  emailBody: string,
  ollamaBaseUrl: string,
  ollamaModel: string,
): Promise<AnalysisResult> {
  const prompt = `Analyze the following email and return a JSON object with 'category', 'sentiment', 'predicted_cost', and 'tags'.

Email:
"""
${emailBody}
"""

JSON Response:`;

  try {
    const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: prompt,
        format: "json",
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Ollama API Error:", response.status, errorBody);
      throw new Error(`Ollama API request failed: ${response.statusText}`);
    }

    const result = await response.json();
    const analysis = JSON.parse(result.response);

    // Basic validation
    if (
      !analysis.category || !analysis.sentiment || !analysis.predicted_cost ||
      !Array.isArray(analysis.tags)
    ) {
      throw new Error("Invalid analysis format from Ollama");
    }

    return analysis;
  } catch (error) {
    console.error("Failed to analyze email with Ollama:", error);
    // Return a default analysis on failure
    return {
      category: "General",
      sentiment: "Neutral",
      predicted_cost: "Low",
      tags: ["analysis-failed"],
    };
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
      results[index] = await fn(items[index], index);
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
    const OLLAMA_BASE_URL = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434";
    const OLLAMA_CHAT_MODEL = Deno.env.get("OLLAMA_CHAT_MODEL") ?? "llama3";


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
    const q = typeof query === "string" && query.trim().length > 0 ? query.trim() : DEFAULT_GMAIL_QUERY;

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

    const irrelevantIds: string[] = [];

    const newEmails = (await mapWithLimit(messages, 5, async (message) => {
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

      // Hard-stop: don't ingest spam/trash/promotions even if they slip through the query.
      if (hasExcludedLabels(email?.labelIds)) {
        irrelevantIds.push(email.id);
        return null;
      }

      // Final server-side gate: if it doesn't look like a business/support email, skip it.
      if (!isBusinessRelevant(subjectHeader, email.snippet || "")) {
        irrelevantIds.push(email.id);
        return null;
      }

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
        const ms = Number.parseInt(String(m?.internalDate ?? ""), 10);
        if (Number.isFinite(ms) && ms > maxSent) maxSent = ms;
      }
      if (maxSent >= 0) threadLatestSentMs.set(threadId, maxSent);
    });

    const newEmailsWithReplyState = newEmails.map((e) => {
      const sentMs = e.thread_id ? threadLatestSentMs.get(e.thread_id) : undefined;
      const inboundMs = e.internal_date_ms;
      const isReplied =
        typeof sentMs === "number" &&
        Number.isFinite(sentMs) &&
        typeof inboundMs === "number" &&
        Number.isFinite(inboundMs) &&
        sentMs > inboundMs;

      return { ...e, is_replied: isReplied };
    });

    const enrichedEmails = await mapWithLimit(
      newEmailsWithReplyState,
      5,
      async (email) => {
        const analysis = await analyzeEmailWithOllama(
          email.body,
          OLLAMA_BASE_URL,
          OLLAMA_CHAT_MODEL,
        );
        return {
          ...email,
          ...analysis,
        };
      },
    );

    if (enrichedEmails.length > 0) {
      // Allow updates on conflict so reply/read state can be corrected on later syncs.
      const { error } = await supabaseAdmin.from("messages").upsert(
        enrichedEmails,
        {
          onConflict: "id",
        },
      );
      if (error) throw error;
    }

    const ids = enrichedEmails.map((m) => m.id).slice(0, 5);
    const skippedCount = irrelevantIds.length;
    return jsonResponse(
      {
        message: `Synced ${enrichedEmails.length} emails. Skipped ${skippedCount}. Purged ${deletedIrrelevantCount}.`,
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
