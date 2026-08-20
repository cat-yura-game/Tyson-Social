import { getSticker, type StickerId } from './stickers';

export type BasicMessageContent =
  | { type: 'text'; text: string }
  | { type: 'sticker'; stickerId: StickerId }
  | { type: 'post'; postId: string }
  | { type: 'comment'; commentId: string; postId: string }
  | { type: 'image'; attachmentId: string; key: string; nonce: string; digest?: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }
  | { type: 'audio'; attachmentId: string; key: string; nonce: string; digest?: string; mimeType: 'audio/webm' | 'audio/mp4' | 'audio/ogg'; durationMs: number };

export type MessageContent = BasicMessageContent
  | { type: 'forwarded'; fromDisplayName: string; content: BasicMessageContent };

export type EncryptedMessagePayload = MessageContent & { version: 1; sentAt: string; editedAt?: string };

function parseBasicMessageContent(payload: Record<string, unknown>): BasicMessageContent {
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
  if (payload.type === 'comment' && typeof payload.commentId === 'string' && typeof payload.postId === 'string' && /^[0-9a-f-]{36}$/iu.test(payload.commentId) && /^[0-9a-f-]{36}$/iu.test(payload.postId)) return { type: 'comment', commentId: payload.commentId, postId: payload.postId };
  if (payload.type === 'image' && typeof payload.attachmentId === 'string' && /^[0-9a-f-]{36}$/iu.test(payload.attachmentId)
    && typeof payload.key === 'string' && /^[A-Za-z0-9+/=_-]{32,256}$/u.test(payload.key)
    && typeof payload.nonce === 'string' && /^[A-Za-z0-9+/=_-]{16,256}$/u.test(payload.nonce)
    && (payload.digest === undefined || (typeof payload.digest === 'string' && /^[A-Za-z0-9+/=_-]{32,256}$/u.test(payload.digest)))
    && (payload.mimeType === 'image/jpeg' || payload.mimeType === 'image/png' || payload.mimeType === 'image/webp')) {
    return { type: 'image', attachmentId: payload.attachmentId, key: payload.key, nonce: payload.nonce, digest: typeof payload.digest === 'string' ? payload.digest : undefined, mimeType: payload.mimeType };
  }
  if (payload.type === 'audio' && typeof payload.attachmentId === 'string' && /^[0-9a-f-]{36}$/iu.test(payload.attachmentId)
    && typeof payload.key === 'string' && /^[A-Za-z0-9+/=_-]{32,256}$/u.test(payload.key)
    && typeof payload.nonce === 'string' && /^[A-Za-z0-9+/=_-]{16,256}$/u.test(payload.nonce)
    && (payload.digest === undefined || (typeof payload.digest === 'string' && /^[A-Za-z0-9+/=_-]{32,256}$/u.test(payload.digest)))
    && (payload.mimeType === 'audio/webm' || payload.mimeType === 'audio/mp4' || payload.mimeType === 'audio/ogg')
    && typeof payload.durationMs === 'number' && Number.isInteger(payload.durationMs) && payload.durationMs > 0 && payload.durationMs <= 600_000) {
    return { type: 'audio', attachmentId: payload.attachmentId, key: payload.key, nonce: payload.nonce, digest: typeof payload.digest === 'string' ? payload.digest : undefined, mimeType: payload.mimeType, durationMs: payload.durationMs };
  }
  throw new Error('Unsupported encrypted message payload.');
}

export function parseMessageContent(value: unknown): MessageContent {
  if (!value || typeof value !== 'object') throw new Error('Invalid encrypted message payload.');
  const payload = value as Record<string, unknown>;

  if (payload.type === 'forwarded' && typeof payload.fromDisplayName === 'string' && payload.fromDisplayName.trim().length > 0
    && payload.fromDisplayName.trim().length <= 80 && payload.content && typeof payload.content === 'object') {
    return {
      type: 'forwarded',
      fromDisplayName: payload.fromDisplayName.trim(),
      content: parseBasicMessageContent(payload.content as Record<string, unknown>),
    };
  }
  return parseBasicMessageContent(payload);
}
