import React from 'react';
import { AppSettings } from '../types';

interface SettingsPageProps {
  settings: AppSettings & { bulkReplyMode?: 'autoSend' | 'draft' };
  onUpdateSettings: (settings: AppSettings & { bulkReplyMode?: 'autoSend' | 'draft' }) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onUpdateSettings }) => {
    const setBulkReplyMode = (mode: 'autoSend' | 'draft') => {
      onUpdateSettings({ ...settings, bulkReplyMode: mode });
    };

  return (
    <div className="flex-1 bg-slate-50 p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500">Configure how SoloSupport AI interacts with your customers.</p>
        </header>

        <section className="space-y-6">
          {/* Bulk Reply Mode Setting */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-2">Bulk Reply Mode</h2>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setBulkReplyMode('draft')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${settings.bulkReplyMode === 'draft' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                Draft
              </button>
              <button
                onClick={() => setBulkReplyMode('autoSend')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${settings.bulkReplyMode === 'autoSend' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                Auto-Send
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">Choose whether bulk reply sends immediately or generates drafts for all selected recipients.</p>
          </div>

          {/* Business Info Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Identity</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
                <input
                  type="text"
                  value={settings.businessName}
                  onChange={(e) => onUpdateSettings({ ...settings, businessName: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. Acme Ceramics"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Signature</label>
                <textarea
                  value={settings.signature}
                  onChange={(e) => onUpdateSettings({ ...settings, signature: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                  placeholder="Best,&#10;The Acme Team"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
