import { useEffect, useState } from 'react';
import { apiRawRequest } from '../api/client';
import { attachmentDigest, decryptAttachment } from '../messaging/crypto';

export function EncryptedMessageVideo({ attachmentId, encryptionKey, nonce, digest, mimeType }: { attachmentId: string; encryptionKey: string; nonce: string; digest?: string; mimeType: 'video/webm' | 'video/mp4' }) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => { let active = true; let url: string | null = null; void apiRawRequest(`/messages/attachments/${attachmentId}`, { cache: 'no-store' }).then((response) => response.arrayBuffer()).then(async (buffer) => { const encrypted = new Uint8Array(buffer); if (digest && await attachmentDigest(encrypted) !== digest) throw new Error('Integrity check failed'); return decryptAttachment(encrypted, encryptionKey, nonce); }).then((value) => { if (!active) return; url = URL.createObjectURL(new Blob([value], { type: mimeType })); setSource(url); }).catch(() => setSource(null)); return () => { active = false; if (url) URL.revokeObjectURL(url); }; }, [attachmentId, digest, encryptionKey, mimeType, nonce]);
  return source ? <video className="message-video-note" src={source} controls playsInline preload="metadata" controlsList="nodownload" aria-label="Видеосообщение" /> : <div className="encrypted-audio-loading" aria-label="Расшифровываем видеосообщение" />;
}
