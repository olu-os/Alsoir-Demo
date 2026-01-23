import React from 'react';
import { Message, MessageCategory, ResponseCost } from '../types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

interface AnalyticsProps {
  messages: Message[];
}

const COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6'];

const Analytics: React.FC<AnalyticsProps> = ({ messages }) => {
  // Calculate data for Category Distribution
  const categoryData = Object.values(MessageCategory).map(cat => ({
    name: cat,
    value: messages.filter(m => m.category === cat).length
  })).filter(d => d.value > 0);

    // Calculate data for Urgency (predictedCost)
    const urgencyData = Object.values(ResponseCost).map(cost => ({
        name: cost,
        value: messages.filter(m => m.predictedCost === cost).length
    }));

    // Mock response time data (simulated based on categories)
  const responseTimeData = [
    { name: 'Shipping', time: 24 },
    { name: 'Returns', time: 18 },
    { name: 'Product', time: 12 },
    { name: 'Custom', time: 48 },
  ];

  const totalMessages = messages.length;
  const pendingMessages = messages.filter(m => !m.isReplied).length;
    // Calculate the most common urgency, empty if no messages
    const mostCommonUrgency = messages.length === 0
      ? ''
      : urgencyData.reduce((a, b) => (a.value > b.value ? a : b), { name: '', value: 0 }).name || 'Low';

  return (
    <div className="flex-1 bg-slate-50 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Inbox Analytics</h1>
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-slate-500 text-sm font-medium mb-2">Total Volume</h3>
                <div className="text-3xl font-bold text-slate-900">{totalMessages}</div>
                <div className="text-xs text-green-600 mt-1 flex items-center">
                    <span className="font-bold">+12%</span>
                    <span className="text-slate-400 ml-1">vs last week</span>
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-slate-500 text-sm font-medium mb-2">Pending Responses</h3>
                <div className="text-3xl font-bold text-slate-900">{pendingMessages}</div>
                <div className="text-xs text-amber-600 mt-1 flex items-center">
                    <span className="font-bold">Needs Action</span>
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-slate-500 text-sm font-medium mb-2">Most Common Urgency</h3>
                <div className="text-3xl font-bold text-slate-900">{mostCommonUrgency}</div>
                <div className="text-xs text-slate-400 mt-1">Based on predicted response cost of Inaction</div>
            </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Category Distribution */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                <h3 className="text-lg font-semibold text-slate-800 mb-6">Issue Categories</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={categoryData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {categoryData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Urgency (Predicted Cost) Analysis */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                <h3 className="text-lg font-semibold text-slate-800 mb-6">Urgency (Predicted Cost  of Inaction)</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={urgencyData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} />
                            <YAxis axisLine={false} tickLine={false} />
                            <Tooltip cursor={{fill: '#f1f5f9'}} />
                            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
