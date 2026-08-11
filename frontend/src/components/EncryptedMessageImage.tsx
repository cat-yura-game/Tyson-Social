import { useEffect, useState } from 'react';
import { apiRawRequest } from '../api/client';
import { decryptAttachment } from '../messaging/crypto';

export function EncryptedMessageImage({ attachmentId, encryptionKey, nonce, mimeType }: {
  attachmentId: string;
  encryptionKey: string;
  nonce: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void apiRawRequest(`/messages/attachments/${attachmentId}`).then((response) => response.arrayBuffer())
      .then((buffer) => decryptAttachment(new Uint8Array(buffer), encryptionKey, nonce))
      .then((plaintext) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([plaintext], { type: mimeType }));
        setSource(objectUrl);
      }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachmentId, encryptionKey, mimeType, nonce]);

  if (failed) return <p className="encrypted-image-state">Не удалось расшифровать изображение.</p>;
  if (!source) return <div className="encrypted-image-loading" aria-label="Расшифровываем изображение" />;
  return <img className="message-image" src={source} alt="Изображение в защищённом сообщении" />;
}
