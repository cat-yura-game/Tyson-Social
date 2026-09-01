import { z } from 'zod';

export const USERNAME_PATTERN = /^[A-Za-z](?:[A-Za-z0-9]|_(?=[A-Za-z0-9]))*$/u;

export const usernameSchema = z.string()
  .trim()
  .min(3, 'Username must contain at least 3 characters.')
  .max(30, 'Username must contain no more than 30 characters.')
  .regex(
    USERNAME_PATTERN,
    'Username must start with a letter, end with a letter or number, and cannot contain consecutive underscores.',
  )
  .transform((value) => value.toLowerCase());
