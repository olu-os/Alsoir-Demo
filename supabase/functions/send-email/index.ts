import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_SEND_URL = `${GMAIL_BASE}/messages/send`;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function getHeaderValue(headers: any[], name: string): string {
  return headers.find(
    (h: any) => String(h?.name || "").toLowerCase() === name.toLowerCase(),
  )?.value ?? "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { session, to, subject, body, threadId, messageId } = await req.json();

    if (!session?.provider_token) {
      return new Response(
        JSON.stringify({ error: "Missing provider_token on session" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let originalMessageId: string | undefined;

    if (messageId) {
      try {
        const msgRes = await fetch(
          `${GMAIL_BASE}/messages/${messageId}?format=metadata&metadataHeaders=Message-ID`,
          { headers: { Authorization: `Bearer ${session.provider_token}` } },
        );
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          const headers = Array.isArray(msgData?.payload?.headers)
            ? msgData.payload.headers
            : [];
          originalMessageId = getHeaderValue(headers, "Message-ID") || undefined;
        }
      } catch {
      }
    }

    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset="UTF-8"`,
      ...(originalMessageId
        ? [`In-Reply-To: ${originalMessageId}`, `References: ${originalMessageId}`]
        : []),
      ``,
      body,
    ];

    const email = emailLines.join("\r\n");
    const raw = base64UrlEncode(email);

    const payload: { raw: string; threadId?: string } = { raw };
    if (threadId) {
      payload.threadId = threadId;
    }

    const res = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.provider_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const details = await res.text();
      return new Response(
        JSON.stringify({ error: "Gmail API send failed", status: res.status, details }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await res.json();

    return new Response(
      JSON.stringify({ message: "Email sent", id: data.id, threadId: data.threadId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
