import React from 'react';
import { User } from '@supabase/supabase-js';
import { AppSettings } from '../types';
import PersonalityDropdown from './PersonalityDropdown';

interface SettingsPageProps {
  user: User | null;
  settings: AppSettings & { bulkReplyMode?: 'autoSend' | 'draft' };
  onUpdateSettings: (settings: AppSettings & { bulkReplyMode?: 'autoSend' | 'draft' }) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ user, settings, onUpdateSettings }) => {
    const dm = settings.darkMode;
    const setBulkReplyMode = (mode: 'autoSend' | 'draft') => {
      onUpdateSettings({ ...settings, bulkReplyMode: mode });
    };

  return (
    <div className={`flex-1 p-6 pt-14 lg:pt-6 overflow-y-auto ${dm ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className={`text-2xl font-bold ${dm ? 'text-white' : 'text-slate-900'}`}>Settings</h1>
          <p className={dm ? 'text-slate-400' : 'text-slate-500'}>Configure how Alsoir AI interacts with your customers.</p>
        </header>

        <section className="space-y-6">
          {/* Dark Mode */}
          <div className={`rounded-2xl border shadow-sm p-6 ${dm ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-lg font-bold ${dm ? 'text-white' : 'text-slate-800'}`}>Dark Mode</h2>
                <p className={`text-xs mt-1 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Use a dark color scheme across the app.</p>
              </div>
              <button
                onClick={() => onUpdateSettings({ ...settings, darkMode: !settings.darkMode })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${settings.darkMode ? 'bg-indigo-600' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition-transform ${settings.darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          {/* Bulk Reply Mode Setting */}
          <div className={`rounded-2xl border shadow-sm p-6 ${dm ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className={`text-lg font-bold mb-2 ${dm ? 'text-white' : 'text-slate-800'}`}>Bulk Reply Mode</h2>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setBulkReplyMode('draft')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${settings.bulkReplyMode === 'draft' ? 'bg-indigo-600 text-white' : dm ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'}`}
              >
                Draft
              </button>
              <button
                onClick={() => setBulkReplyMode('autoSend')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${settings.bulkReplyMode === 'autoSend' ? 'bg-indigo-600 text-white' : dm ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'}`}
              >
                Auto-Send
              </button>
            </div>
            <p className={`text-xs mt-2 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Choose whether bulk reply drafts or sends messages immediately.</p>
          </div>

          {/* Confirm Before Send */}
          <div className={`rounded-2xl border shadow-sm p-6 ${dm ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-lg font-bold ${dm ? 'text-white' : 'text-slate-800'}`}>Confirm Before Send</h2>
                <p className={`text-xs mt-1 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Replies show a confirmation step before sending.</p>
              </div>
              <button
                onClick={() => onUpdateSettings({ ...settings, confirmBeforeSend: !settings.confirmBeforeSend })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${settings.confirmBeforeSend ? 'bg-indigo-600' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition-transform ${settings.confirmBeforeSend ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          {/* AI Personality */}
          <div className={`rounded-2xl border shadow-sm p-6 ${dm ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className={`text-lg font-bold mb-2 ${dm ? 'text-white' : 'text-slate-800'}`}>AI Personality</h2>
            <div className="space-y-2">
              <PersonalityDropdown
                value={settings.aiPersonality || 'support'}
                onChange={(v) => onUpdateSettings({ ...settings, aiPersonality: v })}
                darkMode={dm}
              />
              <p className={`text-xs ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Changes the tone of generated drafts.</p>
            </div>
          </div>

          {/* Business Info Section */}
          <div className={`rounded-2xl border shadow-sm p-6 ${dm ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className={`text-lg font-bold mb-4 ${dm ? 'text-white' : 'text-slate-800'}`}>Identity</h2>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Business Name</label>
                <input
                  type="text"
                  value={settings.businessName}
                  onChange={(e) => onUpdateSettings({ ...settings, businessName: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none ${dm ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-200'}`}
                  placeholder="e.g. Acme Ceramics"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Email Signature</label>
                <textarea
                  value={settings.signature}
                  onChange={(e) => onUpdateSettings({ ...settings, signature: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none ${dm ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-200'}`}
                  placeholder="Best,&#10;The Acme Team"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Signed-in User Info */}
        {user && (
          <div className={`rounded-2xl border shadow-sm p-6 mt-6 ${dm ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className={`text-lg font-bold mb-2 ${dm ? 'text-white' : 'text-slate-800'}`}>Signed in as</h2>
            <div>
              <p className={`font-medium ${dm ? 'text-white' : 'text-slate-900'}`}>{user.user_metadata?.full_name || user.email}</p>
              <p className={`text-sm ${dm ? 'text-slate-400' : 'text-slate-500'}`}>{user.email}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
