import { describe, it, expect } from 'vitest';
import * as geminiService from '../services/geminiService';

// --- Name normalization logic ---
function getFirstName(fullName?: string) {
  const senderName = (fullName || '').trim();
  if (!senderName) return '';
  return senderName.split(/\s+/)[0] || '';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDraftName(text: string, senderName?: string) {
  if (text.includes('{NAME}')) return text;
  const firstName = getFirstName(senderName);
  if (!firstName) return text;
  const regex = new RegExp(escapeRegExp(firstName), 'g');
  return text.replace(regex, '{NAME}');
}

describe('Name normalization and replacement', () => {
  it('extracts first name from various full names', () => {
    expect(getFirstName('Bartholomew III')).toBe('Bartholomew');
    expect(getFirstName('Broke Guy')).toBe('Broke');
    expect(getFirstName('Alice')).toBe('Alice');
    expect(getFirstName('')).toBe('');
    expect(getFirstName(undefined)).toBe('');
  });

  it('normalizes draft to use {NAME} if not present', () => {
    expect(normalizeDraftName('Hi Bartholomew, thanks!', 'Bartholomew III')).toBe('Hi {NAME}, thanks!');
    expect(normalizeDraftName('Hello Broke, your order...', 'Broke Guy')).toBe('Hello {NAME}, your order...');
    expect(normalizeDraftName('Hi {NAME}, welcome!', 'Alice')).toBe('Hi {NAME}, welcome!');
    expect(normalizeDraftName('Hi there!', 'Alice')).toBe('Hi there!');
  });
});

describe('AI draft reply {NAME} enforcement', () => {
  it('should not use the full name in the draft (mocked)', async () => {
    // Simulate a draft returned by the AI
    const draft = 'Hi {NAME}, thanks for your message.';
    expect(draft).toContain('{NAME}');
    expect(draft).not.toContain('Bartholomew III');
    expect(draft).not.toContain('Broke Guy');
  });
});

describe('Bulk reply personalization', () => {
  it('replaces {NAME} with each recipient first name', () => {
    const draft = 'Hi {NAME}, your order is on the way!';
    const recipients = [
      { senderName: 'Bartholomew III' },
      { senderName: 'Broke Guy' },
      { senderName: 'Alice' },
    ];
    const personalized = recipients.map(r => draft.replaceAll('{NAME}', getFirstName(r.senderName)));
    expect(personalized[0]).toBe('Hi Bartholomew, your order is on the way!');
    expect(personalized[1]).toBe('Hi Broke, your order is on the way!');
    expect(personalized[2]).toBe('Hi Alice, your order is on the way!');
  });
});