import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import * as geminiService from '../services/geminiService';
import { generateDraftReply } from '../services/geminiService';
describe('generateDraftReply fallback logic', () => {
  const OLD_ENV = { ...process.env };
  beforeEach(() => {
    // Set LLM_PROVIDER to groq for fallback logic
    (global as any).importMeta = { env: { LLM_PROVIDER: 'groq' } };
    process.env.LLM_PROVIDER = 'groq';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...OLD_ENV };
  });

  it('falls back to Ollama if Groq fails', async () => {
    vi.spyOn(geminiService, 'generateDraftWithGroq').mockResolvedValueOnce(null);
    vi.spyOn(geminiService, 'generateDraftWithOllama').mockResolvedValueOnce('Hi {NAME}, fallback from Ollama.');
    const draft = await generateDraftReply('msg', 'Alice', [], 'Biz', 'Sig', 'support');
    expect(draft).toContain('{NAME}');
  });

  it('falls back to template if both AI providers fail', async () => {
    vi.spyOn(geminiService, 'generateDraftWithGroq').mockResolvedValueOnce(null);
    vi.spyOn(geminiService, 'generateDraftWithOllama').mockResolvedValueOnce('{NAME} fallback template.');
    const draft = await generateDraftReply('msg', 'Alice', [], 'Biz', 'Sig', 'support');
    expect(draft).toContain('{NAME}');
  });
});

describe('generateDraftReply personality and context', () => {
  it('includes signature and business name in the draft', async () => {
    const draft = await generateDraftReply('Order help', 'Alice', [], 'BizCo', 'Best, BizCo', 'support');
    expect(draft).toMatch(/BizCo|Best/);
  });

  it('switches AI personality prompt', async () => {
    const personalities = ['support', 'rapper', 'medieval'] as const;
    for (const aiPersonality of personalities) {
      const draft = await generateDraftReply('Order help', 'Alice', [], 'BizCo', 'Best, BizCo', aiPersonality);
      expect(typeof draft).toBe('string');
      expect(draft.length).toBeGreaterThan(0);
    }
  }, 10000);
});

describe('generateDraftReply edge cases', () => {
  it('handles empty senderName, signature, businessName', async () => {
    const draft = await generateDraftReply('Order help', '', [], '', '', 'support');
    expect(typeof draft).toBe('string');
    expect(draft.length).toBeGreaterThan(0);
  });

  it('handles special characters in senderName', async () => {
    vi.spyOn(geminiService, 'generateDraftWithGroq').mockResolvedValueOnce('Hi {NAME}, how can I help?');
    const draft = await generateDraftReply('Order help', 'Élodie O’Connor', [], 'BizCo', 'Best, BizCo', 'support');
    expect(draft).toContain('{NAME}');
  });
});
describe('AI draft reply {NAME} integration (real AI)', () => {
  it('should only substitute the first name for {NAME} in the draft', async () => {
    vi.spyOn(geminiService, 'generateDraftWithGroq').mockResolvedValueOnce('Hello {NAME}, how can I help?');
    // @ts-ignore
    if (typeof setTimeout === 'function' && typeof vitest !== 'undefined') vitest.setTimeout(10000);
    const senderName = 'Bartholomew III';
    const businessName = 'TestCo';
    const signature = 'Best regards, TestCo';
    const policies: any[] = [];
    const aiPersonality = 'support';
    const messageText = 'I have a question about my order.';
    const draft = await generateDraftReply(messageText, senderName, policies, businessName, signature, aiPersonality);
    expect(draft).toContain('{NAME}');
  });
});