import React, { useState } from 'react';
import { BusinessPolicy } from '../types';
import { Save, Plus, Trash2 } from 'lucide-react';

interface PolicySettingsProps {
  policies: BusinessPolicy[];
  onUpdatePolicies: (policies: BusinessPolicy[]) => void;
}

const PolicySettings: React.FC<PolicySettingsProps> = ({ policies, onUpdatePolicies }) => {
  const [localPolicies, setLocalPolicies] = useState<BusinessPolicy[]>(policies);
  const [hasChanges, setHasChanges] = useState(false);

  const handleContentChange = (id: string, newContent: string) => {
    const updated = localPolicies.map(p => 
      p.id === id ? { ...p, content: newContent } : p
    );
    setLocalPolicies(updated);
    setHasChanges(true);
  };

  const handleTitleChange = (id: string, newTitle: string) => {
    const updated = localPolicies.map(p => 
      p.id === id ? { ...p, title: newTitle } : p
    );
    setLocalPolicies(updated);
    setHasChanges(true);
  };

  const handleAddPolicy = () => {
    const newPolicy: BusinessPolicy = {
        id: Date.now().toString(),
        title: 'New Policy',
        content: ''
    };
    setLocalPolicies([...localPolicies, newPolicy]);
    setHasChanges(true);
  };

  const handleDeletePolicy = (id: string) => {
    setLocalPolicies(localPolicies.filter(p => p.id !== id));
    setHasChanges(true);
  }

  const handleSave = () => {
    onUpdatePolicies(localPolicies);
    setHasChanges(false);
  };

  return (
    <div className="flex-1 bg-slate-50 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Business Policies</h1>
                <p className="text-slate-500 mt-1">These policies are used by the AI to generate accurate replies.</p>
            </div>
            <button
                onClick={handleSave}
                disabled={!hasChanges}
                className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
            </button>
        </div>

        <div className="space-y-6">
          {localPolicies.map((policy) => (
            <div key={policy.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <input 
                    type="text" 
                    value={policy.title}
                    onChange={(e) => handleTitleChange(policy.id, e.target.value)}
                    className="bg-transparent font-semibold text-slate-800 focus:outline-none focus:border-b border-indigo-500 w-1/2"
                />
                <button 
                    onClick={() => handleDeletePolicy(policy.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6">
                <textarea
                  value={policy.content}
                  onChange={(e) => handleContentChange(policy.id, e.target.value)}
                  className="w-full h-32 p-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm leading-relaxed"
                  placeholder="Enter policy details here (e.g., 'We offer refunds within 30 days...')"
                />
                <div className="mt-2 text-xs text-slate-400">
                    The AI will use this text to answer questions related to "{policy.title}".
                </div>
              </div>
            </div>
          ))}

          <button 
            onClick={handleAddPolicy}
            className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-medium hover:border-indigo-500 hover:text-indigo-600 transition-colors flex items-center justify-center space-x-2 bg-slate-50/50"
          >
            <Plus className="w-5 h-5" />
            <span>Add New Policy Section</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PolicySettings;
