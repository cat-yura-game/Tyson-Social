import { describe, expect, it } from 'vitest';
import { decryptCloudMessage, encryptCloudMessage } from '../src/services/cloud-message-crypto';

describe('cloud message encryption', () => {
  const env = { SESSION_SECRET: 'a-long-test-only-session-secret-with-enough-entropy' };

  it('round-trips an account-synchronised message without exposing its plaintext', async () => {
    const payload = { type: 'text', text: 'Синхронизируемое сообщение' };
    const encrypted = await encryptCloudMessage(env, payload);

    expect(encrypted.ciphertext).not.toContain(payload.text);
    await expect(decryptCloudMessage<typeof payload>(env, encrypted.ciphertext, encrypted.nonce)).resolves.toEqual(payload);
  });
});
