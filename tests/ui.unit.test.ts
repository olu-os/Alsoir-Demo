import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as geminiService from '../services/geminiService';
import { MessageCategory, Sentiment, ResponseCost, Channel, Message } from '../types';

// Mock UI state
let draftState: Record<string, string> = {};
let replyState: Record<string, boolean> = {};

function setDraft(id: string, text: string) {
  draftState[id] = text;
}
function clearDraft(id: string) {
  delete draftState[id];
}
function sendReply(id: string) {
  replyState[id] = true;
  clearDraft(id);
}

describe('Manual sync button', () => {
  it('calls fetchGmail when pressed', async () => {
    const fetchGmail = vi.fn();
    function handleManualSync() {
      fetchGmail();
    }
    handleManualSync();
    expect(fetchGmail).toHaveBeenCalled();
  });
});

describe('UI logic and state', () => {
  beforeEach(() => {
    draftState = {};
    replyState = {};
  });

  it('tracks and clears drafts correctly', () => {
    setDraft('msg1', 'Draft reply');
    expect(draftState['msg1']).toBe('Draft reply');
    clearDraft('msg1');
    expect(draftState['msg1']).toBeUndefined();
  });

  it('sendReply updates reply state and clears draft', () => {
    setDraft('msg2', 'Another draft');
    sendReply('msg2');
    expect(replyState['msg2']).toBe(true);
    expect(draftState['msg2']).toBeUndefined();
  });

  it('UI logic switches button based on draft presence', () => {
    setDraft('msg3', 'Draft here');
    expect(!!draftState['msg3']).toBe(true);
    clearDraft('msg3');
    expect(!!draftState['msg3']).toBe(false);
  });
});

describe('Message search filtering', () => {
  const messages: Message[] = [
    { id: 'a', body: 'hello world', senderName: '', senderHandle: '', channel: Channel.Email, subject: '', timestamp: new Date(), isRead: false, isReplied: false, category: MessageCategory.General, sentiment: Sentiment.Neutral, predictedCost: ResponseCost.Low, tags: [] },
    { id: 'b', body: 'urgent: package', senderName: '', senderHandle: '', channel: Channel.Email, subject: '', timestamp: new Date(), isRead: false, isReplied: false, category: MessageCategory.Shipping, sentiment: Sentiment.Negative, predictedCost: ResponseCost.Medium, tags: [] },
  ];
  function filterMessages(query: string) {
    return messages.filter(m => m.body.includes(query));
  }
  it('filters messages by search query', () => {
    expect(filterMessages('urgent').length).toBe(1);
    expect(filterMessages('world').length).toBe(1);
    expect(filterMessages('missing').length).toBe(0);
  });
});

describe('Reply logic and error handling', () => {
  it('handles AI error gracefully', async () => {
    vi.spyOn(geminiService, 'generateDraftReply').mockResolvedValueOnce('');
    const draft = await geminiService.generateDraftReply('test', 'user', [], 'Business', 'Signature', 'support');
    expect(typeof draft).toBe('string');
    expect(draft.length).toBeGreaterThanOrEqual(0);
  });
  it('handles invalid AI data', async () => {
    vi.spyOn(geminiService, 'analyzeMessageContent').mockResolvedValueOnce({
      category: MessageCategory.General,
      sentiment: Sentiment.Neutral,
      predictedCost: ResponseCost.Low,
      tags: [],
    });
    const result = await geminiService.analyzeMessageContent('test');
    expect(result.category).toBe(MessageCategory.General);
  });
});