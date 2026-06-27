import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GMAIL_MODIFY_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { providerToken, messageId, action, userId } = await req.json();

    if (!providerToken) {
      return jsonResponse({ error: "Missing providerToken" }, 400);
    }

    if (!messageId || !action) {
      return jsonResponse({ error: "Missing required fields: messageId, action" }, 400);
    }

    if (!["trash", "restore"].includes(action)) {
      return jsonResponse({ error: "Invalid action. Must be 'trash' or 'restore'" }, 400);
    }

    const addLabelIds = action === "trash" ? ["TRASH"] : ["INBOX"];
    const removeLabelIds = action === "trash" ? ["INBOX"] : ["TRASH"];

    const res = await fetch(`${GMAIL_MODIFY_URL}/${messageId}/modify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    });

    if (!res.ok) {
      const details = await res.text();
      console.error("Gmail modify failed:", res.status, details);
      return jsonResponse(
        { error: "Gmail API modify failed", status: res.status, details },
        res.status === 401 ? 401 : 502,
      );
    }

    const SUPABASE_URL = Deno.env.get("FUNCTION_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("FUNCTION_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (SUPABASE_URL && SERVICE_ROLE_KEY && userId) {
      const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

      const { data: current } = await supabaseAdmin
        .from("messages")
        .select("metadata")
        .eq("id", messageId)
        .eq("user_id", userId)
        .single();

      const existingMetadata = (current as any)?.metadata || {};

      if (action === "trash") {
        await supabaseAdmin
          .from("messages")
          .update({
            metadata: {
              ...existingMetadata,
              trashed: true,
              trashed_at: new Date().toISOString(),
            },
          })
          .eq("id", messageId)
          .eq("user_id", userId);
      } else {
        const newMetadata = { ...existingMetadata };
        delete newMetadata.trashed;
        delete newMetadata.trashed_at;
        await supabaseAdmin
          .from("messages")
          .update({ metadata: newMetadata })
          .eq("id", messageId)
          .eq("user_id", userId);
      }
    }

    return jsonResponse({
      message: `Message ${action === "trash" ? "trashed" : "restored"} successfully`,
      messageId,
      action,
    });
  } catch (error) {
    console.error("Function Error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
