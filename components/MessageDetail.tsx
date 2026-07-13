import React, { useState, useEffect, useRef } from 'react';
import { Message, BusinessPolicy, ResponseCost } from '../types';
import { generateDraftReply, findSimilarMessages } from '../services/AIMessageService';
import { supabase } from '../services/supabaseClient';
import { decodeHtmlEntities } from '../services/text';
import { Send, Sparkles, RefreshCw, MoreHorizontal, Forward, Users, Check, X, Trash2, Clock } from 'lucide-react';

const bodyCache = new Map<string, string>();

interface MessageDetailProps {
    message: Message | null;
    allMessages: Message[];
    policies: BusinessPolicy[];
    onReplySent: (ids: string[], reply: string) => void;
    drafts: { [id: string]: string };
    setDrafts: React.Dispatch<React.SetStateAction<{ [id: string]: string }>>;
    businessName: string;
    signature: string;
    aiPersonality: 'support' | 'rapper' | 'medieval';
    onUpdateAiPersonality: (value: 'support' | 'rapper' | 'medieval') => void;
    bulkReplyMode?: 'autoSend' | 'draft';
    confirmBeforeSend?: boolean;
    sentRepliesByMessage: { [messageId: string]: Array<{ body: string; sentAt: string }> };
    onMessageTrashed?: (messageId: string) => void;
}

