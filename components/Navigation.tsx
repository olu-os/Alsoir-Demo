import React from 'react';
import { Inbox, FileText, Settings, Sparkles, LogOut, ShieldAlert, ChartNoAxesCombined, Trash2  } from 'lucide-react';

interface NavigationProps {
  currentView: string;
  onChangeView: (view: string) => void;
  onLogout: () => void;
  activeIncidentCount: number;
}

const Navigation: React.FC<NavigationProps> = ({ currentView, onChangeView, onLogout, activeIncidentCount }) => {
  const navItems = [
    { id: 'inbox', label: 'Inbox', icon: Inbox },
    { id: 'policies', label: 'Policies', icon: FileText },
    { id: 'trash', label: 'Trash', icon: Trash2 },
    ...(import.meta.env.DEV ? [{ id: 'observability', label: 'Observability', icon: ChartNoAxesCombined  }] : []),
  ];

  return (
    <div className="w-20 lg:w-64 bg-slate-900 text-slate-300 flex flex-col justify-between h-full border-r border-slate-800 transition-all duration-300">
      <div>
        <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-slate-800">
          <div className="bg-indigo-600 p-0.5 rounded-lg">
            <img src="/logo.png" alt="Alsoir Logo" className="w-10 h-10" />
          </div>
          <span className="ml-3 font-bold text-white text-lg hidden lg:block">Alsoir</span>
        </div>

        <nav className="mt-6 px-2 lg:px-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onChangeView(item.id)}
              className={`w-full flex items-center p-3 rounded-lg transition-colors ${
                currentView === item.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon className="w-6 h-6 flex-shrink-0" />
              <span className="ml-3 font-medium hidden lg:block flex-2 text-left">{item.label}</span>
              {item.id === 'observability' && activeIncidentCount > 0 && (
                <span className="hidden lg:inline-flex items-center justify-center w-6 h-6 ml-3 bg-indigo-600 text-white-900 text-xs font-semibold rounded-full">
                  {activeIncidentCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={() => onChangeView('settings')}
          className={`w-full flex items-center p-3 rounded-lg transition-colors ${
            currentView === 'settings'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
              : 'hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Settings className="w-6 h-6 flex-shrink-0" />
          <span className="ml-3 font-medium hidden lg:block">Settings</span>
        </button>
        <button 
          onClick={onLogout}
          className="w-full flex items-center p-3 mt-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <LogOut className="w-6 h-6 flex-shrink-0" />
          <span className="ml-3 font-medium hidden lg:block">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Navigation;
