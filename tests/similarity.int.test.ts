// INTEGRATION TEST: This test uses the real AI and may be flaky if the model changes.
import { describe, it, expect } from 'vitest';
import { findSimilarMessages } from '../services/geminiService';
import { MessageCategory, Sentiment, ResponseCost, Channel, Message } from '../types';

describe('findSimilarMessages (integration, real AI)', () => {
  it('should find other late package messages as similar', async () => {
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

    // msg0 is the target, msg1 is the candidate
    const similarIds = await findSimilarMessages(fakeMessages[0], fakeMessages);
    // Should find msg1 as similar to msg0
    expect(similarIds).toContain('msg1');
  });
});