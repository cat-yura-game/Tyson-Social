import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import type { Env } from '../types';

const TELEGRAM_ISSUER = 'https://oauth.telegram.org';
const TELEGRAM_AUTHORIZATION_ENDPOINT = `${TELEGRAM_ISSUER}/auth`;
const TELEGRAM_TOKEN_ENDPOINT = `${TELEGRAM_ISSUER}/token`;
const telegramJwks = createRemoteJWKSet(new URL(`${TELEGRAM_ISSUER}/.well-known/jwks.json`));

const tokenResponseSchema = z.object({ id_token: z.string().min(1) });

export interface TelegramIdentityClaims {
  subject: string;
  telegramUserId: string | null;
  displayName: string | null;
  username: string | null;
  pictureUrl: string | null;
}

function requiredConfig(env: Env) {
  if (!/^\d{5,20}$/u.test(env.TELEGRAM_OIDC_CLIENT_ID)) throw new Error('Telegram OIDC client ID is not configured.');
  if (!env.TELEGRAM_OIDC_CLIENT_SECRET) throw new Error('Telegram OIDC client secret is not configured.');
  const redirect = new URL(env.TELEGRAM_OIDC_REDIRECT_URI);
  if (redirect.protocol !== 'https:') throw new Error('Telegram OIDC redirect URI must use HTTPS.');
  return { clientId: env.TELEGRAM_OIDC_CLIENT_ID, clientSecret: env.TELEGRAM_OIDC_CLIENT_SECRET, redirectUri: redirect.toString() };
}

export function createTelegramAuthorizationUrl(env: Env, input: {
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const config = requiredConfig(env);
  const url = new URL(TELEGRAM_AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid profile',
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

export async function exchangeTelegramCode(env: Env, input: {
  code: string;
  codeVerifier: string;
  expectedNonce: string;
}): Promise<TelegramIdentityClaims> {
  const config = requiredConfig(env);
  const response = await fetch(TELEGRAM_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: input.codeVerifier,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Telegram token exchange failed with HTTP ${response.status}.`);
  const token = tokenResponseSchema.parse(await response.json());
  const verified = await jwtVerify(token.id_token, telegramJwks, {
    issuer: TELEGRAM_ISSUER,
    audience: config.clientId,
    algorithms: ['RS256'],
  });
  if (verified.payload.nonce !== input.expectedNonce) throw new Error('Telegram OIDC nonce mismatch.');
  if (!verified.payload.sub) throw new Error('Telegram OIDC subject is missing.');
  const telegramId = verified.payload.id;
  return {
    subject: verified.payload.sub,
    telegramUserId: typeof telegramId === 'string' || typeof telegramId === 'number' ? String(telegramId) : null,
    displayName: typeof verified.payload.name === 'string' ? verified.payload.name.slice(0, 120) : null,
    username: typeof verified.payload.preferred_username === 'string' ? verified.payload.preferred_username.slice(0, 64) : null,
    pictureUrl: typeof verified.payload.picture === 'string' ? verified.payload.picture.slice(0, 1000) : null,
  };
}
