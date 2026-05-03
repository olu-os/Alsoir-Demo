import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { fetchIncidents, updateIncidentStatus } from '../services/incidentService';
import { AppEvent, Incident } from '../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';
import { AlertTriangle, CheckCircle, Clock, Zap, Activity, ShieldAlert } from 'lucide-react';

/**
 * InternalDashboard — Layer 2 (Internal/engineer-facing only)
 *
 * Shows real telemetry data: AI reliability, latency trends, fallback rates,
 * error rates, and AI-generated incidents. Gated behind /internal route.
 * Never shown to end users.
 */

interface InternalDashboardProps {
  userId: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-50 text-red-600 border border-red-200',
  investigating: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  resolved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

const InternalDashboard: React.FC<InternalDashboardProps> = ({ userId }) => {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    loadData();
  }, [userId]);

  const loadData = async () => {
    setLoading(true);
    const [eventsRes, incidentsData] = await Promise.all([
      supabase
        .from('app_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200),
      fetchIncidents(userId),
    ]);
    setEvents((eventsRes.data ?? []) as AppEvent[]);
    setIncidents(incidentsData);
    setLoading(false);
  };

  // --- Derived metrics ---
  const totalEvents = events.length;
  const successEvents = events.filter((e) => e.status === 'success').length;
  const failedEvents = events.filter((e) => e.status === 'failed').length;
  const fallbackEvents = events.filter((e) => e.status === 'fallback').length;
  const reliabilityRate = totalEvents > 0 ? Math.round((successEvents / totalEvents) * 100) : 100;
  const fallbackRate = totalEvents > 0 ? Math.round((fallbackEvents / totalEvents) * 100) : 0;
  const avgLatency = events.filter((e) => e.latency_ms).length > 0
    ? Math.round(events.filter((e) => e.latency_ms).reduce((sum, e) => sum + (e.latency_ms ?? 0), 0) / events.filter((e) => e.latency_ms).length)
    : 0;
  const openIncidents = incidents.filter((i) => i.status !== 'resolved').length;

  // Latency trend: last 20 events with latency, grouped by time
  const latencyTrend = events
    .filter((e) => e.latency_ms && e.created_at)
    .slice(0, 20)
    .reverse()
    .map((e, i) => ({
      i: i + 1,
      latency: e.latency_ms,
      type: e.type,
    }));

  // Event type breakdown
  const typeBreakdown = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});
  const typeChartData = Object.entries(typeBreakdown).map(([name, count]) => ({ name, count }));

  // Provider usage
  const groqEvents = events.filter((e) => (e.payload as any)?.provider === 'groq').length;
  const ollamaEvents = events.filter((e) => (e.payload as any)?.provider === 'ollama').length;
  const templateEvents = events.filter((e) => (e.payload as any)?.provider === 'template').length;

  const handleStatusChange = async (incidentId: string, status: Incident['status']) => {
    await updateIncidentStatus(incidentId, status);
    setIncidents((prev) => prev.map((i) => i.id === incidentId ? { ...i, status } : i));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950 text-slate-400">
        <Activity className="w-8 h-8 animate-pulse mr-3" />
        <span>Loading telemetry...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-950 text-slate-100 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center space-x-3 mb-8">
          <ShieldAlert className="w-7 h-7 text-indigo-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Internal Observability Dashboard</h1>
            <p className="text-slate-500 text-sm">SRE / Engineer view — not visible to end users</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KpiCard icon={<CheckCircle className="w-5 h-5 text-emerald-400" />} label="AI Reliability" value={`${reliabilityRate}%`} sub={`${successEvents}/${totalEvents} ops`} color="emerald" />
          <KpiCard icon={<Zap className="w-5 h-5 text-yellow-400" />} label="Fallback Rate" value={`${fallbackRate}%`} sub={`${fallbackEvents} fallbacks`} color="yellow" />
          <KpiCard icon={<Clock className="w-5 h-5 text-blue-400" />} label="Avg Latency" value={avgLatency > 0 ? `${avgLatency}ms` : '—'} sub="across all AI ops" color="blue" />
          <KpiCard icon={<AlertTriangle className="w-5 h-5 text-red-400" />} label="Open Incidents" value={String(openIncidents)} sub={`${failedEvents} failed ops`} color="red" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Latency trend */}
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
            <h3 className="text-slate-300 font-semibold mb-4 text-sm">Latency Trend (last 20 ops)</h3>
            {latencyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={latencyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="i" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} unit="ms" />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                  <Line type="monotone" dataKey="latency" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="No latency data yet" />
            )}
          </div>

          {/* Event type breakdown */}
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
            <h3 className="text-slate-300 font-semibold mb-4 text-sm">Event Type Breakdown</h3>
            {typeChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={typeChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} width={160} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="No events logged yet" />
            )}
          </div>
        </div>

        {/* Provider usage */}
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 mb-8">
          <h3 className="text-slate-300 font-semibold mb-3 text-sm">AI Provider Usage</h3>
          <div className="flex space-x-6">
            <ProviderStat label="Groq" count={groqEvents} color="indigo" />
            <ProviderStat label="Ollama" count={ollamaEvents} color="purple" />
            <ProviderStat label="Template fallback" count={templateEvents} color="slate" />
          </div>
        </div>

        {/* Incidents Table */}
        <div className="bg-slate-900 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <h3 className="text-slate-300 font-semibold text-sm">AI-Generated Incidents</h3>
            <button
              onClick={loadData}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Refresh
            </button>
          </div>
          {incidents.length === 0 ? (
            <div className="p-8 text-center text-slate-600 text-sm">No incidents recorded</div>
          ) : (
            <div className="divide-y divide-slate-800">
              {incidents.map((incident) => (
                <div key={incident.id} className="px-5 py-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[incident.severity]}`}>
                        {incident.severity}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[incident.status]}`}>
                        {incident.status}
                      </span>
                    </div>
                    <span className="text-xs text-slate-600">
                      {incident.created_at ? new Date(incident.created_at).toLocaleString() : ''}
                    </span>
                  </div>
                  <p className="text-slate-200 font-medium text-sm mb-1">{incident.title}</p>
                  {incident.root_cause && (
                    <p className="text-slate-500 text-xs mb-1"><span className="text-slate-400">Root cause:</span> {incident.root_cause}</p>
                  )}
                  {incident.suggested_fix && (
                    <p className="text-slate-500 text-xs mb-2"><span className="text-slate-400">Fix:</span> {incident.suggested_fix}</p>
                  )}
                  {incident.status !== 'resolved' && incident.id && (
                    <div className="flex space-x-2 mt-2">
                      {incident.status === 'open' && (
                        <button onClick={() => handleStatusChange(incident.id!, 'investigating')} className="text-xs px-2 py-1 bg-yellow-900/40 text-yellow-400 rounded hover:bg-yellow-900/60 transition-colors">
                          Investigate
                        </button>
                      )}
                      <button onClick={() => handleStatusChange(incident.id!, 'resolved')} className="text-xs px-2 py-1 bg-emerald-900/40 text-emerald-400 rounded hover:bg-emerald-900/60 transition-colors">
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: string; sub: string; color: string }> = ({ icon, label, value, sub }) => (
  <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
    <div className="flex items-center space-x-2 mb-2">
      {icon}
      <span className="text-slate-400 text-xs font-medium">{label}</span>
    </div>
    <div className="text-2xl font-bold text-white">{value}</div>
    <div className="text-slate-600 text-xs mt-0.5">{sub}</div>
  </div>
);

const ProviderStat: React.FC<{ label: string; count: number; color: string }> = ({ label, count, color }) => (
  <div className="flex items-center space-x-2">
    <div className={`w-2.5 h-2.5 rounded-full bg-${color}-500`} />
    <span className="text-slate-400 text-sm">{label}:</span>
    <span className="text-white font-semibold text-sm">{count}</span>
  </div>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="h-[200px] flex items-center justify-center text-slate-600 text-sm">{label}</div>
);

export default InternalDashboard;
