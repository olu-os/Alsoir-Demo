import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

export function getRateLimitEnv() {
  const supabaseUrl = Deno.env.get("FUNCTION_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("FUNCTION_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return { supabaseUrl, serviceRoleKey };
}

export async function checkRateLimit(
  supabaseUrl: string,
  serviceRoleKey: string,
  key: string,
  userId: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  const { count, error: countError } = await supabase
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("key", key)
    .eq("user_id", userId)
    .gte("created_at", windowStart);

  if (countError) {
    console.warn("[rateLimit] count query failed:", countError);
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  const currentCount = count ?? 0;

  if (currentCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil(windowMs / 1000),
    };
  }

  const { error: insertError } = await supabase
    .from("rate_limits")
    .insert({ key, user_id: userId });

  if (insertError) {
    console.warn("[rateLimit] insert failed:", insertError);
  }

  return {
    allowed: true,
    remaining: limit - currentCount - 1,
    retryAfter: 0,
  };
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function rateLimitOrResponse(
  endpoint: string,
  userId: string,
  limit: number,
  windowMs: number
): Promise<Response | null> {
  const { supabaseUrl, serviceRoleKey } = getRateLimitEnv();
  if (!supabaseUrl || !serviceRoleKey) return null;

  const result = await checkRateLimit(supabaseUrl, serviceRoleKey, endpoint, userId, limit, windowMs);
  if (!result.allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded", retryAfter: result.retryAfter }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(result.retryAfter) } }
    );
  }
  return null;
}
