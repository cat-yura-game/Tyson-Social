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

type B2Env = {
  MEDIA: KVNamespace;
  B2_KEY_ID?: string;
  B2_APPLICATION_KEY?: string;
  B2_BUCKET_NAME?: string;
  B2_ENDPOINT?: string;
};

let shortsCorsConfigured = false;

/** Ensures browser uploads are allowed only from the official Tyson frontend. */
export async function ensureShortsUploadCors(env: B2Env): Promise<void> {
  if (shortsCorsConfigured || !env.B2_KEY_ID || !env.B2_APPLICATION_KEY || !env.B2_BUCKET_NAME) return;
  const credentials = btoa(`${env.B2_KEY_ID}:${env.B2_APPLICATION_KEY}`);
  const authorized = await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account', { headers: { authorization: `Basic ${credentials}` } });
  if (!authorized.ok) throw new Error(`B2 authorization failed (${authorized.status}).`);
  const auth = await authorized.json() as { accountId: string; authorizationToken: string; apiInfo: { storageApi: { apiUrl: string; allowed: { buckets: Array<{ id: string; name: string | null }> } } } };
  const bucket = auth.apiInfo.storageApi.allowed.buckets.find((item) => item.name === env.B2_BUCKET_NAME);
  if (!bucket) throw new Error('B2 application key does not allow the configured bucket.');
  const listed = await fetch(`${auth.apiInfo.storageApi.apiUrl}/b2api/v4/b2_list_buckets`, { method: 'POST', headers: { authorization: auth.authorizationToken, 'content-type': 'application/json' }, body: JSON.stringify({ accountId: auth.accountId, bucketId: bucket.id }) });
  if (!listed.ok) throw new Error(`B2 bucket lookup failed (${listed.status}).`);
  const details = await listed.json() as { buckets: Array<{ bucketType: string; bucketInfo?: Record<string, string>; lifecycleRules?: unknown[]; corsRules?: Array<{ allowedOrigins?: string[]; allowedOperations?: string[] }> }> };
  const current = details.buckets[0];
  if (!current) throw new Error('B2 bucket details are unavailable.');
  const exists = current.corsRules?.some((rule) => rule.allowedOrigins?.includes('https://tysonsocial.eu.cc') && rule.allowedOperations?.includes('s3_put'));
  if (exists) { shortsCorsConfigured = true; return; }
  const corsRules = [...(current.corsRules ?? []), { corsRuleName: 'tyson-shorts-s3-upload', allowedOrigins: ['https://tysonsocial.eu.cc'], allowedHeaders: ['*'], allowedOperations: ['s3_put'], exposeHeaders: ['etag'], maxAgeSeconds: 3600 }];
  const updated = await fetch(`${auth.apiInfo.storageApi.apiUrl}/b2api/v4/b2_update_bucket`, { method: 'POST', headers: { authorization: auth.authorizationToken, 'content-type': 'application/json' }, body: JSON.stringify({ accountId: auth.accountId, bucketId: bucket.id, bucketType: current.bucketType, bucketInfo: current.bucketInfo ?? {}, lifecycleRules: current.lifecycleRules ?? [], corsRules }) });
  if (!updated.ok) throw new Error(`B2 CORS update failed (${updated.status}).`);
  shortsCorsConfigured = true;
}

interface B2Authorization {
  authorizationToken: string;
  apiUrl: string;
  downloadUrl: string;
  bucketId: string;
}

