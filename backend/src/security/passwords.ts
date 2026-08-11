import { base64UrlDecode, base64UrlEncode, constantTimeEqual, utf8 } from './encoding';

const ALGORITHM = 'PBKDF2';
const DIGEST = 'SHA-256';
// Free-tier Workers have a strict CPU budget. Keep this at the minimum accepted
// by verifyPassword; increase it when the Worker CPU limit is raised.
const ITERATIONS = 100_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const PREFIX = 'pbkdf2_sha256';

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', utf8(password), ALGORITHM, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: ALGORITHM, hash: DIGEST, salt, iterations },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(hash)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [prefix, iterationsText, saltText, hashText] = encoded.split('$');
  const iterations = Number(iterationsText);
  if (prefix !== PREFIX || !Number.isSafeInteger(iterations) || iterations < 100_000 || !saltText || !hashText) {
    return false;
  }

  try {
    const expected = base64UrlDecode(hashText);
    const actual = await derive(password, base64UrlDecode(saltText), iterations);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}
