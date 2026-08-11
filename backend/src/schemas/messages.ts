import { z } from 'zod';

const publicKey = z.string().min(32).max(256).regex(/^[A-Za-z0-9+/=_-]+$/u);

export const deviceSchema = z.object({
  deviceId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  publicKey,
}).strict();

export const conversationSchema = z.object({
  recipientUsername: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_]+$/u).transform((value) => value.toLowerCase()),
}).strict();

export const messageBatchSchema = z.object({
  senderDeviceId: z.string().uuid(),
  envelopes: z.array(z.object({
    recipientDeviceId: z.string().uuid(),
    ciphertext: z.string().min(32).max(32_000).regex(/^[A-Za-z0-9+/=_-]+$/u),
    clientMessageId: z.string().min(8).max(120),
  }).strict()).min(1).max(20),
}).strict();
