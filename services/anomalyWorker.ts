import { supabase } from './supabaseClient';
import { AppEvent } from '../types';
import { analyzeAnomaly } from './incidentService';

/**
 * Anomaly Worker — Layer 3
 *
 * Subscribes to Supabase Realtime INSERT events on `app_events`.
 * Applies rule-based anomaly detection and triggers AI incident analysis
 * when thresholds are breached. Never renders or exposes data to end users.
 */

const HIGH_LATENCY_THRESHOLD_MS = 3000;
const ERROR_SPIKE_WINDOW = 5;
const SPIKE_TIME_WINDOW_MS = 5 * 60 * 1000;

// Rolling buffer of recent events for spike detection (in-memory, per session)
const recentEvents: AppEvent[] = [];
const MAX_BUFFER = 20;

function checkAnomalies(event: AppEvent): string[] {
  const flags: string[] = [];

  if (event.latency_ms && event.latency_ms > HIGH_LATENCY_THRESHOLD_MS) {
    flags.push('HIGH_LATENCY');
  }

  if (event.status === 'failed') {
    flags.push('AI_FAILURE');
  }

  // Error spike: 3+ failures of the same type within the time window
  const now = Date.now();
  const recentOfType = recentEvents
    .filter((e) => e.type === event.type && e.status === 'failed' &&
      e.created_at && (now - new Date(e.created_at).getTime()) < SPIKE_TIME_WINDOW_MS);
  if (recentOfType.length >= 3) {
    flags.push('ERROR_SPIKE');
  }

  // Fallback spike: 3+ fallbacks within the time window
  const recentFallbacks = recentEvents
    .filter((e) => e.status === 'fallback' &&
      e.created_at && (now - new Date(e.created_at).getTime()) < SPIKE_TIME_WINDOW_MS);
  if (recentFallbacks.length >= 3) {
    flags.push('FALLBACK_SPIKE');
  }

  return flags;
}

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

const COOLDOWN_MS = 60_000;
const lastTriggered: Record<string, number> = {};

function dedupeFlags(flags: string[]): string[] {
  const now = Date.now();
  return flags.filter((flag) => {
    if (now - (lastTriggered[flag] ?? 0) < COOLDOWN_MS) return false;
    lastTriggered[flag] = now;
    return true;
  });
}

export function startAnomalyWorker(userId: string): void {
  if (realtimeChannel) return; // Already running

  realtimeChannel = supabase
    .channel(`anomaly_worker:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'app_events',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const event = payload.new as AppEvent;

        recentEvents.push(event);
        if (recentEvents.length > MAX_BUFFER) recentEvents.shift();

        const flags = checkAnomalies(event);
        const dedupedFlags = dedupeFlags(flags);
        if (dedupedFlags.length > 0) {
          console.log('[anomalyWorker] Anomaly detected:', dedupedFlags, event);
          analyzeAnomaly([...recentEvents.slice(-ERROR_SPIKE_WINDOW)], dedupedFlags).catch((e) => {
            console.warn('[anomalyWorker] analyzeAnomaly failed:', e);
          });
        }
      }
    )
    .subscribe();
}

export function stopAnomalyWorker(): void {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  recentEvents.length = 0;
  Object.keys(lastTriggered).forEach((k) => delete lastTriggered[k]);
}
