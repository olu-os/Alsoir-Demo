import React, { useState, useEffect, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import Navigation from './components/Navigation';
import MessageList from './components/MessageList';
import MessageDetail from './components/MessageDetail';
import Analytics from './components/Analytics';
import PolicySettings from './components/PolicySettings';
import SignIn from './components/SignIn';
import { INITIAL_POLICIES } from './constants';
import { Message, BusinessPolicy } from './types';
import { analyzeMessageContent } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import { decodeHtmlEntities } from './services/text';

const BUSINESS_KEYWORDS = [
  'order',
  'purchase',
  'invoice',
  'receipt',
  'billing',
  'charge',
  'tracking',
  'shipment',
  'shipping',
  'delivery',
  'delivered',
  'eta',
  'return',
  'refund',
  'exchange',
  'replacement',
  'cancel',
  'cancellation',
  'address',
  'support',
  'help',
  'issue',
  'problem',
  'broken',
  'damaged',
  'missing',
  'late',
  'delay',
  'complaint',
  'warranty',
  'subscription',
];

const normalizeForKeywordMatch = (input: string): string =>
  (input || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[“”‘’]/g, "'")
    .trim();

const isBusinessRelevant = (subject?: string, body?: string): boolean => {
  const text = normalizeForKeywordMatch(`${subject || ''}\n${body || ''}`);
  if (!text) return false;
  return BUSINESS_KEYWORDS.some((kw) => text.includes(kw));
};

const isEmailChannel = (channel: unknown): boolean =>
  (channel || '').toString().toLowerCase() === 'email';

const passesBusinessRelevanceGate = (channel: unknown, subject?: string, body?: string): boolean => {
  const channelStr = (channel || '').toString().toLowerCase();
  if (channelStr && !isEmailChannel(channelStr)) return true;
  return isBusinessRelevant(subject, body);
};

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
});

