export enum ResponseMode {
  Draft = 'Draft',
  AutoSend = 'AutoSend'
}

export interface AppSettings {
  responseMode: ResponseMode;
  autoPilotCategories: MessageCategory[];
  businessName: string;
  signature: string;
  autoSendAIResponses: boolean;
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
  timestamp: Date;
  isRead: boolean;
  isReplied: boolean;
  category: MessageCategory;
  sentiment: Sentiment;
  predictedCost: ResponseCost;
  suggestedReply?: string;
  tags: string[];
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
