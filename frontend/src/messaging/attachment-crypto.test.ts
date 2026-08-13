import { describe, expect, it } from 'vitest';
import { attachmentDigest, decryptAttachment, encryptAttachment } from './crypto';

describe('encrypted Messenger attachments', () => {
  it('round-trips binary image data without changing bytes', async () => {
    const original = new Uint8Array(256 * 1024);
    crypto.getRandomValues(original.subarray(0, 65_536));
    original.copyWithin(65_536, 0, 65_536);
    original.copyWithin(131_072, 0, 131_072);

    const encrypted = await encryptAttachment(original);
    const digest = await attachmentDigest(encrypted.ciphertext);
    const decrypted = await decryptAttachment(encrypted.ciphertext, encrypted.key, encrypted.nonce);

    expect(digest).toMatch(/^[A-Za-z0-9+/]+={0,2}$/u);
    expect(decrypted).toEqual(original);
  });
});
