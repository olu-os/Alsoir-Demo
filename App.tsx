import React, { useState, useEffect, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import Navigation from './components/Navigation';
import MessageList from './components/MessageList';
import MessageDetail from './components/MessageDetail';
import Analytics from './components/Analytics';
import PolicySettings from './components/PolicySettings';
import SettingsPage from './components/SettingsPage';
import SignIn from './components/SignIn';
import StatusBanner from './components/StatusBanner';
import InternalDashboard from './components/InternalDashboard';
import TrashFolder from './components/TrashFolder';
import { startAnomalyWorker, stopAnomalyWorker } from './services/anomalyWorker';
import { INITIAL_POLICIES } from './constants';
import { Message, BusinessPolicy } from './types';
import { analyzeMessageContent } from './services/AIMessageService';
import { supabase } from './services/supabaseClient';
import { decodeHtmlEntities } from './services/text';
import { logEvent } from './services/telemetry';
import { Undo2 } from 'lucide-react';


const subjectFallback = (subject: unknown, body: unknown): string | undefined => {
  const decodedSubject = decodeHtmlEntities(subject);
  if (decodedSubject.trim()) return decodedSubject.trim();

  const decodedBody = decodeHtmlEntities(body);
  if (!decodedBody) return undefined;
  const firstLine = decodedBody.split(/\r?\n/)[0]?.trim();
  if (!firstLine) return undefined;
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
};

const normalizeDbMessageRow = (row: any): Message => ({
  id: row.id,
  senderName: decodeHtmlEntities(row.sender_name) || 'Unknown',
  senderHandle: decodeHtmlEntities(row.sender_handle) || '',
  channel: row.channel,
  subject: subjectFallback(row.subject, row.body),
  body: decodeHtmlEntities(row.body),
  timestamp: new Date(row.received_at),
  isRead: !!row.is_read,
  isReplied: !!row.is_replied,
  category: row.category,
  sentiment: row.sentiment,
  predictedCost: row.predicted_cost,
  suggestedReply: row.ai_draft_response ?? undefined,
  tags: Array.isArray(row.tags) ? row.tags : [],
  threadId: row.thread_id ?? undefined,
  trashedAt: row.metadata?.trashed_at ?? undefined,
});

// Demo user email constant
const DEMO_EMAIL = 'demo@alsoir.com';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState('inbox');
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [policies, setPolicies] = useState<BusinessPolicy[]>(INITIAL_POLICIES);
  const [isLoading, setIsLoading] = useState(false);
  const [showSyncedToast, setShowSyncedToast] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const isDemoUser = user?.email === DEMO_EMAIL;
  const [drafts, setDrafts] = useState<{ [id: string]: string }>({});

  const [settings, setSettings] = useState<{
    businessName: string;
    signature: string;
    autoSendAIResponses: boolean;
    bulkReplyMode: 'draft' | 'autoSend';
    aiPersonality: 'support' | 'rapper' | 'medieval';
  }>({
    businessName: '',
    signature: '',
    autoSendAIResponses: false,
    bulkReplyMode: 'draft',
    aiPersonality: 'support'
  });

  const [sentRepliesByMessage, setSentRepliesByMessage] = useState<{ [messageId: string]: Array<{ body: string; sentAt: string }> }>({});
  const [trashedMessages, setTrashedMessages] = useState<Message[]>([]);
  const [isLoadingTrash, setIsLoadingTrash] = useState(false);
  const [undoToast, setUndoToast] = useState<{
    messageIds: string[];
    messages: Message[];
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const handleUpdateSettings = (updated: typeof settings) => {
    setSettings({ ...settings, ...updated });
  };

  const handleUpdateAiPersonality = (value: 'support' | 'rapper' | 'medieval') => {
    setSettings((prev) => ({ ...prev, aiPersonality: value }));
  };
  const isMountedRef = useRef(true);
  const categorizingIdsRef = useRef<Set<string>>(new Set());
  const autoCategorizedForUserRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<any>(null);

    // Poll for new messages every 30 seconds when user is logged in
    useEffect(() => {
      if (!user?.id) return;
      setIsLoading(true);
      const interval = setInterval(() => {
        fetchData(user.id, true);
      }, 30000);
      return () => {
        clearInterval(interval);
        setIsLoading(false);
      };
    }, [user?.id]);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Etsy OAuth callback logic commented out
    /*
    // Check for Etsy OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state) {
      handleEtsyCallback(code, state);
    }
    */

    // Initialize auth session (and refresh if needed)
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        let activeSession = session;

        const expiresAtMs = activeSession?.expires_at ? activeSession.expires_at * 1000 : null;
        const refreshWindowMs = 60_000;
        let refreshFailed = false;
        if (activeSession && expiresAtMs && expiresAtMs <= Date.now() + refreshWindowMs) {
          // Try up to twice to refresh
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const refreshed = await supabase.auth.refreshSession();
              if (refreshed.data.session) {
                activeSession = refreshed.data.session;
                refreshFailed = false;
                break;
              } else {
                refreshFailed = true;
              }
            } catch (err) {
              refreshFailed = true;
              console.warn('Session refresh attempt failed:', err);
            }
          }
        }

        setUser(activeSession?.user ?? null);
        if (!activeSession?.user || refreshFailed) {
          setMessages([]);
          if (refreshFailed) {
            alert('Your session expired. Please sign in again.');
          }
        }
      } catch (e) {
        console.error('Auth init failed:', e);
        setUser(null);
        setMessages([]);
        alert('Authentication failed. Please sign in again.');
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setMessages([]);
        stopAnomalyWorker();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Start anomaly worker when user is authenticated
  useEffect(() => {
    if (user?.id) {
      startAnomalyWorker(user.id);
    }
    return () => { stopAnomalyWorker(); };
  }, [user?.id]);

  // Only fetch messages for demo user, and never call fetch-gmail or Gmail API in demo mode
  useEffect(() => {
    if (!user?.id) return;
    fetchData(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (autoCategorizedForUserRef.current === user.id) return;
    if (messages.length === 0) return;

    autoCategorizedForUserRef.current = user.id;
    updateMessageCategories().catch((e) => {
      console.error('Auto categorization failed:', e);
    });
  }, [user?.id, messages.length]);

  const handleManualSync = async () => {
    if (isDemoUser) {
      alert('Sync is disabled in Demo Mode.');
      return;
    }
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      if (!session.provider_token) {
        setIsLoading(false);
        setUser(null);
        setMessages([]);
        return;
      }
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

      const invokePromise = supabase.functions.invoke('fetch-gmail', {
        body: { session },
        // Ensure Edge Function receives valid auth headers
        headers: anonKey
          ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey }
          : undefined,
      } as any);

      const timeoutMs = 30000;
      const raceResult = await Promise.race([
        invokePromise.then((res) => ({ timedOut: false as const, res })),
        new Promise<{ timedOut: true }>((resolve) => setTimeout(() => resolve({ timedOut: true }), timeoutMs)),
      ]);

      if (raceResult.timedOut) {
        if (isMountedRef.current) setIsLoading(false);
        logEvent('SYNC_GMAIL', 'failed', { reason: 'timeout' }, timeoutMs);

        invokePromise
          .then(async ({ data, error }) => {
            if (error) {
              console.error('Manual sync function error (background):', error);
              const maybeAny: any = error as any;
              let errorDetail = error.message;
              if (maybeAny?.context) {
                const ctx: any = maybeAny.context;
                console.error('Manual sync function context (background):', ctx);
                if (typeof ctx?.status === 'number' && typeof ctx?.clone === 'function') {
                  try {
                    const text = await ctx.clone().text();
                    const parsed = JSON.parse(text);
                    errorDetail = parsed?.details?.json?.error?.message || parsed?.error || text;
                  } catch {}
                }
              }
              logEvent('SYNC_GMAIL', 'failed', { reason: 'function_error', background: true }, undefined, errorDetail);
              return;
            }

            logEvent('SYNC_GMAIL', 'success', { background: true }, undefined);
            console.log('Manual sync response (background):', data);
            autoCategorizedForUserRef.current = null;
            await fetchData(session.user.id);
          })
          .catch((e) => {
            logEvent('SYNC_GMAIL', 'failed', { reason: 'background_crash' }, undefined, (e as any)?.message);
            console.error('Manual sync invoke failed (background):', e);
          });

        return;
      }

      if (!('res' in raceResult)) {
        throw new Error('Manual sync failed: missing response');
      }

      const { data, error } = raceResult.res;

      if (error) {
        console.error('Manual sync function error:', error);
        const maybeAny: any = error as any;
        let errorDetail = error.message;
        if (maybeAny?.context) {
          const ctx: any = maybeAny.context;
          console.error('Manual sync function context:', ctx);
          if (typeof ctx?.status === 'number' && typeof ctx?.clone === 'function') {
            try {
              const text = await ctx.clone().text();
              console.error('Manual sync function response status:', ctx.status);
              console.error('Manual sync function response body:', text);
              const parsed = JSON.parse(text);
              console.error('Manual sync function response json:', parsed);
              errorDetail = parsed?.details?.json?.error?.message || parsed?.error || text;
            } catch (e) {
              console.error('Failed reading function error body:', e);
            }
          }
        }
        logEvent('SYNC_GMAIL', 'failed', { reason: 'function_error', status: maybeAny?.context?.status }, undefined, errorDetail);
        throw error;
      }
      logEvent('SYNC_GMAIL', 'success', {}, undefined);
      console.log('Manual sync response:', data);

      autoCategorizedForUserRef.current = null;
      await fetchData(session.user.id);

    } catch (error: any) {
      logEvent('SYNC_GMAIL', 'failed', { reason: 'unhandled_exception' }, undefined, error?.message);
      console.error("Manual sync failed:", error);
      alert("Failed to sync emails.");
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const fetchData = async (userId: string, isPolling = false) => {
    if (!isPolling) setIsLoading(true);
    try {
      const { data: msgs, error: msgsError } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .order('received_at', { ascending: false });

      if (msgsError) {
        console.error('Fetch messages error:', msgsError);
      }

      if (msgs && msgs.length > 0) {
        const filtered = msgs.filter((m: any) => !(m.metadata?.trashed));
        const normalizedMessages: Message[] = filtered.map(normalizeDbMessageRow);
        setMessages(normalizedMessages);
      } else {
        setMessages([]);
      }
      const { data: pols, error: polsError } = await supabase
        .from('policies')
        .select('*')
        .eq('user_id', userId);

      if (polsError) {
        console.error('Fetch policies error:', polsError);
      }

      if (pols && pols.length > 0) {
        setPolicies(pols.map((p: any) => ({
          id: p.id,
          title: p.title,
          content: p.content,
          category: p.category
        })));
      }

      const { data: replies, error: repliesError } = await supabase
        .from('message_replies')
        .select('*')
        .eq('user_id', userId)
        .order('sent_at', { ascending: true });

      if (!repliesError && replies) {
        const grouped: { [messageId: string]: Array<{ body: string; sentAt: string }> } = {};
        for (const r of replies) {
          if (!grouped[r.message_id]) grouped[r.message_id] = [];
          grouped[r.message_id].push({ body: r.body, sentAt: r.sent_at });
        }
        setSentRepliesByMessage(grouped);
      }

    } catch (err) {
      console.error('fetchData failed:', err);
    } finally {
      if (!isPolling) setIsLoading(false);
      if (!isPolling) {
        setShowSyncedToast(true);
        setTimeout(() => setShowSyncedToast(false), 2500);
      }
    }
  };

  const categorizeAndPersistMessage = async (message: Message) => {
    if (!user?.id) return;
    if (categorizingIdsRef.current.has(message.id)) return;
    categorizingIdsRef.current.add(message.id);

    try {
      const analysis = await analyzeMessageContent(message.body);

      if (!isMountedRef.current) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? {
                ...m,
                category: analysis.category,
                sentiment: analysis.sentiment,
                predictedCost: analysis.predictedCost,
                tags: analysis.tags ?? [],
              }
            : m,
        ),
      );

      const updatePayload = {
        category: analysis.category,
        sentiment: analysis.sentiment,
        predicted_cost: analysis.predictedCost,
        tags: analysis.tags ?? [],
      };

      const { error } = await supabase
        .from('messages')
        .update(updatePayload)
        .eq('id', message.id)
        .eq('user_id', user.id);

      if (error) {
        console.error(`Failed to persist categorization for message ${message.id}:`, error, updatePayload);
      }
    } catch (error) {
      console.error(`Failed to analyze message ${message.id}:`, error);
    } finally {
      categorizingIdsRef.current.delete(message.id);
    }
  };

  // Realtime subscription lifecycle: one channel per user with cleanup.
  useEffect(() => {
    if (!user?.id) return;

    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const channel = supabase
      .channel(`public:messages:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const normalized = normalizeDbMessageRow((payload as any).new);



          const newPayload = (payload as any).new;
          if (newPayload.metadata?.trashed) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === normalized.id)) return prev;
            return [normalized, ...prev];
          });

          if (!normalized.category || normalized.category === 'General') {
            categorizeAndPersistMessage(normalized);
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      if (realtimeChannelRef.current === channel) realtimeChannelRef.current = null;
    };
  }, [user?.id]);

  const updateMessageCategories = async () => {
    if (!user || messages.length === 0) return;

    const messagesToUpdate = messages.filter(
      (m) =>
        (!m.category || m.category === "General") &&
        !categorizingIdsRef.current.has(m.id)
    );

    if (messagesToUpdate.length === 0) {
      console.log("No messages to categorize.");
      return;
    }

    console.log(`Categorizing ${messagesToUpdate.length} messages...`);
    setIsLoading(true);
    try {
      const batchSize = 3;
      for (let i = 0; i < messagesToUpdate.length; i += batchSize) {
        const batch = messagesToUpdate.slice(i, i + batchSize);
        await Promise.all(batch.map(categorizeAndPersistMessage));
      }
      console.log('Categorization + persistence completed.');
    } finally {
      setIsLoading(false);
    }
  };

  // handleEtsyCallback commented out
  /*
  const handleEtsyCallback = async (code: string, state: string) => {
    const savedState = localStorage.getItem('etsy_oauth_state');
    const codeVerifier = localStorage.getItem('etsy_code_verifier');

    if (state !== savedState) {
      console.error('Invalid OAuth state');
      return;
    }

    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);

    // In a production app, you would send this to a backend (Edge Function)
    // to securely exchange the code for tokens using your client_secret.
    console.log('Etsy code received, ready for token exchange via Edge Function:', code);
    
    // For demo purposes, we alert the user
    alert('Etsy account linked successfully (simulated token exchange)');
  };
  */

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null); // Force UI update
  };

  const fetchTrashedMessages = async () => {
    if (!user?.id) return;
    setIsLoadingTrash(true);
    try {
      const { data: msgs, error } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', user.id)
        .filter('metadata->>trashed', 'eq', 'true')
        .order('received_at', { ascending: false });

      if (error) {
        console.error('Fetch trashed messages error:', error);
      } else if (msgs) {
        setTrashedMessages(msgs.map(normalizeDbMessageRow));
      } else {
        setTrashedMessages([]);
      }
    } catch (err) {
      console.error('fetchTrashedMessages failed:', err);
    } finally {
      setIsLoadingTrash(false);
    }
  };

  useEffect(() => {
    if (currentView === 'trash' && user?.id) {
      fetchTrashedMessages();
    }
  }, [currentView, user?.id]);

  const trashMessageInGmail = async (messageId: string) => {
    if (isDemoUser) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.provider_token) return;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      await supabase.functions.invoke('trash-gmail', {
        body: { session, messageId, action: 'trash', userId: user?.id },
        headers: anonKey
          ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey }
          : undefined,
      } as any);
    } catch (e) {
      console.warn('Failed to sync trash to Gmail:', e);
    }
  };

  const restoreMessageInGmail = async (messageId: string) => {
    if (isDemoUser) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.provider_token) return;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      await supabase.functions.invoke('trash-gmail', {
        body: { session, messageId, action: 'restore', userId: user?.id },
        headers: anonKey
          ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey }
          : undefined,
      } as any);
    } catch (e) {
      console.warn('Failed to sync restore to Gmail:', e);
    }
  };

  const handleMessageTrashed = async (id: string) => {
    const messageToTrash = messages.find(m => m.id === id);
    if (!messageToTrash) return;

    const previousMessages = messages;
    setMessages(prev => prev.filter(m => m.id !== id));
    if (selectedMessageId === id) {
      setSelectedMessageId(null);
    }

    if (undoToast) {
      clearTimeout(undoToast.timer);
      setUndoToast({
        messageIds: [...undoToast.messageIds, id],
        messages: [...undoToast.messages, messageToTrash],
        timer: setTimeout(() => setUndoToast(null), 5000),
      });
    } else {
      const timer = setTimeout(() => setUndoToast(null), 5000);
      setUndoToast({ messageIds: [id], messages: [messageToTrash], timer });
    }

    try {
      const { data: current } = await supabase
        .from('messages')
        .select('metadata')
        .eq('id', id)
        .single();
      const existingMetadata = (current as any)?.metadata || {};
      const { error } = await supabase
        .from('messages')
        .update({
          metadata: {
            ...existingMetadata,
            trashed: true,
            trashed_at: new Date().toISOString(),
          },
        })
        .eq('id', id);

      if (error) throw error;

      logEvent('MESSAGE_TRASHED', 'success', { messageId: id });
      trashMessageInGmail(id);
    } catch (e) {
      console.error('Failed to trash message:', e);
      setMessages(previousMessages);
      logEvent('MESSAGE_TRASHED', 'failed', { messageId: id }, undefined, (e as any)?.message);
    }
  };

  const handleUndoTrash = async () => {
    if (!undoToast) return;
    clearTimeout(undoToast.timer);
    const { messageIds, messages: undoneMessages } = undoToast;
    setUndoToast(null);

    setMessages(prev => [...undoneMessages, ...prev].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));

    for (const id of messageIds) {
      try {
        const { data: current } = await supabase
          .from('messages')
          .select('metadata')
          .eq('id', id)
          .single();
        const existingMetadata = (current as any)?.metadata || {};
        const newMetadata = { ...existingMetadata };
        delete newMetadata.trashed;
        delete newMetadata.trashed_at;
        await supabase
          .from('messages')
          .update({ metadata: newMetadata })
          .eq('id', id);
        logEvent('MESSAGE_RESTORED', 'success', { messageId: id, action: 'undo' });
        restoreMessageInGmail(id);
      } catch (e) {
        console.error('Failed to undo trash:', e);
      }
    }
  };

  const handleRestoreMessage = async (id: string) => {
    setTrashedMessages(prev => prev.filter(m => m.id !== id));

    try {
      const { data: current } = await supabase
        .from('messages')
        .select('metadata')
        .eq('id', id)
        .single();
      const existingMetadata = (current as any)?.metadata || {};
      const newMetadata = { ...existingMetadata };
      delete newMetadata.trashed;
      delete newMetadata.trashed_at;
      const { error } = await supabase
        .from('messages')
        .update({ metadata: newMetadata })
        .eq('id', id);

      if (error) throw error;

      logEvent('MESSAGE_RESTORED', 'success', { messageId: id });
      restoreMessageInGmail(id);

      if (user?.id) {
        const { data: restored } = await supabase
          .from('messages')
          .select('*')
          .eq('id', id)
          .single();
        if (restored) {
          const normalized = normalizeDbMessageRow(restored);
          setMessages(prev => [normalized, ...prev].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
        }
      }
    } catch (e) {
      console.error('Failed to restore message:', e);
      fetchTrashedMessages();
    }
  };

  const handlePermanentDelete = async (id: string) => {
    setTrashedMessages(prev => prev.filter(m => m.id !== id));

    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', id);

      if (error) throw error;

      logEvent('MESSAGE_PURGED', 'success', { messageId: id });

      if (!isDemoUser) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.provider_token) {
            await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${session.provider_token}` },
            });
          }
        } catch (e) {
          console.warn('Failed to delete from Gmail:', e);
        }
      }
    } catch (e) {
      console.error('Failed to permanently delete message:', e);
      fetchTrashedMessages();
    }
  };

  const handleBulkTrash = async (ids: string[]) => {
    const messagesToTrash = messages.filter(m => ids.includes(m.id));
    if (messagesToTrash.length === 0) return;

    const previousMessages = messages;
    setMessages(prev => prev.filter(m => !ids.includes(m.id)));
    if (selectedMessageId && ids.includes(selectedMessageId)) {
      setSelectedMessageId(null);
    }

    if (undoToast) {
      clearTimeout(undoToast.timer);
      setUndoToast({
        messageIds: [...undoToast.messageIds, ...ids],
        messages: [...undoToast.messages, ...messagesToTrash],
        timer: setTimeout(() => setUndoToast(null), 5000),
      });
    } else {
      const timer = setTimeout(() => setUndoToast(null), 5000);
      setUndoToast({ messageIds: ids, messages: messagesToTrash, timer });
    }

    for (const id of ids) {
      try {
        const { data: current } = await supabase
          .from('messages')
          .select('metadata')
          .eq('id', id)
          .single();
        const existingMetadata = (current as any)?.metadata || {};
        const { error } = await supabase
          .from('messages')
          .update({
            metadata: {
              ...existingMetadata,
              trashed: true,
              trashed_at: new Date().toISOString(),
            },
          })
          .eq('id', id);

        if (error) throw error;
        logEvent('MESSAGE_TRASHED', 'success', { messageId: id, bulk: true });
        trashMessageInGmail(id);
      } catch (e) {
        console.error(`Failed to trash message ${id}:`, e);
        setMessages(previousMessages);
        logEvent('MESSAGE_TRASHED', 'failed', { messageId: id, bulk: true }, undefined, (e as any)?.message);
        break;
      }
    }
  };

  const handleBulkRestore = async (ids: string[]) => {
    setTrashedMessages(prev => prev.filter(m => !ids.includes(m.id)));

    for (const id of ids) {
      try {
        const { data: current } = await supabase
          .from('messages')
          .select('metadata')
          .eq('id', id)
          .single();
        const existingMetadata = (current as any)?.metadata || {};
        const newMetadata = { ...existingMetadata };
        delete newMetadata.trashed;
        delete newMetadata.trashed_at;
        await supabase
          .from('messages')
          .update({ metadata: newMetadata })
          .eq('id', id);
        logEvent('MESSAGE_RESTORED', 'success', { messageId: id, bulk: true });
        restoreMessageInGmail(id);
      } catch (e) {
        console.error(`Failed to restore message ${id}:`, e);
      }
    }

    if (user?.id) {
      await fetchTrashedMessages();
      await fetchData(user.id);
    }
  };

  const handleBulkPermanentDelete = async (ids: string[]) => {
    setTrashedMessages(prev => prev.filter(m => !ids.includes(m.id)));

    for (const id of ids) {
      try {
        await supabase.from('messages').delete().eq('id', id);
        logEvent('MESSAGE_PURGED', 'success', { messageId: id, bulk: true });
      } catch (e) {
        console.error(`Failed to delete message ${id}:`, e);
      }
    }

    if (!isDemoUser) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.provider_token) {
          for (const id of ids) {
            try {
              await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${session.provider_token}` },
              });
            } catch (e) {
              console.warn(`Failed to delete ${id} from Gmail:`, e);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to delete from Gmail:', e);
      }
    }
  };

  const handleSelectMessage = async (id: string) => {
    const updatedMessages = messages.map(m => 
      m.id === id ? { ...m, isRead: true } : m
    );
    setMessages(updatedMessages);
    setSelectedMessageId(id);
    
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('id', id);
  };

  const handleReplySent = async (ids: string[], reply: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.provider_token || isDemoUser) {
      const updatedMessages = messages.map(m =>
        ids.includes(m.id) ? { ...m, isReplied: true } : m
      );
      setMessages(updatedMessages);
      return;
    }

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    const headers = anonKey
      ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey }
      : undefined;

    for (const id of ids) {
      const msg = messages.find(m => m.id === id);
      if (!msg || !msg.senderHandle) continue;

      const subject = msg.subject
        ? msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`
        : 'Re: Your inquiry';

      try {
        const { data: sendData, error } = await supabase.functions.invoke('send-email', {
          body: {
            session,
            to: msg.senderHandle,
            subject,
            body: reply,
            threadId: msg.threadId,
            messageId: msg.id,
            userId: user?.id,
            replyBody: reply,
          },
          headers,
        } as any) as any;

        if (error) continue;

        const resp = sendData || {};
        if (resp.dbError) {
          console.warn('send-email DB write issue:', resp.dbError);
        }
      } catch (e) {
        continue;
      }
    }

    if (user?.id) {
      const { data: freshMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', user.id)
        .in('id', ids);
      if (freshMessages) {
        const normalized = freshMessages.map(normalizeDbMessageRow);
        setMessages(prev => prev.map(m =>
          normalized.find((f: Message) => f.id === m.id) || m
        ));
      }
      const { data: freshReplies } = await supabase
        .from('message_replies')
        .select('*')
        .eq('user_id', user.id)
        .in('message_id', ids);
      if (freshReplies) {
        setSentRepliesByMessage(prev => {
          const next = { ...prev };
          for (const r of freshReplies as any[]) {
            if (!next[r.message_id]) next[r.message_id] = [];
            next[r.message_id].push({ body: r.body, sentAt: r.sent_at });
          }
          return next;
        });
      }
    }
  };

  const handleUpdatePolicies = async (updatedPolicies: BusinessPolicy[]) => {
    const previousPolicies = policies;
    setPolicies(updatedPolicies);
    
    if (!user) return;

    const removedIds = previousPolicies
      .filter((p) => !updatedPolicies.some((u) => u.id === p.id))
      .filter((p) => p.id.length > 20)
      .map((p) => p.id);

    if (removedIds.length > 0) {
      await supabase
        .from('policies')
        .delete()
        .eq('user_id', user.id)
        .in('id', removedIds);
    }

    for (const policy of updatedPolicies) {
      if (policy.id.length > 20) {
         await supabase
          .from('policies')
          .upsert({ 
            id: policy.id,
            user_id: user.id,
            title: policy.title,
            content: policy.content,
            category: policy.category || 'General' 
          });
      } else {
        await supabase
          .from('policies')
          .insert({ 
            user_id: user.id,
            title: policy.title,
            content: policy.content,
            category: policy.category || 'General' 
          });
      }
    }
  };

  const selectedMessage = messages.find(m => m.id === selectedMessageId) || null;


  if (!user) {
    return <SignIn />;
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <Navigation currentView={currentView} onChangeView={setCurrentView} onLogout={handleLogout} />

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Reliability Layer 1: User-visible status — only shows when there's an active incident */}
        <StatusBanner userId={user.id} currentView={currentView} />
        <div className="flex-1 flex overflow-hidden">
        {currentView === 'inbox' && (
          <>
            {/* Inbox List Column */}
            <div className={`
                ${selectedMessageId ? 'hidden lg:block' : 'w-full'} 
                lg:w-96 border-r border-slate-200 h-full
                relative
            `}>
              <MessageList 
                messages={messages} 
                selectedId={selectedMessageId} 
                onSelect={handleSelectMessage}
                isLoading={isLoading}
                onManualSync={handleManualSync}
                drafts={drafts}
                demoMode={isDemoUser}
                onBulkTrash={handleBulkTrash}
              />
            </div>

            {/* Message Detail Column */}
            <div className={`
                ${!selectedMessageId ? 'hidden lg:flex' : 'w-full flex'} 
                flex-1 flex-col h-full bg-slate-50 relative
            `}>
                {showSyncedToast && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in-out">
                    Messages Synced
                  </div>
                )}
                {selectedMessageId && (
                     <button 
                        onClick={() => setSelectedMessageId(null)}
                        className="lg:hidden p-4 text-indigo-600 font-medium flex items-center bg-white border-b border-slate-200"
                     >
                        ← Back to Inbox
                     </button>
                )}
               <MessageDetail 
                  message={selectedMessage} 
                  allMessages={messages}
                  policies={policies}
                  onReplySent={handleReplySent}
                  drafts={drafts}
                  setDrafts={setDrafts}
                  businessName={settings.businessName}
                  signature={settings.signature}
                  aiPersonality={settings.aiPersonality}
                  onUpdateAiPersonality={handleUpdateAiPersonality}
                  bulkReplyMode={settings.bulkReplyMode}
                   sentRepliesByMessage={sentRepliesByMessage}
                  onMessageTrashed={handleMessageTrashed}
                />
            </div>
          </>
        )}

        {currentView === 'analytics' && (
            <Analytics messages={messages} />
        )}

        {currentView === 'trash' && (
            <TrashFolder
              trashedMessages={trashedMessages}
              onRestore={handleRestoreMessage}
              onPermanentDelete={handlePermanentDelete}
              onBulkRestore={handleBulkRestore}
              onBulkDelete={handleBulkPermanentDelete}
              isLoading={isLoadingTrash}
            />
        )}

        {currentView === 'policies' && (
            <PolicySettings policies={policies} onUpdatePolicies={handleUpdatePolicies} />
        )}

        {currentView === 'settings' && (
            <SettingsPage user={user} settings={settings} onUpdateSettings={handleUpdateSettings} />
        )}
        {currentView === 'observability' && import.meta.env.DEV && (
            <InternalDashboard userId={user.id} />
        )}
        </div>

        {undoToast && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center space-x-4 animate-bounce-in z-50">
            <span className="text-sm font-medium">
              {undoToast.messageIds.length === 1
                ? 'Message moved to trash'
                : `${undoToast.messageIds.length} messages moved to trash`}
            </span>
            <button
              onClick={handleUndoTrash}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
            >
              <Undo2 className="w-4 h-4" />
              <span>Undo</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;