import { base64Encode, utf8 } from '../security/encoding';

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function keyFor(env: { SESSION_SECRET?: string }): Promise<CryptoKey> {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET is not configured.');
  const digest = await crypto.subtle.digest('SHA-256', utf8(`tyson-cloud-messages-v1:${env.SESSION_SECRET}`));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptCloudMessage(env: { SESSION_SECRET?: string }, payload: unknown): Promise<{ ciphertext: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = utf8(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, await keyFor(env), plaintext);
  return { ciphertext: base64Encode(new Uint8Array(ciphertext)), nonce: base64Encode(nonce) };
}

export async function decryptCloudMessage<T>(env: { SESSION_SECRET?: string }, ciphertext: string, nonce: string): Promise<T> {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBase64(nonce) }, await keyFor(env), decodeBase64(ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
