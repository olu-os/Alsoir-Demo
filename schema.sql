-- Messages Table
CREATE TABLE messages (
  id TEXT PRIMARY KEY, -- Using Gmail's message ID as the primary key
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name TEXT,
  sender_handle TEXT,
  channel TEXT NOT NULL DEFAULT 'Email',
  subject TEXT,
  body TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  is_read BOOLEAN DEFAULT FALSE,
  is_replied BOOLEAN DEFAULT FALSE,
  category TEXT DEFAULT 'General',
  sentiment TEXT DEFAULT 'Neutral',
  predicted_cost TEXT DEFAULT 'Low',
  ai_draft_response TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'
);

-- Helpful indexes for messages
CREATE INDEX IF NOT EXISTS messages_user_id_received_at_idx ON messages(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS messages_channel_idx ON messages(channel);
CREATE INDEX IF NOT EXISTS messages_is_read_idx ON messages(is_read);
CREATE INDEX IF NOT EXISTS messages_is_replied_idx ON messages(is_replied);
CREATE INDEX IF NOT EXISTS messages_tags_gin_idx ON messages USING GIN (tags);
CREATE INDEX IF NOT EXISTS messages_metadata_gin_idx ON messages USING GIN (metadata);

-- Policies Table
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Connected Accounts Table (for OAuth tokens)
CREATE TABLE connected_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('Gmail', 'Etsy', 'Instagram')),
  platform_user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  UNIQUE(user_id, platform)
);

-- Account indexes
CREATE INDEX IF NOT EXISTS connected_accounts_user_platform_idx ON connected_accounts(user_id, platform);

-- Row Level Security (RLS)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;

-- Policies for Messages
CREATE POLICY "Users can only view their own messages" ON messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messages" ON messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages" ON messages
  FOR UPDATE USING (auth.uid() = user_id);

-- Policies for Policies
CREATE POLICY "Users can only view their own policies" ON policies
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own policies" ON policies
  FOR ALL USING (auth.uid() = user_id);

-- Policies for Connected Accounts
CREATE POLICY "Users can only view their own accounts" ON connected_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own accounts" ON connected_accounts
  FOR ALL USING (auth.uid() = user_id);

-- Additional Tables

-- Profiles (app-specific user profile info)
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON profiles FOR ALL USING (auth.uid() = user_id);

-- Message Replies (outbound replies tracked by app)
CREATE TABLE IF NOT EXISTS message_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  via_channel TEXT NOT NULL DEFAULT 'Email',
  external_id TEXT, -- e.g., Gmail sent message id
  status TEXT NOT NULL DEFAULT 'queued', -- queued|sent|failed
  error TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE message_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own replies" ON message_replies FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS message_replies_message_idx ON message_replies(message_id);

-- Sync Status (track sync cursors and last run)
CREATE TABLE IF NOT EXISTS sync_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('Gmail','Etsy','Instagram','Shopify')),
  last_synced_at TIMESTAMPTZ,
  cursor TEXT,
  status TEXT DEFAULT 'idle', -- idle|running|error
  error TEXT,
  stats JSONB DEFAULT '{}'
);
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sync status" ON sync_status FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS sync_status_user_provider_idx ON sync_status(user_id, provider);
