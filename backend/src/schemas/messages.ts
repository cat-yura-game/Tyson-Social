import { z } from 'zod';

const publicKey = z.string().min(32).max(256).regex(/^[A-Za-z0-9+/=_-]+$/u);

export const deviceSchema = z.object({
  deviceId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  publicKey,
}).strict();

export const conversationSchema = z.object({
  recipientUsername: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_]+$/u).transform((value) => value.toLowerCase()),
  securityMode: z.enum(['cloud', 'secret']).default('cloud'),
}).strict();

const imageContent = z.object({
  type: z.literal('image'), attachmentId: z.string().uuid(), key: z.string().min(32).max(256), nonce: z.string().min(16).max(256),
  digest: z.string().min(32).max(256).optional(), mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
}).strict();
const audioContent = z.object({
  type: z.literal('audio'), attachmentId: z.string().uuid(), key: z.string().min(32).max(256), nonce: z.string().min(16).max(256),
  digest: z.string().min(32).max(256).optional(), mimeType: z.enum(['audio/webm', 'audio/mp4', 'audio/ogg']),
  durationMs: z.number().int().positive().max(600_000),
}).strict();
const textContent = z.object({ type: z.literal('text'), text: z.string().trim().min(1).max(4000) }).strict();
const basicCloudContentSchema = z.discriminatedUnion('type', [
  textContent,
  z.object({ type: z.literal('sticker'), stickerId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/u) }).strict(),
  z.object({ type: z.literal('post'), postId: z.string().uuid() }).strict(),
  imageContent,
  audioContent,
]);
const cloudContentSchema = z.union([
  basicCloudContentSchema,
  z.object({
    type: z.literal('forwarded'),
    fromDisplayName: z.string().trim().min(1).max(80),
    content: basicCloudContentSchema,
  }).strict(),
]);

export const cloudMessageSchema = z.object({ content: cloudContentSchema }).strict();
export const editCloudMessageSchema = z.object({ content: textContent }).strict();

export const deleteMessageSchema = z.object({
  attachmentId: z.string().uuid().optional(),
}).strict();

export const messageBatchSchema = z.object({
  senderDeviceId: z.string().uuid(),
  envelopes: z.array(z.object({
    recipientDeviceId: z.string().uuid(),
    ciphertext: z.string().min(32).max(32_000).regex(/^[A-Za-z0-9+/=_-]+$/u),
    clientMessageId: z.string().min(8).max(120),
  }).strict()).min(1).max(20),
}).strict();

export const cloneAttachmentSchema = z.object({
  targetConversationId: z.string().uuid(),
}).strict();
