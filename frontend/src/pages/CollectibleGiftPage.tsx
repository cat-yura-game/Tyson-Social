import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { GiftDetailsModal, type GiftDetails, type GiftOwner } from '../components/GiftDetailsModal';

export function CollectibleGiftPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [gift, setGift] = useState<GiftDetails | null>(null);
  const [owner, setOwner] = useState<GiftOwner | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    apiRequest<{ gift: GiftDetails; owner: GiftOwner }>(`/gifts/collectibles/${encodeURIComponent(id)}`)
      .then((data) => { setGift(data.gift); setOwner(data.owner); })
      .catch(() => setMissing(true));
  }, [id]);

  if (missing) return <section className="surface-page profile-state"><h1>Подарок не найден</h1><p>Он мог быть скрыт владельцем или ссылка недействительна.</p><Link className="text-link" to="/">Вернуться в Tyson</Link></section>;
  if (!gift || !owner) return <section className="surface-page profile-state">Загрузка подарка…</section>;
  return <section className="surface-page collectible-gift-page"><h1>{gift.title}</h1><p>Collectible-подарок Tyson</p><GiftDetailsModal gift={gift} owner={owner} onClose={() => navigate(`/profile/${owner.username}`)} /></section>;
}
