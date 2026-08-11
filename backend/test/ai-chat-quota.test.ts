import { describe, expect, it } from 'vitest';
import { aiDailyRequestLimit } from '../src/ai/chat-quota';

describe('AI chat daily quota', () => {
  it('allows ten requests for a regular account', () => {
    expect(aiDailyRequestLimit(false)).toBe(10);
  });

  it('adds ten requests when Telegram is linked', () => {
    expect(aiDailyRequestLimit(true)).toBe(20);
  });
});
