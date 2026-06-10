import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { session, to, subject, body, threadId, messageId, userId, replyBody } = await req.json();

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

    const apiPayload: { raw: string; threadId?: string } = { raw };
    if (threadId) {
      apiPayload.threadId = threadId;
    }

    const res = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.provider_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apiPayload),
    });

    if (!res.ok) {
      const details = await res.text();
      return new Response(
        JSON.stringify({ error: "Gmail API send failed", status: res.status, details }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await res.json();

    let dbInserted = false;
    let dbError: string | null = null;

    const SUPABASE_URL = Deno.env.get("FUNCTION_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("FUNCTION_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (SUPABASE_URL && SERVICE_ROLE_KEY && userId && messageId) {
      try {
        const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

        const { error: insertError } = await supabaseAdmin.from("message_replies").insert({
          message_id: messageId,
          user_id: userId,
          body: replyBody || body,
          via_channel: "Email",
          external_id: data.id || null,
          status: "sent",
        });

        if (insertError) {
          dbError = `insert failed: ${insertError.message}`;
        } else {
          const { error: updateError } = await supabaseAdmin.from("messages").update({ is_replied: true }).eq("id", messageId).eq("user_id", userId);
          if (updateError) {
            dbError = `reply inserted but is_replied update failed: ${updateError.message}`;
          } else {
            dbInserted = true;
          }
        }
      } catch (e) {
        dbError = `exception: ${(e as Error).message}`;
      }
    } else if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      dbError = "missing admin env vars";
    }

    return new Response(
      JSON.stringify({ message: "Email sent", id: data.id, threadId: data.threadId, dbInserted, dbError }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
