import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Headset, AudioLines, Crown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

type Personality = 'support' | 'rapper' | 'medieval';

interface PersonalityDropdownProps {
  value: Personality;
  onChange: (value: Personality) => void;
  compact?: boolean;
  rightAlign?: boolean;
  darkMode?: boolean;
}

const PERSONALITIES: { id: Personality; label: string; description: string; icon: React.ReactNode }[] = [
  { id: 'support', label: 'Support', description: 'Professional support agent', icon: <Headset className="w-4 h-4" /> },
  { id: 'rapper', label: 'Rapper', description: 'Replies from the dome', icon: <AudioLines className="w-4 h-4" /> },
  { id: 'medieval', label: 'Medieval Alfred', description: 'Ye olde English tone', icon: <Crown className="w-4 h-4" /> },
];

const PersonalityDropdown: React.FC<PersonalityDropdownProps> = ({ value, onChange, compact, rightAlign, darkMode }) => {
  const dm = darkMode ?? false;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const active = PERSONALITIES.find(p => p.id === value) ?? PERSONALITIES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
          compact
            ? `h-8 px-2 text-xs border rounded-lg ${dm ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`
            : `px-4 py-2 border rounded-lg text-sm ${dm ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`
        }`}
      >
        <span className={`flex items-center gap-1.5 ${dm ? 'text-slate-300' : 'text-slate-600'}`}>
          {active.icon}
          {active.label}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${dm ? 'text-slate-500' : 'text-slate-400'} ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`${rightAlign ? 'right-0 left-auto' : 'left-0'} absolute top-full mt-1 w-56 rounded-xl shadow-lg overflow-hidden z-50 ${
              dm ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'
            }`}
          >
            {PERSONALITIES.map(p => {
              const isActive = p.id === value;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                    isActive
                      ? dm ? 'bg-indigo-500/15 text-indigo-300 font-semibold' : 'bg-indigo-50 text-indigo-950 font-semibold'
                      : dm ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className={isActive ? 'text-indigo-400' : dm ? 'text-slate-500' : 'text-slate-400'}>{p.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{p.label}</div>
                    <div className={`text-[11px] truncate ${dm ? 'text-slate-500' : 'text-slate-400'}`}>{p.description}</div>
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PersonalityDropdown;
