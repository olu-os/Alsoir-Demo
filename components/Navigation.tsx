import React from 'react';
import { Inbox, FileText, Settings, Sparkles, LogOut, ShieldAlert, ChartNoAxesCombined, Trash2  } from 'lucide-react';

interface NavigationProps {
  currentView: string;
  onChangeView: (view: string) => void;
  onLogout: () => void;
  activeIncidentCount: number;
  isOpen?: boolean;
  onClose?: () => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentView, onChangeView, onLogout, activeIncidentCount, isOpen, onClose }) => {
  const navItems = [
    { id: 'inbox', label: 'Inbox', icon: Inbox },
    { id: 'policies', label: 'Policies', icon: FileText },
    { id: 'trash', label: 'Trash', icon: Trash2 },
    ...(import.meta.env.DEV ? [{ id: 'observability', label: 'Observability', icon: ChartNoAxesCombined  }] : []),
  ];

  const handleNav = (view: string) => {
    onChangeView(view);
    onClose?.();
  };

  return (
    <div className={`
      fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 flex flex-col justify-between h-full border-r border-slate-800
      transform transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      lg:relative lg:translate-x-0 lg:w-64
    `}>
      <div>
        <div className="h-24 flex items-center justify-start px-4 border-b border-slate-800">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <img src="/logo.png" alt="Alsoir Logo" className="w-8 h-8" />
          </div>
          <span className="ml-3 font-bold text-white text-lg">Alsoir</span>
        </div>

        <nav className="mt-6 px-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center p-3 rounded-lg transition-colors ${
                currentView === item.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon className="w-6 h-6 flex-shrink-0" />
              <span className="ml-3 font-medium flex-2 text-left">{item.label}</span>
              {item.id === 'observability' && activeIncidentCount > 0 && (
                <span className="inline-flex items-center justify-center w-6 h-6 ml-3 bg-indigo-600 text-white-900 text-xs font-semibold rounded-full">
                  {activeIncidentCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={() => handleNav('settings')}
          className={`w-full flex items-center p-3 rounded-lg transition-colors ${
            currentView === 'settings'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
              : 'hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Settings className="w-6 h-6 flex-shrink-0" />
          <span className="ml-3 font-medium">Settings</span>
        </button>
        <button 
          onClick={() => { onLogout(); onClose?.(); }}
          className="w-full flex items-center p-3 mt-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <LogOut className="w-6 h-6 flex-shrink-0" />
          <span className="ml-3 font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Navigation;
