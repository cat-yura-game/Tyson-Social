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

export const emailVerificationSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/u),
}).strict();

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  bio: z.string().trim().max(500).optional(),
  username: username.optional(),
  birthdayMonthDay: z.string().regex(/^\d{2}-\d{2}$/u).refine((value) => {
    const parts = value.split('-').map(Number);
    const month = parts[0] ?? 0;
    const day = parts[1] ?? 0;
    return month >= 1 && month <= 12 && day >= 1 && day <= new Date(2000, month, 0).getDate();
  }, 'Invalid birthday').nullable().optional(),
  birthdayYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
}).strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.')
  .refine(
    (value) => value.birthdayYear === undefined || value.birthdayYear === null || Boolean(value.birthdayMonthDay),
    'Birthday year requires a day and month.',
  );

export async function parseJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) throw new Error('CONTENT_TYPE');
  return request.json();
}
