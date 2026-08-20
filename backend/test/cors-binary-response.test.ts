import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { secureCors } from '../src/middleware/cors';
import type { AppVariables, Env } from '../src/types';

describe('binary API responses', () => {
  it('preserves CORS headers on a binary body', async () => {
    const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
    app.use('*', secureCors);
    app.get('/binary', (c) => c.body(new Uint8Array([1, 2, 3]).buffer, 200, {
      'content-type': 'application/octet-stream',
    }));

    const response = await app.request('/binary', {
      headers: { origin: 'https://tysonsocial.eu.cc' },
    }, { ALLOWED_ORIGINS: 'https://tysonsocial.eu.cc' } as Env);

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tysonsocial.eu.cc');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
