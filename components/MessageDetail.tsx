import React, { useState, useEffect } from 'react';
import { Message, BusinessPolicy, ResponseCost } from '../types';
import { generateDraftReply, findSimilarMessages } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';
import { decodeHtmlEntities } from '../services/text';
import { Send, Sparkles, RefreshCw, Paperclip, MoreHorizontal, Forward, Users, Check, X } from 'lucide-react';

interface MessageDetailProps {
    message: Message | null;
    allMessages: Message[];
    policies: BusinessPolicy[];
    onReplySent: (ids: string[], reply: string) => void;
    drafts: { [id: string]: string };
    setDrafts: React.Dispatch<React.SetStateAction<{ [id: string]: string }>>;
    businessName: string;
    signature: string;
    bulkReplyMode?: 'autoSend' | 'draft';
    sentRepliesByMessage: { [messageId: string]: string[] };
    setSentRepliesByMessage: React.Dispatch<React.SetStateAction<{ [messageId: string]: string[] }>>;
}

const MessageDetail: React.FC<MessageDetailProps> = ({ message, allMessages, policies, onReplySent, drafts, setDrafts, businessName, signature, bulkReplyMode, sentRepliesByMessage, setSentRepliesByMessage }) => {
        // Store the raw draft with {NAME}
        const [replyTextRaw, setReplyTextRaw] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isFindingSimilar, setIsFindingSimilar] = useState(false);
    const [similarMessages, setSimilarMessages] = useState<Message[]>([]);
    const [selectedSimilarIds, setSelectedSimilarIds] = useState<Set<string>>(new Set());
    const [showTaskToast, setShowTaskToast] = useState(false);
    const [showNoSimilarToast, setShowNoSimilarToast] = useState(false);

    // Only reset similarMessages and selectedSimilarIds when switching messages
    useEffect(() => {
        if (message?.id) {
            setReplyTextRaw(drafts[message.id] || '');
        } else {
            setReplyTextRaw('');
        }
        setIsGenerating(false);
        setSimilarMessages([]);
        setSelectedSimilarIds(new Set());
    }, [message?.id]);

    // Update replyText when drafts change, but do not reset similarMessages
    useEffect(() => {
        if (message?.id) {
            setReplyTextRaw(drafts[message.id] || '');
        }
    }, [drafts, message?.id]);

    const handleGenerateReply = async () => {
        if (!message) return;
        setIsGenerating(true);
        let draft = await generateDraftReply(message.body, message.senderName, policies, businessName, signature);
        // Store the draft with {NAME} in state and drafts
        setReplyTextRaw(draft);
        setDrafts(prev => ({ ...prev, [message.id]: draft }));
        // ...existing code...
        setIsGenerating(false);
    };

  const handleFindSimilar = async () => {
    if (!message) return;
    setIsFindingSimilar(true);

        // Prefer the latest set from DB so manual inserts show up,
        // but fall back to the in-memory list if anything fails.
        let candidatePool: Message[] = allMessages;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id;
            if (userId) {
                const { data: msgs, error } = await supabase
                    .from('messages')
                    .select('*')
                    .eq('user_id', userId)
                    .order('received_at', { ascending: false });

                if (error) {
                    console.warn('FindSimilar: fetch messages failed:', error);
                } else if (msgs) {
                    candidatePool = msgs.map((m: any) => ({
                        id: m.id,
                        senderName: decodeHtmlEntities(m.sender_name) || 'Unknown',
                        senderHandle: decodeHtmlEntities(m.sender_handle) || '',
                        channel: m.channel,
                        subject: decodeHtmlEntities(m.subject) || undefined,
                        body: decodeHtmlEntities(m.body),
                        timestamp: new Date(m.received_at ?? Date.now()),
                        isRead: !!m.is_read,
                        isReplied: !!m.is_replied,
                        category: m.category,
                        sentiment: m.sentiment,
                        predictedCost: m.predicted_cost,
                        suggestedReply: m.ai_draft_response ?? undefined,
                        tags: Array.isArray(m.tags) ? m.tags : []
                    })) as Message[];

                    // eslint-disable-next-line no-console
                    console.log(`FindSimilar: comparing against ${candidatePool.length} messages from DB`);
                }
            }
        } catch (e) {
            console.warn('FindSimilar: DB fetch threw, using in-memory messages:', e);
        }

        const ids = await findSimilarMessages(message, candidatePool);
        const matches = candidatePool.filter(m => ids.includes(m.id));
    
    if (matches.length === 0) {
      setShowNoSimilarToast(true);
      setTimeout(() => setShowNoSimilarToast(false), 2500);
    } else {
      setSimilarMessages(matches);
            // Auto-select only unreplied matches (avoid re-sending)
            setSelectedSimilarIds(new Set(matches.filter(m => !m.isReplied).map(m => m.id)));
    }
    
    setIsFindingSimilar(false);
  };

  const toggleSimilarMessage = (id: string) => {
    const newSet = new Set(selectedSimilarIds);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
    setSelectedSimilarIds(newSet);
  };

  const handleForwardToTask = () => {
    setShowTaskToast(true);
    setTimeout(() => setShowTaskToast(false), 3000);
  };

    const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);
    const [draftsGeneratedFor, setDraftsGeneratedFor] = useState<string[]>([]);

    const handleSend = async () => {
        if (!message) return;
        const personalized = replyTextRaw.replaceAll('{NAME}', message.senderName || '');
        onReplySent([message.id], personalized);
        const updatedReplies = { ...sentRepliesByMessage };
        updatedReplies[message.id] = [...(updatedReplies[message.id] || []), personalized];
        setSentRepliesByMessage(updatedReplies);
        setDrafts(prev => {
            const newDrafts = { ...prev };
            delete newDrafts[message.id];
            return newDrafts;
        });
        setReplyTextRaw('');
        setSimilarMessages([]);
        setDraftsGeneratedFor([]);
    };

    const handleGenerateDrafts = async () => {
        if (!message) return;
        setIsGeneratingDrafts(true);
        const allIds = [message.id, ...Array.from(selectedSimilarIds as Set<string>).filter(id => id !== message.id)];
        const newDrafts = { ...drafts };
        for (const id of allIds) {
            const msg = allMessages.find(m => m.id === id);
            if (msg) {
                const draft = await generateDraftReply(msg.body, msg.senderName, policies, businessName, signature);
                newDrafts[id] = draft;
            }
        }
        setDrafts(newDrafts);
        setReplyTextRaw('');
        setSimilarMessages([]);
        setIsGeneratingDrafts(false);
        setDraftsGeneratedFor(allIds);
    };

  if (!message) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400">
        <Sparkles className="w-16 h-16 mb-4 text-slate-300" />
        <p className="text-lg">Select a message to send a response</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold text-slate-900 mb-1">{message.subject || 'Conversation'}</h1>
          <div className="flex items-center space-x-2 text-sm text-slate-500">
            <span>From: <span className="font-medium text-slate-700">{message.senderName}</span></span>
            <span>•</span>
            <span>{message.channel}</span>
            <span>•</span>
            <span>{message.senderHandle}</span>
          </div>
        </div>
        <div className="flex space-x-2">
            <button 
                onClick={handleForwardToTask}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors flex items-center space-x-1"
                title="Forward to Task Manager"
            >
                <Forward className="w-5 h-5" />
            </button>
            <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
                <MoreHorizontal className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Message Body */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-3xl">
          <div className="flex justify-between items-start mb-4">
             <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg">
                    {message.senderName[0]}
                </div>
                <div>
                    <div className="font-medium text-slate-900">{message.senderName}</div>
                    <div className="text-xs text-slate-500">{(() => { const d = new Date(message.timestamp); return `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}/${d.getFullYear()}, ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true})}` })()}</div>
                </div>
             </div>
             {message.predictedCost === ResponseCost.High && (
                <span className="px-2 py-1 bg-red-50 text-red-600 text-xs font-medium rounded-md border border-red-100">
                    High Priority
                </span>
             )}
          </div>
          <div className="prose prose-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {message.body}
          </div>
          
          <div className="mt-6 flex flex-wrap gap-2">
            {message.tags.map(tag => (
                <span key={tag} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md">#{tag}</span>
            ))}
          </div>
        </div>

        {/* Sent Replies */}
        {sentRepliesByMessage[message.id]?.map((reply, index) => (
            <div key={index} className="mt-6 max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-200 shadow-sm">
                    <div className="flex items-center space-x-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                            You
                        </div>
                        <div>
                            <div className="font-medium text-slate-900">Your Reply</div>
                            <div className="text-xs text-slate-500">{new Date().toLocaleString()}</div>
                        </div>
                    </div>
                    <div className="prose prose-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {reply}
                    </div>
                </div>
            </div>
        ))}

        {/* Similar Messages Panel */}
        {similarMessages.length > 0 && (
            <div className="mt-6 max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2 text-indigo-900 font-semibold">
                            <Users className="w-5 h-5" />
                            <span>Similar Messages Found ({similarMessages.length})</span>
                        </div>
                        <span className="text-xs text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full">
                            Bulk Reply Mode
                        </span>
                    </div>
                    <p className="text-sm text-indigo-700 mb-3">
                        {bulkReplyMode === 'draft'
                          ? 'The AI detected similar issues. Select messages to draft the same response (names will be auto-adjusted).'
                          : 'The AI detected similar issues. Select messages to send the same response (names will be auto-adjusted).'}
                    </p>
                    <div className="space-y-2">
                        {similarMessages.map(similar => (
                            <div 
                                key={similar.id} 
                                onClick={() => toggleSimilarMessage(similar.id)}
                                className={`flex items-start p-3 rounded-lg border cursor-pointer transition-all ${
                                    selectedSimilarIds.has(similar.id) 
                                    ? 'bg-white border-indigo-300 shadow-sm' 
                                    : 'bg-indigo-50/50 border-transparent hover:bg-white/50'
                                }`}
                            >
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center mr-3 mt-0.5 ${
                                    selectedSimilarIds.has(similar.id) ? 'bg-indigo-600 border-indigo-600' : 'border-indigo-300'
                                }`}>
                                    {selectedSimilarIds.has(similar.id) && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-0.5">
                                        <span className="font-medium text-sm text-slate-900">{similar.senderName}</span>
                                        <span className="text-xs text-slate-400">{(() => { const d = new Date(similar.timestamp); return `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}/${d.getFullYear()}` })()}</span>
                                    </div>
                                    <p className="text-xs text-slate-600 truncate">{similar.body}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Cancel Bulk Reply Button */}
                <div className="flex justify-end mt-4">
                    <button
                        onClick={() => {
                            setSimilarMessages([]);
                            setSelectedSimilarIds(new Set());
                        }}
                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors shadow-sm text-sm font-medium"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        )}
      </div>

      {/* Reply Area */}
      <div className="p-6 bg-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto">
            {/* AI Controls */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Reply</h3>
                <div className="flex space-x-2 relative">
                    {similarMessages.length === 0 && (
                        <div className="relative">
                            <button 
                                onClick={handleFindSimilar}
                                disabled={isFindingSimilar}
                                className="flex items-center space-x-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium disabled:opacity-50"
                            >
                                {isFindingSimilar ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                                <span>{isFindingSimilar ? 'Scanning...' : 'Find Similar'}</span>
                            </button>
                            {showNoSimilarToast && (
                                <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap animate-fade-in-out">
                                    No similar messages found
                                </div>
                            )}
                        </div>
                    )}
                    <button
                        onClick={handleGenerateReply}
                        disabled={isGenerating}
                        className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                        {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        <span>{isGenerating ? 'Drafting...' : 'Generate with AI'}</span>
                    </button>
                </div>
            </div>

            <div className="relative">
                                <textarea
                                    value={replyTextRaw.replaceAll('{NAME}', message?.senderName || '')}
                                    onChange={(e) => {
                                        // When user edits, update raw draft with {NAME}
                                        let val = e.target.value;
                                        if (message?.senderName) {
                                            // Replace senderName with {NAME}
                                            const regex = new RegExp(message.senderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                                            val = val.replace(regex, '{NAME}');
                                        }
                                        setReplyTextRaw(val);
                                        if (message?.id) {
                                            setDrafts(prev => ({ ...prev, [message.id]: val }));
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                    placeholder="Type your reply here..."
                                    className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none resize-none text-sm leading-relaxed"
                                />
                <div className="absolute bottom-3 left-3 flex items-center space-x-2">
                    <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                        <Paperclip className="w-4 h-4" />
                    </button>
                </div>
                <div className="absolute bottom-3 right-3">
                    {bulkReplyMode === 'draft' && selectedSimilarIds.size > 0 ? (
                        <button
                            onClick={async () => {
                                if (!message) return;
                                // Copy the raw draft for the current message into all selected recipients
                                const allIds = [message.id, ...Array.from(selectedSimilarIds as Set<string>).filter(id => id !== message.id)];
                                const newDrafts = { ...drafts };
                                for (const id of allIds) {
                                    newDrafts[id] = replyTextRaw;
                                }
                                setDrafts(newDrafts);
                                setReplyTextRaw('');
                                setSimilarMessages([]);
                                setSelectedSimilarIds(new Set());
                                setDraftsGeneratedFor(allIds);
                            }}
                            disabled={!replyTextRaw.replaceAll('{NAME}', message?.senderName || '').trim()}
                            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span>
                                {`Draft for ${selectedSimilarIds.size + 1} Recipients`}
                            </span>
                            <Sparkles className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            onClick={async () => {
                                if (!message) return;
                                const allIds = [message.id, ...Array.from(selectedSimilarIds as Set<string>).filter(id => id !== message.id)];
                                // Find all involved messages
                                const allMsgs = allIds.map(id => allMessages.find(m => m.id === id)).filter(Boolean);
                                // Always substitute {NAME} with the correct senderName for each recipient
                                for (const msg of allMsgs) {
                                    const personalized = replyTextRaw.replaceAll('{NAME}', msg.senderName || '');
                                    await onReplySent([msg.id], personalized);
                                    setSentRepliesByMessage(prev => ({
                                        ...prev,
                                        [msg.id]: [...(prev[msg.id] || []), personalized]
                                    }));
                                }
                                setDrafts(prev => {
                                    const newDrafts = { ...prev };
                                    allIds.forEach(id => { delete newDrafts[id]; });
                                    return newDrafts;
                                });
                                setReplyTextRaw('');
                                setSimilarMessages([]);
                                setDraftsGeneratedFor([]);
                            }}
                            disabled={!replyTextRaw.replaceAll('{NAME}', message?.senderName || '').trim()}
                            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span>
                                {selectedSimilarIds.size > 0 
                                    ? `Send to ${selectedSimilarIds.size + 1} Recipients` 
                                    : 'Send'
                                }
                            </span>
                            <Send className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
            
            <div className="mt-2 text-xs text-slate-400 flex justify-between">
                <span>Press Enter to send, Shift + Enter for new line</span>
                {(() => {
                    const allIds = [message.id, ...Array.from(selectedSimilarIds as Set<string>).filter(id => id !== message.id)];
                    const allDraftsExist = allIds.every(id => drafts[id]);
                    if (selectedSimilarIds.size > 0 && !allDraftsExist) {
                        return <span className="text-indigo-600 font-medium">✨ Bulk reply active</span>;
                    }
                    return null;
                })()}
            </div>
        </div>
      </div>

      {/* Toast Notification */}
      {showTaskToast && (
          <div className="absolute top-4 right-4 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl flex items-center space-x-3 animate-bounce-in z-50">
              <div className="bg-green-500 p-1 rounded-full">
                <Send className="w-3 h-3 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium">Forwarded to Tasks</p>
                <p className="text-xs text-slate-400">Added to your daily todo list</p>
                
                <p className="text-xs text-slate-400 mt-0.8">(Feature coming soon)</p>
              </div>
          </div>
      )}
    </div>
  );
};

export default MessageDetail;