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
const ERROR_SPIKE_WINDOW = 5; // number of recent events to check

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

  // Error spike: 3+ failures of the same type in the rolling buffer
  const recentOfType = recentEvents
    .slice(-ERROR_SPIKE_WINDOW)
    .filter((e) => e.type === event.type && e.status === 'failed');
  if (recentOfType.length >= 3) {
    flags.push('ERROR_SPIKE');
  }

  return flags;
}

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

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

        // Maintain rolling buffer
        recentEvents.push(event);
        if (recentEvents.length > MAX_BUFFER) recentEvents.shift();

        const flags = checkAnomalies(event);
        if (flags.length > 0) {
          console.log('[anomalyWorker] Anomaly detected:', flags, event);
          // Fire-and-forget: call Groq to analyze and create incident
          analyzeAnomaly([...recentEvents.slice(-ERROR_SPIKE_WINDOW)], flags).catch((e) => {
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
}
