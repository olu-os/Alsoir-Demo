import React, { useState } from 'react';
import { Message, Channel } from '../types';
import { Undo2, Trash2, Mail, Instagram, ShoppingBag, AlertTriangle } from 'lucide-react';
import { decodeHtmlEntities } from '../services/text';

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
  };

  const handleBulkDelete = () => {
    onBulkDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const getTrashedAt = (msg: Message): string | undefined => {
    return msg.trashedAt;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Trash</h1>
            <p className="text-sm text-slate-500 mt-1">
              Messages are automatically deleted after 30 days
            </p>
          </div>
          {trashedMessages.length > 0 && (
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleSelectAll}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                {selectedIds.size === trashedMessages.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="mt-4 flex items-center space-x-3 p-3 bg-indigo-50 rounded-xl border border-indigo-200">
            <span className="text-sm font-medium text-indigo-900">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={handleBulkRestore}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white text-indigo-700 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors text-sm font-medium"
            >
              <Undo2 className="w-4 h-4" />
              <span>Restore</span>
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Forever</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading trashed messages...</div>
        ) : trashedMessages.length === 0 ? (
          <div className="p-12 text-center">
            <Trash2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Trash is empty</p>
            <p className="text-sm text-slate-400 mt-1">Trashed messages will appear here</p>
          </div>
        ) : (
          trashedMessages.map(msg => {
            const daysLeft = getDaysUntilPurge(getTrashedAt(msg));
            return (
              <div
                key={msg.id}
                className={`p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                  selectedIds.has(msg.id) ? 'bg-indigo-50' : ''
                }`}
              >
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(msg.id)}
                    onChange={() => toggleSelect(msg.id)}
                    className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2">
                        {getChannelIcon(msg.channel)}
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {msg.senderName}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {daysLeft !== null && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            daysLeft <= 3
                              ? 'bg-red-100 text-red-700'
                              : daysLeft <= 7
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {daysLeft === 0 ? 'Today' : `${daysLeft}d left`}
                          </span>
                        )}
                        <span className="text-xs text-slate-400 whitespace-nowrap">
                          {new Date(msg.timestamp).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <h4 className="text-xs font-medium text-slate-500 mb-1 truncate">
                      {msg.subject || 'No Subject'}
                    </h4>
                    <p className="text-sm text-slate-600 line-clamp-2 mb-3">{msg.body}</p>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onRestore(msg.id)}
                        className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-200"
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
                            className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(msg.id)}
                          className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors border border-red-200"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          <span>Delete Forever</span>
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
