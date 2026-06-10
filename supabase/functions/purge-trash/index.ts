import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const SUPABASE_URL = Deno.env.get("FUNCTION_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("FUNCTION_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing Supabase admin secrets" }, 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: trashedMessages, error: fetchError } = await supabaseAdmin
      .from("messages")
      .select("id, user_id, metadata")
      .filter("metadata->>trashed", "eq", "true");

    if (fetchError) {
      console.error("Failed to fetch trashed messages:", fetchError);
      return jsonResponse({ error: "Failed to fetch trashed messages" }, 500);
    }

    if (!trashedMessages || trashedMessages.length === 0) {
      return jsonResponse({ message: "No trashed messages found", purged: 0 });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const toPurge: string[] = [];
    for (const msg of trashedMessages) {
      const metadata = (msg as any).metadata || {};
      const trashedAt = metadata.trashed_at ? new Date(metadata.trashed_at) : null;
      if (!trashedAt || trashedAt < thirtyDaysAgo) {
        toPurge.push(msg.id);
      }
    }

    if (toPurge.length === 0) {
      return jsonResponse({ message: "No messages eligible for purge", purged: 0 });
    }

    const batchSize = 50;
    let purgedCount = 0;

    for (let i = 0; i < toPurge.length; i += batchSize) {
      const batch = toPurge.slice(i, i + batchSize);
      const { error: deleteError } = await supabaseAdmin
        .from("messages")
        .delete()
        .in("id", batch);

      if (deleteError) {
        console.error("Failed to purge batch:", deleteError);
      } else {
        purgedCount += batch.length;
      }
    }

    console.log(`Purged ${purgedCount} messages from trash`);

    return jsonResponse({
      message: `Purged ${purgedCount} messages`,
      purged: purgedCount,
      totalTrashed: trashedMessages.length,
    });
  } catch (error) {
    console.error("Function Error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
