import { useEffect, useState } from 'react';
import { apiRawRequest } from '../api/client';
import { attachmentDigest, decryptAttachment } from '../messaging/crypto';

export function EncryptedMessageImage({ attachmentId, encryptionKey, nonce, digest, mimeType }: {
  attachmentId: string;
  encryptionKey: string;
  nonce: string;
  digest?: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const retryDelays = [0, 700, 2_000];
    setFailed(false);
    setSource(null);

    const load = async () => {
      for (const delay of retryDelays) {
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        if (!active) return;
        try {
          const response = await apiRawRequest(`/messages/attachments/${attachmentId}?attempt=${retry}-${delay}`, { cache: 'no-store' });
          const ciphertext = new Uint8Array(await response.arrayBuffer());
          if (digest && await attachmentDigest(ciphertext) !== digest) throw new Error('Encrypted attachment integrity check failed.');
          const plaintext = await decryptAttachment(ciphertext, encryptionKey, nonce);
          if (!active) return;
          objectUrl = URL.createObjectURL(new Blob([plaintext], { type: mimeType }));
          setSource(objectUrl);
          return;
        } catch {
          // A freshly uploaded KV object can be briefly unavailable in another region.
        }
      }
      if (active) setFailed(true);
    };
    void load();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachmentId, digest, encryptionKey, mimeType, nonce, retry]);

  if (failed) return <button className="encrypted-image-state" type="button" onClick={() => setRetry((value) => value + 1)}>Не удалось открыть изображение · Повторить</button>;
  if (!source) return <div className="encrypted-image-loading" aria-label="Расшифровываем изображение" />;
  return <img className="message-image" src={source} alt="Изображение в защищённом сообщении" />;
}
