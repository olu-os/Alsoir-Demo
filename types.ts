export enum ResponseMode {
  Draft = 'Draft',
  AutoSend = 'AutoSend'
}

export interface AppSettings {
  businessName: string;
  signature: string;
  autoSendAIResponses: boolean;
  confirmBeforeSend: boolean;
  bulkReplyMode: 'autoSend' | 'draft';
  aiPersonality: 'support' | 'rapper' | 'medieval';
  darkMode: boolean;
}
export enum MessageCategory {
  Shipping = 'Shipping',
  Returns = 'Returns',
  Product = 'Product',
  Custom = 'Custom',
  General = 'General',
  Complaint = 'Complaint',
  Other = 'Other'
}

export enum Sentiment {
  Positive = 'Positive',
  Neutral = 'Neutral',
  Negative = 'Negative'
}

export enum ResponseCost {
  Low = 'Low',     // Simple query, automated reply possible
  Medium = 'Medium', // Needs verification
  High = 'High'    // Complex custom request or angry customer
}

export enum Channel {
  Email = 'Email',
  Instagram = 'Instagram',
  Etsy = 'Etsy',
  Shopify = 'Shopify'
}

export interface Message {
  id: string;
  senderName: string;
  senderHandle: string;
  channel: Channel;
  subject?: string;
  body: string;
  fullBodyFetched?: boolean;
  timestamp: Date;
  isRead: boolean;
  isReplied: boolean;
  category: MessageCategory;
  sentiment: Sentiment;
  predictedCost: ResponseCost;
  suggestedReply?: string;
  tags: string[];
  threadId?: string;
  trashedAt?: string;
}

export interface BusinessPolicy {
  id: string;
  title: string;
  content: string;
  category?: string;
}

export interface AnalysisResult {
  category: MessageCategory;
  sentiment: Sentiment;
  predictedCost: ResponseCost;
  tags: string[];
}

// --- Telemetry / Observability types (internal layer) ---

export type AppEventType =
  | 'AI_DRAFT_GENERATED'
  | 'AI_CLASSIFICATION'
  | 'FIND_SIMILAR'
  | 'REPLY_SENT'
  | 'AI_PROVIDER_FALLBACK'
  | 'AI_PROVIDER_ERROR'
  | 'SYNC_GMAIL'
  | 'MESSAGE_TRASHED'
  | 'MESSAGE_RESTORED'
  | 'MESSAGE_PURGED';

export type AppEventStatus = 'success' | 'failed' | 'fallback';

export interface AppEvent {
  id?: string;
  user_id?: string;
  type: AppEventType;
  status: AppEventStatus;
  payload?: Record<string, unknown>;
  latency_ms?: number;
  error?: string;
  created_at?: string;
}

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'investigating' | 'resolved';

export interface Incident {
  id?: string;
  user_id?: string;
  title: string;
  root_cause?: string;
  severity: IncidentSeverity;
  suggested_fix?: string;
  status: IncidentStatus;
  linked_event_ids?: string[];
  created_at?: string;
  updated_at?: string;
}
