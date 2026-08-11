import { describe, expect, it } from 'vitest';
import { parseMessageContent } from './message-content';

describe('parseMessageContent', () => {
  it('keeps old text messages readable', () => {
    expect(parseMessageContent({ text: 'Привет' })).toEqual({ type: 'text', text: 'Привет' });
  });

  it('accepts only stickers from the bundled allowlist', () => {
    expect(parseMessageContent({ type: 'sticker', stickerId: 'love' })).toEqual({ type: 'sticker', stickerId: 'love' });
    expect(() => parseMessageContent({ type: 'sticker', stickerId: 'https://evil.example/pixel' })).toThrow();
  });
});
