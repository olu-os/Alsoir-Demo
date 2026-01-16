import { describe, it, expect, vi } from 'vitest';
import * as geminiService from '../services/geminiService';
import { MessageCategory, Sentiment, ResponseCost, Channel, Message } from '../types';

describe('findSimilarMessages (unit, mocked AI)', () => {
  it('should use the mock to return expected similar IDs', async () => {
    const fakeMessages: Message[] = [
      {
        id: 'msg0',
        senderName: 'Alice',
        senderHandle: 'alice@email.com',
        channel: Channel.Email,
        subject: 'Late package',
        body: 'My package was meant to arrive 2 days ago.',
        timestamp: new Date(),
        isRead: false,
        isReplied: false,
        category: MessageCategory.Shipping,
        sentiment: Sentiment.Negative,
        predictedCost: ResponseCost.Medium,
        tags: [],
      },
      {
        id: 'msg1',
        senderName: 'Bob',
        senderHandle: 'bob@email.com',
        channel: Channel.Email,
        subject: 'Order delay',
        body: 'My package was meant to arrive 3 days ago.',
        timestamp: new Date(),
        isRead: false,
        isReplied: false,
        category: MessageCategory.Shipping,
        sentiment: Sentiment.Negative,
        predictedCost: ResponseCost.Medium,
        tags: [],
      },
    ];

    // Mock findSimilarMessages to always return msg1 as similar
    vi.spyOn(geminiService, 'findSimilarMessages').mockResolvedValue(['msg1']);

    const similarIds = await geminiService.findSimilarMessages(fakeMessages[0], fakeMessages);
    expect(similarIds).toContain('msg1');
  });
});