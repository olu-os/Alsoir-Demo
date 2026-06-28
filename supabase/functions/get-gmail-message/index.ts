import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me/messages";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

function decodeBase64Url(str: string): string {
  if (!str) return "";
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const bytes = atob(base64);
  return new TextDecoder("utf-8").decode(
    Uint8Array.from(bytes, (c) => c.charCodeAt(0))
  );
}

function getHeaderValue(headers: any[], name: string): string {
  return headers.find(
    (h: any) => String(h?.name || "").toLowerCase() === name.toLowerCase()
  )?.value ?? "";
}

function extractBody(payload: any): { text: string; html: string } {
  let text = "";
  let html = "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    text = decodeBase64Url(payload.body.data);
  } else if (payload.mimeType === "text/html" && payload.body?.data) {
    html = decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const extracted = extractBody(part);
      if (!text && extracted.text) text = extracted.text;
      if (!html && extracted.html) html = extracted.html;
    }
  }

  return { text, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { providerToken, messageId } = await req.json();

    if (!providerToken) {
      return jsonResponse({ error: "Missing providerToken" }, 400);
    }

    if (!messageId) {
      return jsonResponse({ error: "Missing messageId" }, 400);
    }

    const res = await fetch(`${GMAIL_BASE}/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${providerToken}` },
    });

    if (!res.ok) {
      const details = await res.text();
      console.error("Gmail API failed:", res.status, details);
      return jsonResponse(
        { error: "Gmail API failed", status: res.status, details },
        res.status === 401 ? 401 : 502
      );
    }

    const data = await res.json();
    const headers = data.payload?.headers || [];

    const subject = getHeaderValue(headers, "Subject");
    const from = getHeaderValue(headers, "From");
    const to = getHeaderValue(headers, "To");
    const date = getHeaderValue(headers, "Date");

    const { text, html } = extractBody(data.payload);

    return jsonResponse({
      id: data.id,
      threadId: data.threadId,
      subject,
      from,
      to,
      date,
      snippet: data.snippet || "",
      body: text || html || data.snippet || "",
      htmlBody: html || "",
    });
  } catch (error) {
    console.error("Function Error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
