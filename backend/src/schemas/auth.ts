import { z } from 'zod';

const username = z.string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_]+$/, 'Username may contain only letters, numbers and underscores.')
  .transform((value) => value.toLowerCase());

const password = z.string().min(12).max(128);

export const registerSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  username,
  displayName: z.string().trim().min(1).max(80),
  password,
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password,
}).strict();

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  bio: z.string().trim().max(500).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export async function parseJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) throw new Error('CONTENT_TYPE');
  return request.json();
}
