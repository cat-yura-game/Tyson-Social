import { getSticker, type StickerId } from './stickers';

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'sticker'; stickerId: StickerId }
  | { type: 'post'; postId: string }
  | { type: 'image'; attachmentId: string; key: string; nonce: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' };

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
  if (payload.type === 'post' && typeof payload.postId === 'string' && /^[0-9a-f-]{36}$/iu.test(payload.postId)) {
    return { type: 'post', postId: payload.postId };
  }
  if (payload.type === 'image' && typeof payload.attachmentId === 'string' && /^[0-9a-f-]{36}$/iu.test(payload.attachmentId)
    && typeof payload.key === 'string' && /^[A-Za-z0-9+/=_-]{32,256}$/u.test(payload.key)
    && typeof payload.nonce === 'string' && /^[A-Za-z0-9+/=_-]{16,256}$/u.test(payload.nonce)
    && (payload.mimeType === 'image/jpeg' || payload.mimeType === 'image/png' || payload.mimeType === 'image/webp')) {
    return { type: 'image', attachmentId: payload.attachmentId, key: payload.key, nonce: payload.nonce, mimeType: payload.mimeType };
  }
  throw new Error('Unsupported encrypted message payload.');
}
