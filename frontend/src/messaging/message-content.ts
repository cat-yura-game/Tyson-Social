import { getSticker, type StickerId } from './stickers';

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'sticker'; stickerId: StickerId };

export type EncryptedMessagePayload = MessageContent & { version: 1; sentAt: string };

export function parseMessageContent(value: unknown): MessageContent {
  if (!value || typeof value !== 'object') throw new Error('Invalid encrypted message payload.');
  const payload = value as Record<string, unknown>;

  // Backwards compatibility for messages written before typed payloads existed.
  if (typeof payload.text === 'string' && (payload.type === undefined || payload.type === 'text')) {
    return { type: 'text', text: payload.text };
  }
  if (payload.type === 'sticker' && typeof payload.stickerId === 'string' && getSticker(payload.stickerId)) {
    return { type: 'sticker', stickerId: payload.stickerId as StickerId };
  }
  throw new Error('Unsupported encrypted message payload.');
}
