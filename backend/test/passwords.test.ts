import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/security/passwords';

describe('password hashing', () => {
  it('stores a salted PBKDF2 hash and verifies the matching password', async () => {
    const encoded = await hashPassword('correct horse battery staple');
    expect(encoded).toMatch(/^pbkdf2_sha256\$210000\$/u);
    await expect(verifyPassword('correct horse battery staple', encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', encoded)).resolves.toBe(false);
  });

  it('uses a unique salt for every password', async () => {
    const first = await hashPassword('same secure password');
    const second = await hashPassword('same secure password');
    expect(first).not.toBe(second);
  });
});
