import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema, updateProfileSchema } from '../src/schemas/auth';

describe('auth schemas', () => {
  it('normalizes account identifiers', () => {
    const result = registerSchema.parse({
      email: ' User@Example.COM ',
      username: 'Tyson_User',
      displayName: ' Tyson User ',
      password: 'a secure password',
    });
    expect(result).toMatchObject({ email: 'user@example.com', username: 'tyson_user', displayName: 'Tyson User' });
  });

  it('rejects weak or unexpected auth input', () => {
    expect(() => loginSchema.parse({ email: 'not-email', password: 'short' })).toThrow();
    expect(() => registerSchema.parse({
      email: 'user@example.com', username: 'invalid-name', displayName: 'User', password: 'a secure password', admin: true,
    })).toThrow();
  });

  it('requires an actual profile change', () => {
    expect(() => updateProfileSchema.parse({})).toThrow();
    expect(updateProfileSchema.parse({ bio: 'Hello Tyson' })).toEqual({ bio: 'Hello Tyson' });
  });
});
