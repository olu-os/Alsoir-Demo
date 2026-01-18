import React from 'react';
import { AppSettings, ResponseMode, MessageCategory } from '../types';
import { Bot, User, ShieldCheck, Zap, Info } from 'lucide-react';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onUpdateSettings }) => {
  const handleModeChange = (mode: ResponseMode): void => {
    onUpdateSettings({ ...settings, responseMode: mode });
  };

  const toggleCategory = (cat: MessageCategory): void => {
    const current: MessageCategory[] = settings.autoPilotCategories;
    const next: MessageCategory[] = current.includes(cat)
      ? current.filter((c: MessageCategory) => c !== cat)
      : [...current, cat];
    onUpdateSettings({ ...settings, autoPilotCategories: next });
  };

  return (
    <div className="flex-1 bg-slate-50 p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500">Configure how SoloSupport AI interacts with your customers.</p>
        </header>

        <section className="space-y-6">
          {/* Response Mode Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center space-x-2 mb-1">
                <Bot className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">AI Response Strategy</h2>
              </div>
              <p className="text-sm text-slate-500">Choose how much control you want over AI-generated replies.</p>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => handleModeChange(ResponseMode.Draft)}
                className={`flex flex-col p-4 rounded-xl border-2 text-left transition-all ${
                  settings.responseMode === ResponseMode.Draft
                    ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50'
                    : 'border-slate-100 hover:border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${settings.responseMode === ResponseMode.Draft ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <User className="w-5 h-5" />
                  </div>
                  {settings.responseMode === ResponseMode.Draft && <ShieldCheck className="w-5 h-5 text-indigo-600" />}
                </div>
                <h3 className="font-bold text-slate-900">Manual Review</h3>
                <p className="text-xs text-slate-500 mt-1">AI generates a draft, but you must click "Send".</p>
              </button>

              <button
                onClick={() => handleModeChange(ResponseMode.AutoSend)}
                className={`flex flex-col p-4 rounded-xl border-2 text-left transition-all ${
                  settings.responseMode === ResponseMode.AutoSend
                    ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50'
                    : 'border-slate-100 hover:border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${settings.responseMode === ResponseMode.AutoSend ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Zap className="w-5 h-5" />
                  </div>
                  {settings.responseMode === ResponseMode.AutoSend && <ShieldCheck className="w-5 h-5 text-indigo-600" />}
                </div>
                <h3 className="font-bold text-slate-900">Autopilot</h3>
                <p className="text-xs text-slate-500 mt-1">AI automatically sends replies based on your policies for selected categories.</p>
              </button>
            </div>

            {settings.responseMode === ResponseMode.AutoSend && (
              <div className="px-6 pb-6 animate-in fade-in slide-in-from-top-2">
                <div className="p-4 bg-sky-100 border border-sky-200 rounded-xl flex items-start space-x-3 mb-4">
                  <Info className="w-5 h-5 text-sky-900 shrink-0 mt-0.5" />
                  <p className="text-xs text-sky-900">
                    <strong>Note:</strong> Autopilot will reply instantly. We recommend only enabling this for low-risk categories like Shipping or General FAQs.
                  </p>
                </div>

                <h4 className="text-sm font-semibold text-slate-700 mb-3">Enable Autopilot for:</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.values(MessageCategory).map(cat => (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        settings.autoPilotCategories.includes(cat)
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
