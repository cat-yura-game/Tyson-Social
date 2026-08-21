export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
} as const;

export const ALLOWED_VIDEO_TYPES = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
} as const;

export const ALLOWED_DOCUMENT_TYPES = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/rtf': 'rtf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
} as const;

export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;
export type AllowedVideoType = keyof typeof ALLOWED_VIDEO_TYPES;
export type AllowedMediaType = AllowedImageType | AllowedVideoType;
export type AllowedDocumentType = keyof typeof ALLOWED_DOCUMENT_TYPES;
export type AllowedStorageType = AllowedMediaType | AllowedDocumentType;

export interface MediaMetadata {
  contentType: AllowedStorageType;
  byteSize: number;
  ownerUserId: string;
  expiresAt?: string;
}

export interface StoredMedia {
  body: ReadableStream;
  metadata: MediaMetadata;
}

export interface MediaStorage {
  put(key: string, body: ReadableStream | ArrayBuffer, metadata: MediaMetadata, expiration?: number): Promise<void>;
  get(key: string): Promise<StoredMedia | null>;
  delete(key: string): Promise<void>;
}

export function assertValidMedia(contentType: string, byteSize: number, maxBytes = MAX_MEDIA_BYTES): asserts contentType is AllowedImageType {
  if (!(contentType in ALLOWED_IMAGE_TYPES)) throw new Error('Unsupported image type.');
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > maxBytes) {
    throw new Error(`Image size must be between 1 byte and ${Math.round(maxBytes / 1024 / 1024)} MiB.`);
  }
}

export function assertValidStoryMedia(contentType: string, byteSize: number, maxBytes = MAX_MEDIA_BYTES): asserts contentType is AllowedMediaType {
  if (!(contentType in ALLOWED_IMAGE_TYPES) && !(contentType in ALLOWED_VIDEO_TYPES)) throw new Error('Unsupported story media type.');
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > maxBytes) {
    throw new Error(`Story media size must be between 1 byte and ${Math.round(maxBytes / 1024 / 1024)} MiB.`);
  }
}

export function assertImageSignature(contentType: AllowedImageType, bytes: Uint8Array): void {
  const matches = contentType === 'image/jpeg'
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : contentType === 'image/png'
      ? bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])
      : contentType === 'image/webp'
        ? new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
        : new TextDecoder().decode(bytes.slice(4, 12)).includes('ftypavif');
  if (!matches) throw new Error('Image content does not match its MIME type.');
}

export function assertStoryMediaSignature(contentType: AllowedMediaType, bytes: Uint8Array): void {
  if (contentType in ALLOWED_IMAGE_TYPES) {
    assertImageSignature(contentType as AllowedImageType, bytes);
    return;
  }
  const isValid = contentType === 'video/webm'
    ? bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
    : new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp';
  if (!isValid) throw new Error('Video content does not match its MIME type.');
}

export function createMediaKey(ownerUserId: string, contentType: AllowedImageType): string {
  if (!/^[0-9a-f-]{36}$/i.test(ownerUserId)) throw new Error('Invalid owner ID.');
  return `media/${ownerUserId}/${crypto.randomUUID()}.${ALLOWED_IMAGE_TYPES[contentType]}`;
}

export function createStoryMediaKey(ownerUserId: string, contentType: AllowedMediaType): string {
  if (!/^[0-9a-f-]{36}$/i.test(ownerUserId)) throw new Error('Invalid owner ID.');
  const extension = contentType in ALLOWED_IMAGE_TYPES
    ? ALLOWED_IMAGE_TYPES[contentType as AllowedImageType]
    : ALLOWED_VIDEO_TYPES[contentType as AllowedVideoType];
  return `media/${ownerUserId}/${crypto.randomUUID()}.${extension}`;
}

export function assertValidAiDocument(contentType: string, byteSize: number, maxBytes = MAX_MEDIA_BYTES): asserts contentType is AllowedDocumentType {
  if (!(contentType in ALLOWED_DOCUMENT_TYPES)) throw new Error('Unsupported document type.');
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > maxBytes) throw new Error(`Document size must be between 1 byte and ${Math.round(maxBytes / 1024 / 1024)} MiB.`);
}

export function assertAiDocumentSignature(contentType: AllowedDocumentType, bytes: Uint8Array): void {
  const text = new TextDecoder().decode(bytes.slice(0, 8));
  const valid = contentType === 'application/pdf' ? text.startsWith('%PDF-')
    : contentType === 'application/rtf' ? text.startsWith('{\\rtf')
      : contentType === 'application/msword' ? bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
        : contentType.includes('openxmlformats') ? bytes[0] === 0x50 && bytes[1] === 0x4b
          : true;
  if (!valid) throw new Error('Document content does not match its MIME type.');
}

export function createAiAttachmentKey(ownerUserId: string, contentType: AllowedStorageType): string {
  if (!/^[0-9a-f-]{36}$/i.test(ownerUserId)) throw new Error('Invalid owner ID.');
  const extension = contentType in ALLOWED_IMAGE_TYPES ? ALLOWED_IMAGE_TYPES[contentType as AllowedImageType]
    : contentType in ALLOWED_VIDEO_TYPES ? ALLOWED_VIDEO_TYPES[contentType as AllowedVideoType]
      : ALLOWED_DOCUMENT_TYPES[contentType as AllowedDocumentType];
  return `media/${ownerUserId}/${crypto.randomUUID()}.${extension}`;
}

export class KvMediaStorage implements MediaStorage {
  constructor(private readonly namespace: KVNamespace) {}

  async put(key: string, body: ReadableStream | ArrayBuffer, metadata: MediaMetadata, expiration?: number): Promise<void> {
    if (metadata.contentType in ALLOWED_DOCUMENT_TYPES) assertValidAiDocument(metadata.contentType, metadata.byteSize);
    else assertValidStoryMedia(metadata.contentType as AllowedMediaType, metadata.byteSize);
    await this.namespace.put(key, body, { metadata, ...(expiration ? { expiration } : {}) });
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
