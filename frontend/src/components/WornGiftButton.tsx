import { useState } from 'react';
import { apiRequest } from '../api/client';
import { GiftDetailsModal, type GiftDetails, type GiftOwner } from './GiftDetailsModal';

export function WornGiftButton({ giftId, image, owner }: { giftId: string; image: string; owner: GiftOwner }) {
  const [gift, setGift] = useState<GiftDetails | null>(null);
  const open = async () => {
    try { const result = await apiRequest<{ gift: GiftDetails }>(`/gifts/collectibles/${encodeURIComponent(giftId)}`); setGift(result.gift); }
    catch { window.alert('Не удалось открыть подарок.'); }
  };
  return <>{<button className="author-worn-gift-button" type="button" onClick={() => void open()} aria-label="Открыть надетый подарок"><img className="author-worn-gift" src={image} alt="Надетый подарок" /></button>}{gift && <GiftDetailsModal gift={gift} owner={owner} onClose={() => setGift(null)} />}</>;
}
