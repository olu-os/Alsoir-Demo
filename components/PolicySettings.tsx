import React, { useEffect, useState } from 'react';
import { BusinessPolicy } from '../types';
import { Save, Plus, Trash2, Undo2, Redo2 } from 'lucide-react';

interface PolicySettingsProps {
  policies: BusinessPolicy[];
  onUpdatePolicies: (policies: BusinessPolicy[]) => void;
  darkMode?: boolean;
}

const PolicySettings: React.FC<PolicySettingsProps> = ({ policies, onUpdatePolicies, darkMode }) => {
  const dm = darkMode ?? false;
  const [localPolicies, setLocalPolicies] = useState<BusinessPolicy[]>(policies);
  const [hasChanges, setHasChanges] = useState(false);
  const [undoStack, setUndoStack] = useState<BusinessPolicy[][]>([]);
  const [redoStack, setRedoStack] = useState<BusinessPolicy[][]>([]);

  useEffect(() => {
    if (hasChanges) return;
    setLocalPolicies(policies);
    setHasChanges(false);
    setUndoStack([]);
    setRedoStack([]);
  }, [policies, hasChanges]);

  const applyPoliciesUpdate = (nextPolicies: BusinessPolicy[]) => {
    setUndoStack((prev) => [...prev, localPolicies]);
    setRedoStack([]);
    setLocalPolicies(nextPolicies);
    setHasChanges(true);
  };

  const handleContentChange = (id: string, newContent: string) => {
    const updated = localPolicies.map(p => 
      p.id === id ? { ...p, content: newContent } : p
    );
    applyPoliciesUpdate(updated);
  };

  const handleTitleChange = (id: string, newTitle: string) => {
    const updated = localPolicies.map(p => 
      p.id === id ? { ...p, title: newTitle } : p
    );
    applyPoliciesUpdate(updated);
  };

  const handleAddPolicy = () => {
    const newPolicy: BusinessPolicy = {
        id: Date.now().toString(),
        title: 'New Policy',
        content: ''
    };
    applyPoliciesUpdate([...localPolicies, newPolicy]);
  };

  const handleDeletePolicy = (id: string) => {
    applyPoliciesUpdate(localPolicies.filter(p => p.id !== id));
  }

  const handleSave = () => {
    onUpdatePolicies(localPolicies);
    setHasChanges(false);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, localPolicies]);
    setLocalPolicies(previous);
    setHasChanges(true);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, localPolicies]);
    setLocalPolicies(next);
    setHasChanges(true);
  };

  return (
    <div className={`flex-1 p-6 pt-14 lg:pt-6 overflow-y-auto ${dm ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
            <h1 className={`text-2xl font-bold ${dm ? 'text-white' : 'text-slate-900'}`}>Policies</h1>
            <p className={`${dm ? 'text-slate-400' : 'text-slate-500'} mt-1`}>These policies are used by the AI to generate accurate replies.</p>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className={`flex items-center space-x-2 px-3 py-2 border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${dm ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <Undo2 className="w-4 h-4" />
                <span className="text-sm">Undo</span>
              </button>
              <button
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className={`flex items-center space-x-2 px-3 py-2 border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${dm ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <Redo2 className="w-4 h-4" />
                <span className="text-sm">Redo</span>
              </button>
              <div className="flex-1" />
              <button
                onClick={handleSave}
                disabled={!hasChanges}
                className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </button>
            </div>
        </div>

        <div className="space-y-6">
          {localPolicies.map((policy) => (
            <div key={policy.id} className={`rounded-xl shadow-sm overflow-hidden ${dm ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-slate-200'}`}>
              <div className={`px-6 py-4 border-b flex justify-between items-center ${dm ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                <input 
                    type="text" 
                    value={policy.title}
                    onChange={(e) => handleTitleChange(policy.id, e.target.value)}
                    className={`bg-transparent font-semibold focus:outline-none focus:border-b border-indigo-500 w-1/2 ${dm ? 'text-white' : 'text-slate-800'}`}
                />
                <button 
                    onClick={() => handleDeletePolicy(policy.id)}
                    className={`${dm ? 'text-slate-500 hover:text-red-400' : 'text-slate-400 hover:text-red-500'} transition-colors`}
                >
                    <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6">
                <textarea
                  value={policy.content}
                  onChange={(e) => handleContentChange(policy.id, e.target.value)}
                  className={`w-full h-32 p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm leading-relaxed ${dm ? 'bg-slate-800 border-slate-700 text-slate-300 placeholder-slate-500' : 'bg-white border-slate-200'}`}
                  placeholder="Enter policy details here (e.g., 'We offer refunds within 30 days...')"
                />
                <div className={`mt-2 text-xs ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
                    The AI will use this text to answer questions related to "{policy.title}".
                </div>
              </div>
            </div>
          ))}

          <button 
            onClick={handleAddPolicy}
            className={`w-full py-4 border-2 border-dashed rounded-xl font-medium transition-colors flex items-center justify-center space-x-2 ${dm ? 'border-slate-700 text-slate-400 hover:border-indigo-500 hover:text-indigo-400 bg-slate-900/50' : 'border-slate-300 text-slate-500 hover:border-indigo-500 hover:text-indigo-600 bg-slate-50/50'}`}
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
