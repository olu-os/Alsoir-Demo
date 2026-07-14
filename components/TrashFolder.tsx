import React, { useState } from 'react';
import { Message, Channel } from '../types';
import { Undo2, Trash2, Mail, Instagram, ShoppingBag, AlertTriangle, SquareCheck } from 'lucide-react';
import { decodeHtmlEntities } from '../services/text';

interface TrashFolderProps {
  trashedMessages: Message[];
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onBulkRestore: (ids: string[]) => void;
  onBulkDelete: (ids: string[]) => void;
  isLoading: boolean;
  darkMode?: boolean;
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

const getDaysUntilPurge = (trashedAt?: string): number | null => {
  if (!trashedAt) return null;
  const trashedDate = new Date(trashedAt);
  const purgeDate = new Date(trashedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diff = purgeDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
};

const TrashFolder: React.FC<TrashFolderProps> = ({
  trashedMessages,
  onRestore,
  onPermanentDelete,
  onBulkRestore,
  onBulkDelete,
  isLoading,
  darkMode,
}) => {
  const dm = darkMode ?? false;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === trashedMessages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trashedMessages.map(m => m.id)));
    }
  };

  const handleBulkRestore = () => {
    onBulkRestore(Array.from(selectedIds));
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  };

  const handleBulkDelete = () => {
    if (!confirmBulkDelete) {
      setConfirmBulkDelete(true);
      return;
    }
    onBulkDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  };

  const getTrashedAt = (msg: Message): string | undefined => {
    return msg.trashedAt;
  };

  return (
    <div className={`flex-1 flex flex-col h-full ${dm ? 'bg-slate-950' : 'bg-white'}`}>
      <div className={`p-4 pt-14 lg:pt-6 border-b ${dm ? 'border-slate-800' : 'border-slate-200'}`}>
        <h1 className={`text-2xl font-bold ${dm ? 'text-white' : 'text-slate-900'}`}>Trash</h1>
        <div className="flex items-center justify-between mt-1">
          <p className={`text-sm ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
            Messages are automatically deleted after 30 days
          </p>
          {trashedMessages.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className={`px-2 py-1.5 ml-3 text-xs font-medium rounded-lg transition-colors ${dm ? 'text-slate-300 bg-slate-800 hover:bg-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'}`}
            >
              {selectedIds.size === trashedMessages.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className={`mt-4 flex flex-wrap items-center gap-2 p-3 rounded-xl border ${dm ? 'bg-indigo-950/30 border-indigo-800' : 'bg-indigo-50 border-indigo-200'}`}>
            <span className={`text-sm font-medium ${dm ? 'text-indigo-300' : 'text-indigo-900'}`}>
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleBulkRestore}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium flex-shrink-0"
              >
                <Undo2 className="w-4 h-4" />
                <span>Restore</span>
              </button>
              {confirmBulkDelete ? (
                <>
                  <button
                    onClick={handleBulkDelete}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Confirm Delete
                  </button>
                  <button
                    onClick={() => setConfirmBulkDelete(false)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${dm ? 'text-slate-300 bg-slate-900 border-slate-700 hover:bg-slate-800' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={handleBulkDelete}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border transition-colors text-sm font-medium flex-shrink-0 ${dm ? 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className={`p-8 text-center text-sm ${dm ? 'text-slate-500' : 'text-slate-400'}`}>Loading trashed messages...</div>
        ) : trashedMessages.length === 0 ? (
          <div className="p-12 text-center">
            <Trash2 className={`w-12 h-12 mx-auto mb-4 ${dm ? 'text-slate-700' : 'text-slate-300'}`} />
            <p className={`font-medium ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Trash is empty</p>
            <p className={`text-sm mt-1 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>Trashed messages will appear here</p>
          </div>
        ) : (
          trashedMessages.map(msg => {
            const daysLeft = getDaysUntilPurge(getTrashedAt(msg));
            return (
              <div
                key={msg.id}
                className={`p-4 border-b transition-colors ${
                  dm ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-100 hover:bg-slate-50'
                } ${
                  selectedIds.has(msg.id) ? (dm ? 'bg-indigo-950/30' : 'bg-indigo-50') : ''
                }`}
              >
                <div className="flex items-start space-x-2">
                  <div
                    className="flex-shrink-0 mt-0.5 cursor-pointer"
                    onClick={() => toggleSelect(msg.id)}
                  >
                    {selectedIds.has(msg.id)
                      ? <SquareCheck className="w-5 h-5 text-indigo-600" />
                      : <div className={`w-5 h-5 rounded border-2 ${dm ? 'border-slate-600' : 'border-slate-300'}`} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2">
                        {getChannelIcon(msg.channel)}
                        <span className={`font-semibold text-sm truncate ${dm ? 'text-white' : 'text-slate-900'}`}>
                          {msg.senderName}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {daysLeft !== null && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            daysLeft <= 3
                              ? (dm ? 'bg-red-950/50 text-red-400' : 'bg-red-100 text-red-700')
                              : daysLeft <= 7
                              ? (dm ? 'bg-yellow-950/50 text-yellow-400' : 'bg-yellow-100 text-yellow-700')
                              : (dm ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600')
                          }`}>
                            {daysLeft === 0 ? 'Today' : `${daysLeft}d left`}
                          </span>
                        )}
                        <span className={`text-xs whitespace-nowrap ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
                          {new Date(msg.timestamp).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <h4 className={`text-xs font-medium mb-1 truncate ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
                      {msg.subject || 'No Subject'}
                    </h4>
                    <p className={`text-sm line-clamp-2 mb-3 ${dm ? 'text-slate-300' : 'text-slate-600'}`}>{msg.body}</p>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      <button
                        onClick={() => onRestore(msg.id)}
                        className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        <Undo2 className="w-3 h-3" />
                        <span>Restore</span>
                      </button>
                      {confirmDeleteId === msg.id ? (
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => {
                              onPermanentDelete(msg.id);
                              setConfirmDeleteId(null);
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                          >
                            Confirm Delete
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${dm ? 'text-slate-300 bg-slate-800 hover:bg-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'}`}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(msg.id)}
                          className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${dm ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete Permanently</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TrashFolder;
