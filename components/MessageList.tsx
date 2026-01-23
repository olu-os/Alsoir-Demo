import React from 'react';
import { Message, MessageCategory, ResponseCost, Channel } from '../types';
import { Search, Filter, Instagram, Mail, ShoppingBag, Check } from 'lucide-react';
import { filterMessagesBySearch, filterMessagesByFeature } from '../services/filterMessages';

interface MessageListProps {
  messages: Message[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  onManualSync: () => void;
  showSyncedToast: boolean;
  drafts: { [id: string]: string };
  demoMode?: boolean;
}

const getChannelIcon = (channel: Channel) => {
  switch (channel) {
    case Channel.Instagram: return <Instagram className="w-4 h-4 text-pink-600" />;
    case Channel.Email: return <Mail className="w-4 h-4 text-blue-600" />;
    case Channel.Etsy: return <span className="text-xs font-bold text-orange-600">E</span>;
    case Channel.Shopify: return <ShoppingBag className="w-4 h-4 text-green-600" />;
    default: return <Mail className="w-4 h-4" />;
  }
};

const getCategoryColor = (cat: MessageCategory) => {
  switch (cat) {
    case MessageCategory.Complaint: return 'bg-red-100 text-red-800 border-red-200';
    case MessageCategory.Shipping: return 'bg-blue-100 text-blue-800 border-blue-200';
    case MessageCategory.Custom: return 'bg-purple-100 text-purple-800 border-purple-200';
    default: return 'bg-slate-100 text-slate-800 border-slate-200';
  }
};

const getCostIndicator = (cost: ResponseCost) => {
    switch(cost) {
        case ResponseCost.High: return <div className="w-2 h-2 rounded-full bg-red-500" title="High Urgency" />;
        case ResponseCost.Medium: return <div className="w-2 h-2 rounded-full bg-yellow-500" title="Medium Urgency" />;
        default: return <div className="w-2 h-2 rounded-full bg-green-500" title="Low Urgency" />;
    }
}

const MessageList: React.FC<MessageListProps> = ({ messages, selectedId, onSelect, isLoading, onManualSync, showSyncedToast, drafts, demoMode }) => {
  const [filter, setFilter] = React.useState('');
  const [selectedCategories, setSelectedCategories] = React.useState<MessageCategory[]>([]);
  const [selectedUrgencies, setSelectedUrgencies] = React.useState<ResponseCost[]>([]);
  const [isFilterExpanded, setIsFilterExpanded] = React.useState(false);
  const [selectedIdx, setSelectedIdx] = React.useState<number>(-1);
  const listRef = React.useRef<HTMLDivElement>(null);

  const filteredMessages = React.useMemo(() => {
    let result = filterMessagesBySearch(messages, filter);
    result = filterMessagesByFeature(result, { categories: selectedCategories, urgencies: selectedUrgencies });
    return result;
  }, [messages, filter, selectedCategories, selectedUrgencies]);

  const toggleCategory = (cat: MessageCategory) => {
    setSelectedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const toggleUrgency = (cost: ResponseCost) => {
    setSelectedUrgencies(prev => 
      prev.includes(cost) ? prev.filter(c => c !== cost) : [...prev, cost]
    );
  };

  // Keep selectedIdx in sync with selectedId
  React.useEffect(() => {
    const idx = filteredMessages.findIndex(m => m.id === selectedId);
    setSelectedIdx(idx);
  }, [selectedId, filteredMessages]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      if (filteredMessages.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        let nextIdx = selectedIdx < filteredMessages.length - 1 ? selectedIdx + 1 : 0;
        setSelectedIdx(nextIdx);
        onSelect(filteredMessages[nextIdx].id);
        scrollToMessage(nextIdx);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        let prevIdx = selectedIdx > 0 ? selectedIdx - 1 : filteredMessages.length - 1;
        setSelectedIdx(prevIdx);
        onSelect(filteredMessages[prevIdx].id);
        scrollToMessage(prevIdx);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line
  }, [filteredMessages, selectedIdx, onSelect]);

  // Scroll selected message into view
  const scrollToMessage = (idx: number) => {
    if (!listRef.current) return;
    const btns = listRef.current.querySelectorAll('button[data-msg-idx]');
    if (btns[idx]) {
      (btns[idx] as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-full md:w-80 lg:w-96">
      <div className="p-4 border-b border-slate-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-800">
            Inbox {demoMode && <span className="text-indigo-600">(Demo Mode)</span>}
          </h2>
          <div className="flex items-center">
            {showSyncedToast && (
              <div className="bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap animate-fade-in-out mr-0">
                Messages Synced
              </div>
            )}
            <button 
              onClick={onManualSync} 
              disabled={isLoading}
              className="p-2 rounded-md hover:bg-slate-100 text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Sync Emails"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isLoading ? 'animate-spin [animation-duration:3s]' : ''}
              >
                <path d="M21 12a9 9 0 1 1-3.05-6.64" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search messages..." 
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
            <span>{filteredMessages.length} messages</span>
            <button 
              onClick={() => setIsFilterExpanded(!isFilterExpanded)}
              className={`flex items-center hover:text-slate-800 transition-colors ${isFilterExpanded || selectedCategories.length > 0 || selectedUrgencies.length > 0 ? 'text-indigo-600 font-medium' : ''}`}
            >
                <Filter className="w-3 h-3 mr-1" /> Filter
                {(selectedCategories.length > 0 || selectedUrgencies.length > 0) && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-indigo-600" />}
            </button>
        </div>

        {isFilterExpanded && (
          <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Category Filter */}
            <div>
              <label className="block text-xs uppercase tracking-wider font-bold text-slate-900 mb-2">Categories</label>
              <div className="flex flex-wrap gap-2">
                {Object.values(MessageCategory).map(cat => (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${selectedCategories.includes(cat) ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Urgency Filter */}
            <div>
              <label className="block text-xs uppercase tracking-wider font-bold text-slate-900 mb-2">Urgency</label>
              <div className="flex gap-2">
                {Object.values(ResponseCost).map(cost => (
                  <button
                    key={cost}
                    onClick={() => toggleUrgency(cost)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${selectedUrgencies.includes(cost) ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                  >
                    {cost}
                  </button>
                ))}
              </div>
            </div>

            {(selectedCategories.length > 0 || selectedUrgencies.length > 0) && (
              <button 
                onClick={() => {
                  setSelectedCategories([]);
                  setSelectedUrgencies([]);
                }}
                className="w-full py-2 text-xs text-indigo-600 hover:text-indigo-700 font-semibold transition-colors border-t border-slate-200 mt-2 pt-2"
              >
                Clear All Filters
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto" ref={listRef} tabIndex={0}>
        {isLoading && filteredMessages.length === 0 ? (
           <div className="p-8 text-center text-slate-400 text-sm">Analyzing incoming messages...</div>
        ) : (
          filteredMessages.map((msg, idx) => (
            <button
              key={msg.id}
              data-msg-idx={idx}
              onClick={() => onSelect(msg.id)}
              className={`w-full p-4 border-b text-left transition-colors hover:bg-slate-50 group focus:outline-none ${
                selectedId === msg.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'border-l-4 border-l-transparent'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center space-x-2">
                    {getChannelIcon(msg.channel)}
                    <span className={`font-semibold text-sm truncate max-w-[120px] ${!msg.isRead ? 'text-slate-900' : 'text-slate-600'}`}>
                        {msg.senderName}
                    </span>
                    {!msg.isRead && <span className="w-2 h-2 rounded-full bg-indigo-500"></span>}
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {new Date(msg.timestamp).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' })}
                </span>
              </div>
              <h4 className="text-xs font-medium text-slate-500 mb-1 truncate">{msg.subject || 'No Subject'}</h4>
              <p className="text-sm text-slate-600 line-clamp-2 mb-2">
                {msg.body}
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getCategoryColor(msg.category)}`}>
                      {msg.category}
                  </span>
                  {/* Show Drafting label if a draft exists for this message. */}
                  {drafts[msg.id] && (
                    <div className="text-xs text-indigo-600 font-medium mt-3">Drafting...</div>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                     <div className="flex items-center space-x-1" title={`Predicted Response Cost: ${msg.predictedCost}`}>
                        <span className="text-[10px] text-slate-400">Urgency:</span>
                        {getCostIndicator(msg.predictedCost)}
                     </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default MessageList;
