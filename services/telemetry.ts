import { supabase } from './supabaseClient';
import { AppEvent, AppEventType, AppEventStatus } from '../types';

/**
 * Structured telemetry logger.
 * Writes events to the `app_events` table in Supabase.
 * Fire-and-forget — never throws, never blocks the caller.
 *
 * VISIBILITY: Internal only. These events are never shown to end users.
 */
export async function logEvent(
  type: AppEventType,
  status: AppEventStatus,
  payload?: Record<string, unknown>,
  latency_ms?: number,
  error?: string
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user_id = session?.user?.id;
    if (!user_id) return; // Don't log for unauthenticated sessions

    const event: AppEvent = {
      user_id,
      type,
      status,
      payload: payload ?? {},
      latency_ms,
      error,
    };

    const { error: dbError } = await supabase.from('app_events').insert(event);
    if (dbError) {
      console.warn('[telemetry] Failed to log event:', dbError.message);
    }
  } catch (e) {
    // Telemetry must never crash the app
    console.warn('[telemetry] logEvent threw:', e);
  }
}

/**
 * Convenience wrapper: times an async operation and logs the result.
 * Usage:
 *   const result = await withTelemetry('AI_DRAFT_GENERATED', { provider: 'groq' }, () => callGroq(...));
 */
export async function withTelemetry<T>(
  type: AppEventType,
  payload: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const latency_ms = Date.now() - start;
    logEvent(type, 'success', { ...payload, latency_ms }, latency_ms);
    return result;
  } catch (e: any) {
    const latency_ms = Date.now() - start;
    logEvent(type, 'failed', { ...payload, latency_ms }, latency_ms, e?.message ?? String(e));
    throw e;
  }
}
