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
  const analysis = await callGroqIncidentAnalysis(events, flags);
  if (!analysis) return;

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
