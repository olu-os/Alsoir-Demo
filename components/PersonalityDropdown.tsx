import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Headset, AudioLines, Crown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

type Personality = 'support' | 'rapper' | 'medieval';

interface PersonalityDropdownProps {
  value: Personality;
  onChange: (value: Personality) => void;
  compact?: boolean;
  rightAlign?: boolean;
}

const PERSONALITIES: { id: Personality; label: string; description: string; icon: React.ReactNode }[] = [
  { id: 'support', label: 'Support', description: 'Professional support agent', icon: <Headset className="w-4 h-4" /> },
  { id: 'rapper', label: 'Rapper', description: 'Replies from the dome', icon: <AudioLines className="w-4 h-4" /> },
  { id: 'medieval', label: 'Medieval Alfred', description: 'Ye olde English tone', icon: <Crown className="w-4 h-4" /> },
];

const PersonalityDropdown: React.FC<PersonalityDropdownProps> = ({ value, onChange, compact, rightAlign }) => {
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
            ? 'h-8 px-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50'
            : 'px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 text-sm'
        }`}
      >
        <span className="flex items-center gap-1.5">
          {active.icon}
          {active.label}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`${rightAlign ? 'right-0 left-auto' : 'left-0'} absolute top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50`}
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
                      ? 'bg-indigo-50 text-indigo-950 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className={isActive ? 'text-indigo-600' : 'text-slate-400'}>{p.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{p.label}</div>
                    <div className="text-[11px] text-slate-400 truncate">{p.description}</div>
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