const MessageDetail: React.FC<MessageDetailProps> = ({ message, allMessages, policies, onReplySent, drafts, setDrafts, businessName, signature, aiPersonality, onUpdateAiPersonality, bulkReplyMode, confirmBeforeSend, sentRepliesByMessage, onMessageTrashed }) => {
    const [replyTextRaw, setReplyTextRaw] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isFindingSimilar, setIsFindingSimilar] = useState(false);
    const [similarMessages, setSimilarMessages] = useState<Message[]>([]);
    const [selectedSimilarIds, setSelectedSimilarIds] = useState<Set<string>>(new Set());
    const [isDismissingSimilar, setIsDismissingSimilar] = useState(false);
    const [showTaskToast, setShowTaskToast] = useState(false);
    const [showNoSimilarToast, setShowNoSimilarToast] = useState(false);
    const [dropdownState, setDropdownState] = useState<'closed' | 'open' | 'closing'>('closed');
    const [isSending, setIsSending] = useState(false);
    const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
    const [pendingConfirmBulkCount, setPendingConfirmBulkCount] = useState(0);
    const [fullBody, setFullBody] = useState<string>('');
    const [isLoadingBody, setIsLoadingBody] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const similarPanelRef = useRef<HTMLDivElement>(null);
    const repliesEndRef = useRef<HTMLDivElement>(null);

    const openDropdown = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        setDropdownState('open');
    };

    const closeDropdown = () => {
        setDropdownState('closing');
        closeTimeoutRef.current = setTimeout(() => {
            setDropdownState('closed');
        }, 120);
    };

    const toggleDropdown = () => {
        if (dropdownState === 'open') {
            closeDropdown();
        } else if (dropdownState === 'closed') {
            openDropdown();
        }
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                dropdownState === 'open'
            ) {
                closeDropdown();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [dropdownState]);

    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        };
    }, []);

    const renderBody = (text: string) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlRegex);
        return parts.map((part, i) => {
            if (urlRegex.test(part)) {
                return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">{part}</a>;
            }
            return part;
        });
    };

    const getFirstName = (fullName?: string) => {
        const senderName = (fullName || '').trim();
        if (!senderName) return '';
        return senderName.split(/\s+/)[0] || '';
    };

    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const normalizeDraftName = (text: string, senderName?: string) => {
        if (text.includes('{NAME}')) return text;
        const firstName = getFirstName(senderName);
        if (!firstName) return text;
        const regex = new RegExp(escapeRegExp(firstName), 'g');
        return text.replace(regex, '{NAME}');
    };

    useEffect(() => {
        if (message?.id) {
            setReplyTextRaw(drafts[message.id] || '');
        } else {
            setReplyTextRaw('');
        }
        setIsGenerating(false);
        setSimilarMessages([]);
        setSelectedSimilarIds(new Set());
        setFullBody('');
        setIsLoadingBody(false);
        setPendingConfirm(null);
        setPendingConfirmBulkCount(0);
    }, [message?.id]);

    useEffect(() => {
        if (!message?.id) return;
        if (message.channel !== 'Email') {
            setFullBody(message.body);
            return;
        }

        // Check cache first
        const cached = bodyCache.get(message.id);
        if (cached) {
            setFullBody(cached);
            return;
        }

        // If body is already substantial, likely full email — skip fetch
        if (message.body.length > 200) {
            setFullBody(message.body);
            bodyCache.set(message.id, message.body);
            return;
        }

        let cancelled = false;
        setIsLoadingBody(true);

        (async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.provider_token) {
                    if (!cancelled) {
                        setFullBody(message.body);
                        setIsLoadingBody(false);
                    }
                    return;
                }

                const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
                const { data, error } = await supabase.functions.invoke('get-gmail-message', {
                    body: { providerToken: session.provider_token, messageId: message.id },
                    headers: anonKey
                        ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey }
                        : undefined,
                } as any);

                if (cancelled) return;

                if (error || !data?.body) {
                    setFullBody(message.body);
                } else {
                    bodyCache.set(message.id, data.body);
                    setFullBody(data.body);
                }
            } catch (e) {
                if (!cancelled) {
                    setFullBody(message.body);
                }
            } finally {
                if (!cancelled) setIsLoadingBody(false);
            }
        })();

        return () => { cancelled = true; };
    }, [message?.id]);

    // Update replyText when drafts change, but do not reset similarMessages
    useEffect(() => {
        if (message?.id) {
            setReplyTextRaw(drafts[message.id] || '');
        }
    }, [drafts, message?.id]);

    useEffect(() => {
        if (similarMessages.length > 0 && similarPanelRef.current) {
            similarPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [similarMessages]);

    useEffect(() => {
        if (repliesEndRef.current) {
            repliesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [sentRepliesByMessage, pendingConfirm]);

    const handleGenerateReply = async () => {
        if (!message) return;
        setIsGenerating(true);
        const bodyToUse = fullBody || message.body;
        let draft = await generateDraftReply(bodyToUse, message.senderName, policies, businessName, signature, aiPersonality);
        setReplyTextRaw(draft);
        setDrafts(prev => ({ ...prev, [message.id]: draft }));
        setIsGenerating(false);
    };

    const handleFindSimilar = async () => {
        if (!message) return;
        setIsFindingSimilar(true);

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

    const handleMoveToTrash = () => {
        if (message && onMessageTrashed) {
            onMessageTrashed(message.id);
        }
        closeDropdown();
    };

    const handleForwardToTask = () => {
        setShowTaskToast(true);
        setTimeout(() => setShowTaskToast(false), 3000);
    };

    const [draftsGeneratedFor, setDraftsGeneratedFor] = useState<string[]>([]);

    const handleSend = async () => {
        if (!message) return;
        const baseDraft = normalizeDraftName(replyTextRaw, message.senderName);
        const personalized = baseDraft.replaceAll('{NAME}', getFirstName(message.senderName));
        if (confirmBeforeSend) {
            setPendingConfirm(personalized);
            setPendingConfirmBulkCount(0);
            return;
        }
        onReplySent([message.id], personalized);
        setDrafts(prev => {
            const newDrafts = { ...prev };
            delete newDrafts[message.id];
            return newDrafts;
        });
        setReplyTextRaw('');
        setSimilarMessages([]);
        setDraftsGeneratedFor([]);
    };

    const handleConfirmSend = () => {
        if (!message || !pendingConfirm) return;
        onReplySent([message.id], pendingConfirm);
        setPendingConfirm(null);
        setPendingConfirmBulkCount(0);
        setDrafts(prev => {
            const newDrafts = { ...prev };
            delete newDrafts[message.id];
            return newDrafts;
        });
        setReplyTextRaw('');
        setSimilarMessages([]);
        setDraftsGeneratedFor([]);
    };

    const handleCancelConfirm = () => {
        setPendingConfirm(null);
        setPendingConfirmBulkCount(0);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && pendingConfirm) {
                handleCancelConfirm();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [pendingConfirm]);

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
                <div key={message.id} className="animate-fade-in">
                    <h1 className="text-xl font-bold text-slate-900 mb-1">{message.subject || 'Conversation'}</h1>
                    <div className="flex items-center space-x-2 text-sm text-slate-500">
                        <span>From: <span className="font-medium text-slate-700">{message.senderName}</span></span>
                        <span>•</span>
                        <span>{message.channel}</span>
                        <span>•</span>
                        <span>{message.senderHandle}</span>
                    </div>
                </div>
                <div className="flex space-x-2 items-start">
                    <button
                        onClick={handleForwardToTask}
                        className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors flex items-center space-x-1"
                        title="Forward to Task Manager"
                    >
                        <Forward className="w-5 h-5" />
                    </button>
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={toggleDropdown}
                            className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <MoreHorizontal className="w-5 h-5" />
                        </button>
                        {(dropdownState === 'open' || dropdownState === 'closing') && (
                            <div
                                className={`absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-slate-200 shadow-lg z-50 py-1 origin-top-right ${dropdownState === 'open' ? 'animate-scale-in' : 'animate-scale-out'}`}
                            >
                                <button
                                    onClick={handleMoveToTrash}
                                    className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span>Move to Trash</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Message Body */}
            <div key={message.id} className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                <div className="bg-white p-6 mx-20 rounded-xl border border-slate-200 shadow-sm animate-fade-up">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg">
                                {message.senderName[0]}
                            </div>
                            <div>
                                <div className="font-medium text-slate-900">{message.senderName}</div>
                                <div className="text-xs text-slate-500">{(() => { const d = new Date(message.timestamp); return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}` })()}</div>
                            </div>
                        </div>
                        {message.predictedCost === ResponseCost.High && (
                            <span className="px-2 py-1 bg-red-50 text-red-600 text-xs font-medium rounded-md border border-red-100">
                                High Priority
                            </span>
                        )}
                    </div>
                    <div className="prose prose-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {isLoadingBody ? (
                            <div className="flex items-center space-x-2 text-slate-400">
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>Loading message...</span>
                            </div>
                        ) : (
                            renderBody(fullBody || message.body)
                        )}
                    </div>

                    <div className="mt-6 flex flex-wrap gap-2">
                        {message.tags.map(tag => (
                            <span key={tag} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md">#{tag}</span>
                        ))}
                    </div>
                </div>

                {/* Sent Replies */}
                {sentRepliesByMessage[message.id]?.map((reply) => (
                    <div key={`${reply.sentAt}-${reply.body.slice(0, 20)}`} className="mt-6 mx-20 animate-fade-up">
                        <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-200 shadow-sm">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                                    You
                                </div>
                                <div>
                                    <div className="font-medium text-slate-900">Your Reply</div>
                                    <div className="text-xs text-slate-500">{(() => { const d = new Date(reply.sentAt); return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}` })()}</div>
                                </div>
                            </div>
                            <div className="prose prose-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                {renderBody(reply.body)}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Pending Confirmation */}
                {pendingConfirm && (
                    <div className="mt-6 mx-20 animate-fade-up">
                        <div className="bg-slate-50 p-6 rounded-xl border-2 border-dashed border-indigo-300 shadow-sm">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                                    <Clock className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-medium text-slate-900">
                                        {pendingConfirmBulkCount > 0
                                            ? `Pending Confirmation — ${pendingConfirmBulkCount + 1} recipients`
                                            : 'Pending Confirmation'
                                        }
                                    </div>
                                    <div className="text-xs text-slate-500">Awaiting your confirmation</div>
                                </div>
                            </div>
                            <div className="prose prose-sm text-slate-700 leading-relaxed whitespace-pre-wrap mb-4">
                                {pendingConfirm.replaceAll('{NAME}', getFirstName(message?.senderName))}
                            </div>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={handleConfirmSend}
                                    className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm text-sm font-medium"
                                >
                                    <Check className="w-4 h-4" />
                                    <span>{pendingConfirmBulkCount > 0 ? `Confirm Send to ${pendingConfirmBulkCount + 1}` : 'Confirm Send'}</span>
                                </button>
                                <button
                                    onClick={handleCancelConfirm}
                                    className="flex items-center space-x-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
                                >
                                    <X className="w-4 h-4" />
                                    <span>Cancel</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={repliesEndRef} />

                {/* Similar Messages Panel */}
                {(similarMessages.length > 0 || isDismissingSimilar) && (
                    <div ref={similarPanelRef} className={`mt-6 mx-20 max-w-3xl scroll-mt-6 ${isDismissingSimilar ? 'animate-fade-out-fast' : 'animate-fade-up'}`}>
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
                                        className={`flex items-start p-3 rounded-lg border cursor-pointer transition-all ${selectedSimilarIds.has(similar.id)
                                                ? 'bg-white border-indigo-300 shadow-sm'
                                                : 'bg-indigo-50/50 border-transparent hover:bg-white/50'
                                            }`}
                                    >
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center mr-3 mt-0.5 ${selectedSimilarIds.has(similar.id) ? 'bg-indigo-600 border-indigo-600' : 'border-indigo-300'
                                            }`}>
                                            {selectedSimilarIds.has(similar.id) && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-0.5">
                                                <span className="font-medium text-sm text-slate-900">{similar.senderName}</span>
                                                <span className="text-xs text-slate-400">{(() => { const d = new Date(similar.timestamp); return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}` })()}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs text-slate-600 truncate">{similar.body}</p>
                                                {similar.isReplied && (
                                                    <span className="text-xs text-purple-600 font-medium ml-2 whitespace-nowrap">Replied</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Cancel Bulk Reply Button */}
                        <div className="flex justify-end mt-4">
                            <button
                                onClick={() => {
                                    setIsDismissingSimilar(true);
                                    setSelectedSimilarIds(new Set());
                                    setTimeout(() => {
                                        setSimilarMessages([]);
                                        setIsDismissingSimilar(false);
                                    }, 200);
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
                        <div className="flex flex-col items-end space-y-2 relative">
                            <select
                                value={aiPersonality}
                                onChange={(e) => onUpdateAiPersonality(e.target.value as 'support' | 'rapper' | 'medieval')}
                                className="h-8 px-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:ring-1 focus:ring-slate-500 outline-none"
                                title="AI Personality"
                            >
                                <option value="support">Support</option>
                                <option value="rapper">Rapper</option>
                                <option value="medieval">Medieval Alfred</option>
                            </select>
                            <div className="flex items-center space-x-2">
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
                    </div>

                    <div className="relative">
                        {isSending ? (
                            <div className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-relaxed text-slate-700 flex space-x-2">
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>Sending...</span>
                            </div>
                        ) : (
                            <textarea
                                value={replyTextRaw.replaceAll('{NAME}', getFirstName(message?.senderName))}
                                onChange={(e) => {
                                    // When user edits, update raw draft with {NAME}
                                    let val = e.target.value;
                                    if (message?.senderName) {
                                        // Replace senderName with {NAME}
                                        val = normalizeDraftName(val, message.senderName);
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
                        )}

                        <div className="absolute bottom-3 right-3">
                            {pendingConfirm ? null : bulkReplyMode === 'draft' && selectedSimilarIds.size > 0 ? (
                                <button
                                    onClick={async () => {
                                        if (!message) return;
                                        // Copy the raw draft for the current message into all selected recipients
                                        const allIds = [message.id, ...Array.from(selectedSimilarIds as Set<string>).filter(id => id !== message.id)];
                                        const newDrafts = { ...drafts };
                                        const baseDraft = normalizeDraftName(replyTextRaw, message.senderName);
                                        for (const id of allIds) {
                                            newDrafts[id] = baseDraft;
                                        }
                                        setDrafts(newDrafts);
                                        setReplyTextRaw('');
                                        setSimilarMessages([]);
                                        setSelectedSimilarIds(new Set());
                                        setDraftsGeneratedFor(allIds);
                                    }}
                                    disabled={!replyTextRaw.replaceAll('{NAME}', getFirstName(message?.senderName)).trim()}
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
                                        const allMsgs = allIds.map(id => allMessages.find(m => m.id === id)).filter((m): m is Message => m !== undefined);
                                        const baseDraft = normalizeDraftName(replyTextRaw, message.senderName);
                                        const bulkCount = allMsgs.length - 1;
                                        if (confirmBeforeSend) {
                                            setPendingConfirm(baseDraft);
                                            setPendingConfirmBulkCount(bulkCount);
                                            return;
                                        }
                                        setDrafts(prev => {
                                            const newDrafts = { ...prev };
                                            allIds.forEach(id => { delete newDrafts[id]; });
                                            return newDrafts;
                                        });
                                        setReplyTextRaw('');
                                        setSimilarMessages([]);
                                        setDraftsGeneratedFor([]);
                                        setIsSending(true);
                                        try {
                                            for (const msg of allMsgs) {
                                                const personalized = baseDraft.replaceAll('{NAME}', getFirstName(msg.senderName));
                                                await onReplySent([msg.id], personalized);
                                            }
                                        } finally {
                                            setIsSending(false);
                                        }
                                    }}
                                    disabled={!replyTextRaw.replaceAll('{NAME}', getFirstName(message?.senderName)).trim()}
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
                        <span>
                            {pendingConfirm
                                ? 'Press Enter to confirm, Esc to cancel'
                                : 'Press Enter to send, Shift + Enter for new line'
                            }
                        </span>
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