export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
} as const;

export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

export interface MediaMetadata {
  contentType: AllowedImageType;
  byteSize: number;
  ownerUserId: string;
}

export interface StoredMedia {
  body: ReadableStream;
  metadata: MediaMetadata;
}

export interface MediaStorage {
  put(key: string, body: ReadableStream, metadata: MediaMetadata): Promise<void>;
  get(key: string): Promise<StoredMedia | null>;
  delete(key: string): Promise<void>;
}

export function assertValidMedia(contentType: string, byteSize: number): asserts contentType is AllowedImageType {
  if (!(contentType in ALLOWED_IMAGE_TYPES)) throw new Error('Unsupported image type.');
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > MAX_MEDIA_BYTES) {
    throw new Error('Image size must be between 1 byte and 5 MiB.');
  }
}

export function createMediaKey(ownerUserId: string, contentType: AllowedImageType): string {
  if (!/^[0-9a-f-]{36}$/i.test(ownerUserId)) throw new Error('Invalid owner ID.');
  return `media/${ownerUserId}/${crypto.randomUUID()}.${ALLOWED_IMAGE_TYPES[contentType]}`;
}

export class KvMediaStorage implements MediaStorage {
  constructor(private readonly namespace: KVNamespace) {}

  async put(key: string, body: ReadableStream, metadata: MediaMetadata): Promise<void> {
    assertValidMedia(metadata.contentType, metadata.byteSize);
    await this.namespace.put(key, body, { metadata });
  }

  async get(key: string): Promise<StoredMedia | null> {
    const result = await this.namespace.getWithMetadata<MediaMetadata>(key, 'stream');
    if (!result.value || !result.metadata) return null;
    return { body: result.value, metadata: result.metadata };
  }

  async delete(key: string): Promise<void> {
    await this.namespace.delete(key);
  }
}
