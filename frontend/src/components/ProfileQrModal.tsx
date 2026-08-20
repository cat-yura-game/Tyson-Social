import QRCode from 'qrcode';
import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const SHORT_ORIGIN = 'https://tyso.eu.cc';

export function ProfileQrModal({ username, onClose }: { username: string; onClose(): void }) {
  const link = `${SHORT_ORIGIN}/u/${username}`;
  const [qr, setQr] = useState('');

  useEffect(() => {
    void QRCode.toDataURL(link, { errorCorrectionLevel: 'H', margin: 2, width: 720, color: { dark: '#111827', light: '#ffffff' } }).then(setQr);
  }, [link]);

  const download = () => {
    if (!qr) return;
    const anchor = document.createElement('a');
    anchor.href = qr; anchor.download = `tyson-${username}.png`; anchor.click();
  };

  return createPortal(<div className="profile-qr-backdrop" role="presentation" onClick={onClose}>
    <section className="profile-qr-modal" role="dialog" aria-modal="true" aria-label={`QR-код @${username}`} onClick={(event) => event.stopPropagation()}>
      <button className="profile-qr-close" type="button" aria-label="Закрыть" onClick={onClose}><X /></button>
      <p>Профиль Tyson</p>
      <div className="profile-qr-code">{qr && <img src={qr} alt={`QR-код профиля @${username}`} />}<img className="profile-qr-logo" src="/logo.png" alt="Tyson" /></div>
      <strong>@{username}</strong>
      <small>{link}</small>
      <button className="profile-qr-download" type="button" onClick={download} disabled={!qr}><Download size={18} />Скачать QR-код</button>
    </section>
  </div>, document.body);
}
