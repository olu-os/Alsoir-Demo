import React, { useState } from 'react';
import { Message, Channel } from '../types';
import { Undo2, Trash2, Mail, Instagram, ShoppingBag, SquareCheck } from 'lucide-react';

interface TrashFolderProps {
  trashedMessages: Message[];
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onBulkRestore: (ids: string[]) => void;
  onBulkDelete: (ids: string[]) => void;
  isLoading: boolean;
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
}) => {
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
    <div className="flex-1 flex flex-col h-full bg-slate-50 min-w-0 overflow-hidden">
      <div className="p-4 pt-14 lg:pt-6 border-b border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Trash</h1>
            <p className="text-sm text-slate-500">
              Messages are automatically deleted after 30 days
            </p>
          </div>
          {trashedMessages.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="self-start px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              {selectedIds.size === trashedMessages.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 p-3 bg-indigo-50 rounded-xl border border-indigo-200">
            <span className="text-sm font-medium text-indigo-900">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleBulkRestore}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
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
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading trashed messages...</div>
        ) : trashedMessages.length === 0 ? (
          <div className="p-12 text-center">
            <Trash2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Trash is empty</p>
            <p className="text-sm text-slate-400 mt-1">Trashed messages will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trashedMessages.map(msg => {
              const daysLeft = getDaysUntilPurge(getTrashedAt(msg));
              return (
                <div
                  key={msg.id}
                  className={`bg-white rounded-xl border shadow-sm p-4 transition-colors ${
                    selectedIds.has(msg.id) ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="flex-shrink-0 mt-0.5 cursor-pointer"
                      onClick={() => toggleSelect(msg.id)}
                    >
                      {selectedIds.has(msg.id)
                        ? <SquareCheck className="w-5 h-5 text-indigo-600" />
                        : <div className="w-5 h-5 rounded border-2 border-slate-300" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center space-x-2 min-w-0">
                          {getChannelIcon(msg.channel)}
                          <span className="font-semibold text-sm text-slate-900 truncate">
                            {msg.senderName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {daysLeft !== null && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              daysLeft <= 3
                                ? 'bg-red-100 text-red-700'
                                : daysLeft <= 7
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {daysLeft === 0 ? 'Today' : `${daysLeft}d`}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">
                            {new Date(msg.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                      <h4 className="text-xs font-medium text-slate-500 mb-1 truncate">
                        {msg.subject || 'No Subject'}
                      </h4>
                      <p className="text-sm text-slate-600 line-clamp-2 mb-3">{msg.body}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => onRestore(msg.id)}
                          className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          <Undo2 className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                        {confirmDeleteId === msg.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                onPermanentDelete(msg.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(msg.id)}
                            className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrashFolder;
