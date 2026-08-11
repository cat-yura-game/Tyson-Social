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

  it('validates shared posts and encrypted image metadata', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    expect(parseMessageContent({ type: 'post', postId: id })).toEqual({ type: 'post', postId: id });
    expect(() => parseMessageContent({ type: 'post', postId: '../admin' })).toThrow();
    expect(parseMessageContent({ type: 'image', attachmentId: id, key: 'A'.repeat(44), nonce: 'B'.repeat(32), mimeType: 'image/png' })).toMatchObject({ type: 'image', attachmentId: id });
  });
});