const purgeMessagesByIds = async (userId: string, ids: string[], context: string) => {
  if (ids.length === 0) return;
  const batchSize = 50;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('user_id', userId)
      .in('id', batch);

    if (error) {
      console.error(`${context}: purge DB delete failed:`, error, { batchSize: batch.length });
    }
  }
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState('inbox');
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [policies, setPolicies] = useState<BusinessPolicy[]>(INITIAL_POLICIES);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const isMountedRef = useRef(true);
  const categorizingIdsRef = useRef<Set<string>>(new Set());
  const autoCategorizedForUserRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Check for Etsy OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state) {
      handleEtsyCallback(code, state);
    }

    // Initialize auth session (and refresh if needed)
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        let activeSession = session;

        // If session is expired (or about to), refresh it so DB queries succeed after reload.
        const expiresAtMs = activeSession?.expires_at ? activeSession.expires_at * 1000 : null;
        if (activeSession && expiresAtMs && expiresAtMs <= Date.now() + 10_000) {
          const refreshed = await supabase.auth.refreshSession();
          if (refreshed.data.session) {
            activeSession = refreshed.data.session;
          }
        }

        setUser(activeSession?.user ?? null);
        if (!activeSession?.user) {
          setMessages([]);
        }
      } catch (e) {
        console.error('Auth init failed:', e);
        setUser(null);
        setMessages([]);
      }
    })();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setMessages([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Always (re)load inbox whenever we have a logged-in user.
  useEffect(() => {
    if (!user?.id) return;
    fetchData(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Immediately after the initial inbox load.
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
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

      const invokePromise = supabase.functions.invoke('fetch-gmail', {
        body: { session },
        // Ensure Edge Function receives valid auth headers
        headers: anonKey
          ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey }
          : undefined,
      } as any);

      const timeoutMs = 3000;
      const raceResult = await Promise.race([
        invokePromise.then((res) => ({ timedOut: false as const, res })),
        new Promise<{ timedOut: true }>((resolve) => setTimeout(() => resolve({ timedOut: true }), timeoutMs)),
      ]);

      // If the sync takes longer than 3s, stop the spinner and let it finish in the background.
      if (raceResult.timedOut) {
        if (isMountedRef.current) setIsLoading(false);

        invokePromise
          .then(async ({ data, error }) => {
            if (error) {
              console.error('Manual sync function error (background):', error);
              const maybeAny: any = error as any;
              if (maybeAny?.context) {
                const ctx: any = maybeAny.context;
                console.error('Manual sync function context (background):', ctx);
              }
              return;
            }

            console.log('Manual sync response (background):', data);
            // Allow post-sync cleanup to re-run for this user.
            autoCategorizedForUserRef.current = null;
            await fetchData(session.user.id);
          })
          .catch((e) => {
            console.error('Manual sync invoke failed (background):', e);
          });

        return;
      }

      // TS safety: ensure we actually have a response payload.
      if (!('res' in raceResult)) {
        throw new Error('Manual sync failed: missing response');
      }

      const { data, error } = raceResult.res;

      if (error) {
        // supabase-js FunctionsHttpError typically includes context with status/body
        console.error('Manual sync function error:', error);
        const maybeAny: any = error as any;
        if (maybeAny?.context) {
          const ctx: any = maybeAny.context;
          console.error('Manual sync function context:', ctx);
          // If context is a fetch Response, log status + body for diagnosis.
          if (typeof ctx?.status === 'number' && typeof ctx?.clone === 'function') {
            try {
              const text = await ctx.clone().text();
              console.error('Manual sync function response status:', ctx.status);
              console.error('Manual sync function response body:', text);
              try {
                console.error('Manual sync function response json:', JSON.parse(text));
              } catch {
                // ignore
              }
            } catch (e) {
              console.error('Failed reading function error body:', e);
            }
          }
        }
        throw error;
      }
      console.log('Manual sync response:', data);

      // After invoking, fetchData will be triggered by the realtime listener
      // but we can also call it manually to be sure
      // Allow post-sync cleanup to re-run for this user.
      autoCategorizedForUserRef.current = null;
      await fetchData(session.user.id);

    } catch (error: any) {
      console.error("Manual sync failed:", error);
      alert("Failed to sync emails.");
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const fetchData = async (userId: string) => {
    setIsLoading(true);
    try {
      // Fetch Messages
      const { data: msgs, error: msgsError } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .order('received_at', { ascending: false });

      if (msgsError) {
        console.error('Fetch messages error:', msgsError);
      }

      if (msgs && msgs.length > 0) {
        const normalizedMessages: Message[] = msgs.map(normalizeDbMessageRow);

        // Prevent irrelevant promo/spam from ever rendering (no UI flash).
        const irrelevantIds = normalizedMessages
          .filter((m) => !passesBusinessRelevanceGate(m.channel, m.subject, m.body))
          .map((m) => m.id);

        const irrelevantIdSet = new Set(irrelevantIds);
        const relevantMessages =
          irrelevantIdSet.size === 0
            ? normalizedMessages
            : normalizedMessages.filter((m) => !irrelevantIdSet.has(m.id));

        setMessages(relevantMessages);

        // Delete filtered-out rows from DB in the background (preserve space).
        if (irrelevantIds.length > 0) {
          (async () => {
            try {
              console.log(`FetchData: purging ${irrelevantIds.length} irrelevant messages from DB...`);
              await purgeMessagesByIds(userId, irrelevantIds, 'FetchData');
            } catch (e) {
              console.error('FetchData: purge threw:', e);
            }
          })();
        }
      } else {
        setMessages([]);
      }

      // Fetch Policies
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

    } catch (err) {
      console.error('fetchData failed:', err);
    } finally {
      setIsLoading(false);
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

          // If a newly inserted email isn't business-relevant, remove it immediately.
          if (!passesBusinessRelevanceGate(normalized.channel, normalized.subject, normalized.body)) {
            console.log('Realtime: deleting irrelevant inserted message', normalized.id);
            supabase
              .from('messages')
              .delete()
              .eq('user_id', user.id)
              .eq('id', normalized.id)
              .then(({ error }) => {
                if (error) console.error('Realtime: delete irrelevant message failed:', error);
              });
            return;
          }

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // NOTE: Removed demo-only "simulate incoming messages" behavior.

  const handleSelectMessage = async (id: string) => {
    const updatedMessages = messages.map(m => 
      m.id === id ? { ...m, isRead: true } : m
    );
    setMessages(updatedMessages);
    setSelectedMessageId(id);
    
    // Update in Supabase
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('id', id);
  };

  const handleReplySent = async (ids: string[], reply: string) => {
    console.log(`Sending reply to ${ids.length} recipients: ${reply}`);
    const updatedMessages = messages.map(m => 
        ids.includes(m.id) ? { ...m, isReplied: true } : m
    );
    setMessages(updatedMessages);

    // NOTE: We do not persist `is_replied` here because this demo does not
    // actually send messages via Gmail. Reply state is derived from Gmail sync.
  };

  const handleUpdatePolicies = async (updatedPolicies: BusinessPolicy[]) => {
    setPolicies(updatedPolicies);
    
    if (!user) return;

    // This is a simplified bulk update. In production, you'd want to handle 
    // inserts, updates, and deletes specifically.
    for (const policy of updatedPolicies) {
      if (policy.id.length > 20) { // Assume UUID or existing
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
        // New policy (mock ID was numerical or short)
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

      <main className="flex-1 flex overflow-hidden relative">
        {currentView === 'inbox' && (
          <>
            {/* Inbox List Column */}
            <div className={`
                ${selectedMessageId ? 'hidden lg:block' : 'w-full'} 
                lg:w-96 border-r border-slate-200 h-full
            `}>
              <MessageList 
                messages={messages} 
                selectedId={selectedMessageId} 
                onSelect={handleSelectMessage}
                isLoading={isLoading}
                onManualSync={handleManualSync}
              />
            </div>

            {/* Message Detail Column */}
            <div className={`
                ${!selectedMessageId ? 'hidden lg:flex' : 'w-full flex'} 
                flex-1 flex-col h-full bg-slate-50
            `}>
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
               />
            </div>
          </>
        )}

        {currentView === 'analytics' && (
            <Analytics messages={messages} />
        )}

        {currentView === 'policies' && (
            <PolicySettings policies={policies} onUpdatePolicies={handleUpdatePolicies} />
        )}
      </main>
    </div>
  );
};

export default App;