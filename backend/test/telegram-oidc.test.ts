import { describe, expect, it } from 'vitest';
import { createTelegramAuthorizationUrl } from '../src/services/telegram-oidc';
import type { Env } from '../src/types';

describe('Telegram OIDC authorization', () => {
  it('uses authorization code flow, PKCE and nonce without exposing the client secret', () => {
    const env = {
      TELEGRAM_OIDC_CLIENT_ID: '8890017118',
      TELEGRAM_OIDC_CLIENT_SECRET: 'server-secret',
      TELEGRAM_OIDC_REDIRECT_URI: 'https://api.example.com/api/auth/telegram/callback',
    } as Env;
    const url = new URL(createTelegramAuthorizationUrl(env, {
      state: 'state-value', nonce: 'nonce-value', codeChallenge: 'challenge-value',
    }));
    expect(url.origin).toBe('https://oauth.telegram.org');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid profile');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('nonce')).toBe('nonce-value');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.toString()).not.toContain('server-secret');
  });
});
