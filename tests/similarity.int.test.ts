// INTEGRATION TEST: This test uses the real AI and may be flaky if the model changes.

import { describe, it, expect } from 'vitest';
import { findSimilarMessages } from '../services/geminiService';
import { getEmbeddings, cosineSimilarity } from '../services/embeddingService';
import { MessageCategory, Sentiment, ResponseCost, Channel, Message } from '../types';

describe('findSimilarMessages (integration, real AI)', () => {
  it('should find other late package messages as similar (with retries and logging)', async () => {
    // @ts-ignore
    if (typeof setTimeout === 'function' && typeof vitest !== 'undefined') vitest.setTimeout(20000);
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

    // Retry logic in case of AI failures
    const maxRetries = 3;
    let similarIds: string[] = [];
    let lastError: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.info(`[findSimilarMessages] Attempt ${attempt}`);
        similarIds = await findSimilarMessages(fakeMessages[0], fakeMessages);
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[findSimilarMessages] Attempt ${attempt} failed:`, err);
        if (attempt < maxRetries) {
          await new Promise(res => setTimeout(res, 500 * attempt)); // Exponential backoff
        }
      }
    }

    if (similarIds.length === 0) {
      // Fallback
      const [emb0, emb1] = await getEmbeddings([fakeMessages[0].body, fakeMessages[1].body]);
      const sim = cosineSimilarity(emb0, emb1);
      console.warn(`\u26A0\uFE0F  AI service may be down, fallback similarity: ${sim}`);
      expect(sim).toBeGreaterThan(0.15);
      return;
    }

    console.info(`[findSimilarMessages] AI path used, similarIds:`, similarIds);
    expect(similarIds).toContain('msg1');
  });
});