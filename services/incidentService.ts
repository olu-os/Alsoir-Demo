import { supabase } from './supabaseClient';
import { AppEvent, Incident } from '../types';

const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
const SUPABASE_FUNCTIONS_URL = env.VITE_SUPABASE_FUNCTIONS_URL || '';

/**
 * Incident Service — Layer 3
 *
 * Sends flagged events to Groq for SRE-style root cause analysis,
 * then persists the resulting incident to the `incidents` table.
 */

interface GroqIncidentResponse {
  incident: string;
  rootCause: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  fix: string;
}

function buildStaticIncident(events: AppEvent[], flags: string[]): GroqIncidentResponse {
  const hasSpike = flags.includes('ERROR_SPIKE');
  const hasFailure = flags.includes('AI_FAILURE');
  const hasLatency = flags.includes('HIGH_LATENCY');
  const hasFallbackSpike = flags.includes('FALLBACK_SPIKE');
  const types = [...new Set(events.map((e) => e.type))].join(', ');

  const severity: GroqIncidentResponse['severity'] =
    hasSpike ? 'critical' : hasFailure ? 'high' : hasFallbackSpike ? 'medium' : hasLatency ? 'medium' : 'low';

  const incident = hasSpike
    ? `Repeated AI failures detected on ${types}`
    : hasFailure
    ? `AI operation failure on ${types}`
    : hasFallbackSpike
    ? `Primary AI provider degraded — repeated fallbacks to secondary provider`
    : `High latency detected on ${types}`;

  const rootCause = hasSpike
    ? 'Multiple consecutive failures of the same operation type suggest an upstream provider outage or invalid API credentials.'
    : hasFailure
    ? 'Single AI operation failed — possible transient provider error or malformed request.'
    : hasFallbackSpike
    ? 'Primary provider (Groq) failing repeatedly, forcing fallback to secondary provider. Likely a rate limit, API outage, or expired key.'
    : 'AI operation latency exceeded threshold — possible provider slowdown or large payload.';

  const fix = hasSpike
    ? 'Check Groq API key validity and provider status page.'
    : hasFailure
    ? 'Review error logs for the failed operation. Retry or switch provider if error persists.'
    : hasFallbackSpike
    ? 'Check https://status.groq.com. Verify GROQ_API_KEY is valid and not rate-limited.'
    : 'Reduce payload size or switch to a faster model. Monitor for continued latency.';

  return { incident, rootCause, severity, fix };
}

async function callGroqIncidentAnalysis(events: AppEvent[], flags: string[]): Promise<GroqIncidentResponse | null> {
  try {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/groq/analyze-incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, flags }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.incident) return null;
    return data as GroqIncidentResponse;
  } catch (e) {
    console.warn('[incidentService] Groq call failed:', e);
    return null;
  }
}

export async function analyzeAnomaly(events: AppEvent[], flags: string[]): Promise<void> {
  const analysis = (await callGroqIncidentAnalysis(events, flags)) ?? buildStaticIncident(events, flags);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user_id = session?.user?.id;
    if (!user_id) return;

    const incident: Incident = {
      user_id,
      title: analysis.incident,
      root_cause: analysis.rootCause,
      severity: analysis.severity,
      suggested_fix: analysis.fix,
      status: 'open',
      linked_event_ids: events.map((e) => e.id ?? '').filter(Boolean),
    };

    const { error } = await supabase.from('incidents').insert(incident);
    if (error) {
      console.warn('[incidentService] Failed to insert incident:', error.message);
    } else {
      console.log('[incidentService] Incident created:', analysis.incident, `[${analysis.severity}]`);
    }
  } catch (e) {
    console.warn('[incidentService] analyzeAnomaly threw:', e);
  }
}

export async function fetchIncidents(userId: string): Promise<Incident[]> {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[incidentService] fetchIncidents failed:', error.message);
    return [];
  }
  return (data ?? []) as Incident[];
}

export async function updateIncidentStatus(
  incidentId: string,
  status: Incident['status']
): Promise<void> {
  const { error } = await supabase
    .from('incidents')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', incidentId);
  if (error) {
    console.warn('[incidentService] updateIncidentStatus failed:', error.message);
  }
}
