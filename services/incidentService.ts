import { supabase } from './supabaseClient';
import { AppEvent, Incident } from '../types';

const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
const SUPABASE_FUNCTIONS_URL = env.VITE_SUPABASE_FUNCTIONS_URL || '';
const LLM_PROVIDER = env.VITE_LLM_PROVIDER || env.LLM_PROVIDER || '';
const OLLAMA_BASE_URL = (env.VITE_OLLAMA_BASE_URL as string | undefined) || 'http://localhost:11434';
const OLLAMA_CHAT_MODEL = (env.VITE_OLLAMA_CHAT_MODEL as string | undefined) || 'gpt-oss:120b-cloud';

/**
 * Incident Service — Reliability Layer 3
 *
 * Sends flagged events to Groq (or Ollama in dev) for SRE-style root cause analysis,
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

  const scopeErrorEvent = events.find(
    (e) =>
      e.type === 'SYNC_GMAIL' &&
      e.status === 'failed' &&
      e.error &&
      /insufficient.*(?:scope|permission)|ACCESS_TOKEN_SCOPE_INSUFFICIENT|403/i.test(e.error)
  );

  if (scopeErrorEvent) {
    return {
      incident: 'Gmail sync failed — OAuth scope missing',
      rootCause:
        'The user\'s Google OAuth token is missing the required `gmail.readonly` scope. The app requests it during sign-in, but the user may have declined the permission prompt or the Google Cloud OAuth consent screen does not include this scope.',
      severity: 'high',
      fix:
        '1) In Google Cloud Console > APIs & Services > OAuth consent screen, add `https://www.googleapis.com/auth/gmail.readonly` to the scopes. ' +
        '2) In Supabase Dashboard > Authentication > Google Provider, ensure the scope is listed under "Authorized scopes". ' +
        '3) Ask the user to sign out and sign in again, accepting the Gmail permission prompt when presented.',
    };
  }

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

const buildIncidentPrompt = (events: AppEvent[], flags: string[]): string =>
  `You are an SRE incident analyst reviewing application telemetry events.\n\nAnomaly flags detected: ${(flags || []).join(', ')}\n\nRecent events:\n${JSON.stringify(events || [], null, 2)}\n\nBased on these events, provide:\n1. A concise incident title (1 sentence)\n2. Root cause hypothesis\n3. Severity: one of low, medium, high, critical\n4. Suggested fix or next action\n\nReturn ONLY valid JSON in this exact shape:\n{\n  "incident": "<title>",\n  "rootCause": "<root cause>",\n  "severity": "low|medium|high|critical",\n  "fix": "<suggested fix>"\n}`;

const parseIncidentJson = (content: string): GroqIncidentResponse | null => {
  try {
    return JSON.parse(content) as GroqIncidentResponse;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]) as GroqIncidentResponse; } catch {}
    }
  }
  return null;
};

async function callGroqIncidentAnalysis(events: AppEvent[], flags: string[]): Promise<GroqIncidentResponse | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/groq/analyze-incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, flags, userId }),
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

async function callOllamaIncidentAnalysis(events: AppEvent[], flags: string[]): Promise<GroqIncidentResponse | null> {
  try {
    const base = String(OLLAMA_BASE_URL).replace(/\/$/, '');
    const prompt = buildIncidentPrompt(events, flags);
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_CHAT_MODEL,
        stream: false,
        temperature: 0,
        messages: [
          { role: 'system', content: 'You are an expert SRE incident analyst. Return only JSON.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const json = await response.json();
    const content = json?.message?.content;
    if (!content) return null;
    return parseIncidentJson(content);
  } catch (e) {
    console.warn('[incidentService] Ollama call failed:', e);
    return null;
  }
}

export async function analyzeAnomaly(events: AppEvent[], flags: string[]): Promise<void> {
  const groqResult = LLM_PROVIDER === 'groq'
    ? await callGroqIncidentAnalysis(events, flags)
    : null;
  const ollamaResult = groqResult ?? await callOllamaIncidentAnalysis(events, flags);
  const analysis = ollamaResult ?? buildStaticIncident(events, flags);
  const usedProvider = groqResult ? 'groq' : ollamaResult ? 'ollama' : 'static';

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
      console.log('[incidentService] Incident created by ' + usedProvider + ':', analysis.incident, `[${analysis.severity}]`);
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
