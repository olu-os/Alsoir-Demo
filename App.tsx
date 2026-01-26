import React, { useState, useEffect, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import Navigation from './components/Navigation';
import MessageList from './components/MessageList';
import MessageDetail from './components/MessageDetail';
import Analytics from './components/Analytics';
import PolicySettings from './components/PolicySettings';
import SettingsPage from './components/SettingsPage';
import SignIn from './components/SignIn';
import { INITIAL_POLICIES } from './constants';
import { Message, BusinessPolicy } from './types';
import { analyzeMessageContent } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import { decodeHtmlEntities } from './services/text';


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

  const [sentRepliesByMessage, setSentRepliesByMessage] = useState<{ [messageId: string]: string[] }>({});

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

    // Poll for new messages every 5 seconds when user is logged in
    useEffect(() => {
      if (!user?.id) return;
      setIsLoading(true);
      const interval = setInterval(() => {
        fetchData(user.id, true);
      }, 5000);
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
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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

      const timeoutMs = 3000;
      const raceResult = await Promise.race([
        invokePromise.then((res) => ({ timedOut: false as const, res })),
        new Promise<{ timedOut: true }>((resolve) => setTimeout(() => resolve({ timedOut: true }), timeoutMs)),
      ]);

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
            autoCategorizedForUserRef.current = null;
            await fetchData(session.user.id);
          })
          .catch((e) => {
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
        if (maybeAny?.context) {
          const ctx: any = maybeAny.context;
          console.error('Manual sync function context:', ctx);
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

      autoCategorizedForUserRef.current = null;
      await fetchData(session.user.id);

    } catch (error: any) {
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
        const normalizedMessages: Message[] = msgs.map(normalizeDbMessageRow);
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
    console.log(`Sending reply to ${ids.length} recipients: ${reply}`);
    const updatedMessages = messages.map(m => 
        ids.includes(m.id) ? { ...m, isReplied: true } : m
    );
    setMessages(updatedMessages);
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

      <main className="flex-1 flex overflow-hidden relative">
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
                showSyncedToast={showSyncedToast}
                drafts={drafts}
                demoMode={isDemoUser}
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
                 drafts={drafts}
                 setDrafts={setDrafts}
                 businessName={settings.businessName}
                 signature={settings.signature}
                 aiPersonality={settings.aiPersonality}
                 onUpdateAiPersonality={handleUpdateAiPersonality}
                 bulkReplyMode={settings.bulkReplyMode}
                 sentRepliesByMessage={sentRepliesByMessage}
                 setSentRepliesByMessage={setSentRepliesByMessage}
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

        {currentView === 'settings' && (
            <SettingsPage settings={settings} onUpdateSettings={handleUpdateSettings} />
        )}
      </main>
    </div>
  );
};

export default App;