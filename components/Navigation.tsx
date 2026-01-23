import React from 'react';
import { LayoutDashboard, Inbox, FileText, Settings, Sparkles, LogOut } from 'lucide-react';

interface NavigationProps {
  currentView: string;
  onChangeView: (view: string) => void;
  onLogout: () => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentView, onChangeView, onLogout }) => {
  const navItems = [
    { id: 'inbox', label: 'Inbox', icon: Inbox },
    { id: 'analytics', label: 'Analytics', icon: LayoutDashboard },
    { id: 'policies', label: 'Policies', icon: FileText },
  ];

  return (
    <div className="w-20 lg:w-64 bg-slate-900 text-slate-300 flex flex-col justify-between h-full border-r border-slate-800 transition-all duration-300">
      <div>
        <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-slate-800">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Sparkles className="w-6 h-6 text-white" />
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
              <span className="ml-3 font-medium hidden lg:block">{item.label}</span>
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
