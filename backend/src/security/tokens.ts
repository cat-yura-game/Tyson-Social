import { base64UrlEncode, utf8 } from './encoding';

export function randomToken(byteLength = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', utf8(value));
  return base64UrlEncode(new Uint8Array(digest));
}

export async function keyedHash(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, utf8(value));
  return base64UrlEncode(new Uint8Array(signature));
}
