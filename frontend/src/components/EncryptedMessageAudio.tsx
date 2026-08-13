import { useEffect, useState } from 'react';
import { apiRawRequest } from '../api/client';
import { attachmentDigest, decryptAttachment } from '../messaging/crypto';

type AudioMimeType = 'audio/webm' | 'audio/mp4' | 'audio/ogg';

export function EncryptedMessageAudio({ attachmentId, encryptionKey, nonce, digest, mimeType }: {
  attachmentId: string;
  encryptionKey: string;
  nonce: string;
  digest?: string;
  mimeType: AudioMimeType;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setFailed(false);
    setSource(null);
    void apiRawRequest(`/messages/attachments/${attachmentId}`, { cache: 'no-store' }).then((response) => response.arrayBuffer())
      .then(async (buffer) => {
        const ciphertext = new Uint8Array(buffer);
        if (digest && await attachmentDigest(ciphertext) !== digest) throw new Error('Encrypted attachment integrity check failed.');
        return decryptAttachment(ciphertext, encryptionKey, nonce);
      })
      .then((plaintext) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([plaintext], { type: mimeType }));
        setSource(objectUrl);
      }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachmentId, digest, encryptionKey, mimeType, nonce]);

  if (failed) return <p className="encrypted-audio-state">Не удалось расшифровать голосовое сообщение.</p>;
  if (!source) return <div className="encrypted-audio-loading" aria-label="Расшифровываем голосовое сообщение" />;
  return <audio className="message-audio" src={source} controls preload="metadata" controlsList="nodownload" aria-label="Голосовое сообщение" />;
}