function b2FileName(key: string): string {
  return key.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function b2HeaderValue(value: string): string {
  return encodeURIComponent(value);
}

function fromB2Header(value: string | null): string | undefined {
  if (!value) return undefined;
  try { return decodeURIComponent(value); } catch { return value; }
}

async function sha1Hex(body: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', body);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
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

export function createShortVideoKey(ownerUserId: string, contentType: AllowedVideoType): string {
  if (!/^[0-9a-f-]{36}$/i.test(ownerUserId)) throw new Error('Invalid owner ID.');
  return `media/${ownerUserId}/shorts/${crypto.randomUUID()}.${ALLOWED_VIDEO_TYPES[contentType]}`;
}

function awsEncode(value: string): string { return encodeURIComponent(value).replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`); }
function awsDate(value: Date): { date: string; timestamp: string } { const iso = value.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z'); return { date: iso.slice(0, 8), timestamp: iso }; }
async function hmac(key: ArrayBuffer | string, value: string): Promise<ArrayBuffer> { return crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', typeof key === 'string' ? new TextEncoder().encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(value)); }
function hex(value: ArrayBuffer): string { return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }

/** A key-bound S3-compatible URL lets browsers upload large videos without receiving B2 credentials. */
export async function createB2UploadUrl(env: B2Env, key: string, expiresSeconds = 900): Promise<string | null> {
  if (!env.B2_KEY_ID || !env.B2_APPLICATION_KEY || !env.B2_BUCKET_NAME || !env.B2_ENDPOINT) return null;
  const endpoint = new URL(env.B2_ENDPOINT);
  const region = endpoint.hostname.match(/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/iu)?.[1];
  if (!region) throw new Error('B2 endpoint must use the S3-compatible regional URL.');
  const { date, timestamp } = awsDate(new Date()); const credentialScope = `${date}/${region}/s3/aws4_request`;
  const query = new Map<string, string>([['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'], ['X-Amz-Credential', `${env.B2_KEY_ID}/${credentialScope}`], ['X-Amz-Date', timestamp], ['X-Amz-Expires', String(expiresSeconds)], ['X-Amz-SignedHeaders', 'host']]);
  const canonicalQuery = [...query.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${awsEncode(name)}=${awsEncode(value)}`).join('&');
  const canonicalUri = `/${awsEncode(env.B2_BUCKET_NAME)}/${key.split('/').map(awsEncode).join('/')}`;
  const canonicalRequest = `PUT\n${canonicalUri}\n${canonicalQuery}\nhost:${endpoint.host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const stringToSign = `AWS4-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)))}`;
  let signingKey = await hmac(`AWS4${env.B2_APPLICATION_KEY}`, date); signingKey = await hmac(signingKey, region); signingKey = await hmac(signingKey, 's3'); signingKey = await hmac(signingKey, 'aws4_request');
  endpoint.pathname = canonicalUri; endpoint.search = `${canonicalQuery}&X-Amz-Signature=${hex(await hmac(signingKey, stringToSign))}`;
  return endpoint.toString();
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

/** Backblaze B2 is used for new media. KV remains as a fallback for files uploaded before migration. */
export class BackblazeB2MediaStorage implements MediaStorage {
  constructor(private readonly config: Required<Pick<B2Env, 'B2_KEY_ID' | 'B2_APPLICATION_KEY' | 'B2_BUCKET_NAME'>>) {}

  private async authorize(): Promise<B2Authorization> {
    const credentials = btoa(`${this.config.B2_KEY_ID}:${this.config.B2_APPLICATION_KEY}`);
    const response = await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account', { headers: { authorization: `Basic ${credentials}` } });
    if (!response.ok) throw new Error(`B2 authorization failed (${response.status}).`);
    const data = await response.json() as { authorizationToken: string; apiInfo: { storageApi: { apiUrl: string; downloadUrl: string; allowed: { buckets: Array<{ id: string; name: string | null }> } } } };
    const bucket = data.apiInfo.storageApi.allowed.buckets.find((item) => item.name === this.config.B2_BUCKET_NAME);
    if (!bucket) throw new Error('B2 application key does not allow the configured bucket.');
    return { authorizationToken: data.authorizationToken, apiUrl: data.apiInfo.storageApi.apiUrl, downloadUrl: data.apiInfo.storageApi.downloadUrl, bucketId: bucket.id };
  }

  async put(key: string, body: ReadableStream | ArrayBuffer, metadata: MediaMetadata): Promise<void> {
    const bytes = body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer();
    const auth = await this.authorize();
    const uploadUrl = await fetch(`${auth.apiUrl}/b2api/v4/b2_get_upload_url`, {
      method: 'POST', headers: { authorization: auth.authorizationToken, 'content-type': 'application/json' }, body: JSON.stringify({ bucketId: auth.bucketId }),
    });
    if (!uploadUrl.ok) throw new Error(`B2 upload URL failed (${uploadUrl.status}).`);
    const upload = await uploadUrl.json() as { uploadUrl: string; authorizationToken: string };
    const response = await fetch(upload.uploadUrl, {
      method: 'POST',
      headers: {
        authorization: upload.authorizationToken,
        'content-type': metadata.contentType,
        'content-length': String(bytes.byteLength),
        'x-bz-file-name': b2FileName(key),
        'x-bz-content-sha1': await sha1Hex(bytes),
        'x-bz-info-contenttype': b2HeaderValue(metadata.contentType),
        'x-bz-info-bytesize': String(metadata.byteSize),
        'x-bz-info-owneruserid': b2HeaderValue(metadata.ownerUserId),
        ...(metadata.expiresAt ? { 'x-bz-info-expiresat': b2HeaderValue(metadata.expiresAt) } : {}),
      }, body: bytes,
    });
    if (!response.ok) throw new Error(`B2 upload failed (${response.status}).`);
  }

  async get(key: string): Promise<StoredMedia | null> {
    const auth = await this.authorize();
    const response = await fetch(`${auth.downloadUrl}/file/${encodeURIComponent(this.config.B2_BUCKET_NAME)}/${b2FileName(key)}`, { headers: { authorization: auth.authorizationToken } });
    if (response.status === 404) return null;
    if (!response.ok || !response.body) throw new Error(`B2 download failed (${response.status}).`);
    const contentType = (fromB2Header(response.headers.get('x-bz-info-contenttype')) ?? response.headers.get('content-type') ?? 'application/octet-stream') as AllowedStorageType;
    const expiresAt = fromB2Header(response.headers.get('x-bz-info-expiresat'));
    return { body: response.body, metadata: {
      contentType,
      byteSize: Number(response.headers.get('x-bz-info-bytesize') ?? response.headers.get('content-length') ?? 0),
      ownerUserId: fromB2Header(response.headers.get('x-bz-info-owneruserid')) ?? '',
      ...(expiresAt ? { expiresAt } : {}),
    } };
  }

  async delete(key: string): Promise<void> {
    const auth = await this.authorize();
    const listed = await fetch(`${auth.apiUrl}/b2api/v4/b2_list_file_names`, {
      method: 'POST', headers: { authorization: auth.authorizationToken, 'content-type': 'application/json' }, body: JSON.stringify({ bucketId: auth.bucketId, startFileName: key, maxFileCount: 1 }),
    });
    if (!listed.ok) throw new Error(`B2 list failed (${listed.status}).`);
    const data = await listed.json() as { files: Array<{ fileName: string; fileId: string }> };
    const file = data.files.find((item) => item.fileName === key);
    if (!file) return;
    const removed = await fetch(`${auth.apiUrl}/b2api/v4/b2_delete_file_version`, {
      method: 'POST', headers: { authorization: auth.authorizationToken, 'content-type': 'application/json' }, body: JSON.stringify({ fileName: file.fileName, fileId: file.fileId }),
    });
    if (!removed.ok) throw new Error(`B2 delete failed (${removed.status}).`);
  }
}

class HybridMediaStorage implements MediaStorage {
  constructor(private readonly primary: MediaStorage, private readonly fallback: MediaStorage) {}
  async put(key: string, body: ReadableStream | ArrayBuffer, metadata: MediaMetadata, expiration?: number): Promise<void> {
    try { await this.primary.put(key, body, metadata, expiration); } catch (error) { console.error(JSON.stringify({ event: 'b2_upload_failed', message: error instanceof Error ? error.message : 'unknown' })); await this.fallback.put(key, body, metadata, expiration); }
  }
  async get(key: string): Promise<StoredMedia | null> {
    try { return await this.primary.get(key) ?? await this.fallback.get(key); } catch { return this.fallback.get(key); }
  }
  async delete(key: string): Promise<void> { await Promise.allSettled([this.primary.delete(key), this.fallback.delete(key)]); }
}

export function mediaStorage(env: B2Env): MediaStorage {
  const fallback = new KvMediaStorage(env.MEDIA);
  if (!env.B2_KEY_ID || !env.B2_APPLICATION_KEY || !env.B2_BUCKET_NAME) return fallback;
  return new HybridMediaStorage(new BackblazeB2MediaStorage({ B2_KEY_ID: env.B2_KEY_ID, B2_APPLICATION_KEY: env.B2_APPLICATION_KEY, B2_BUCKET_NAME: env.B2_BUCKET_NAME }), fallback);
}
