import { describe, expect, it } from 'vitest';
import { assertImageSignature, assertValidMedia, createMediaKey, MAX_MEDIA_BYTES } from '../src/services/media-storage';

describe('media storage policy', () => {
  it('accepts supported images within the MVP limit', () => {
    expect(() => assertValidMedia('image/webp', MAX_MEDIA_BYTES)).not.toThrow();
  });

  it('rejects oversized and unsupported uploads', () => {
    expect(() => assertValidMedia('image/webp', MAX_MEDIA_BYTES + 1)).toThrow();
    expect(() => assertValidMedia('image/svg+xml', 100)).toThrow();
  });

  it('generates opaque server-side keys without client filenames', () => {
    const key = createMediaKey('123e4567-e89b-12d3-a456-426614174000', 'image/jpeg');
    expect(key).toMatch(/^media\/123e4567-e89b-12d3-a456-426614174000\/[0-9a-f-]{36}\.jpg$/);
  });

  it('checks image signatures instead of trusting the MIME header', () => {
    expect(() => assertImageSignature('image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).not.toThrow();
    expect(() => assertImageSignature('image/jpeg', new TextEncoder().encode('<script>'))).toThrow();
  });
});
