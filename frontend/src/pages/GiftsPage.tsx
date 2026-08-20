import { Diamond, Gift, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../api/client';

type GiftType = { id: string; title: string; basePrice: number; upgradePrice: number; maxSupply: number; soldCount: number; remaining: number; baseImage: string; active: boolean };
type UserGift = { id: string; title: string; serialNumber: number; maxSupply: number; isCollectible: boolean; variant: string | null; image: string; upgradePrice: number; collectibleVariantNumber: number | null };

export function GiftsPage() {
  const [balance, setBalance] = useState(0);
  const [types, setTypes] = useState<GiftType[]>([]);
  const [owned, setOwned] = useState<UserGift[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    const [balanceData, typesData, ownedData] = await Promise.all([
      apiRequest<{ balance: number }>('/diamonds/balance'), apiRequest<{ gifts: GiftType[] }>('/gifts'), apiRequest<{ gifts: UserGift[] }>('/users/me/gifts'),
    ]);
    setBalance(balanceData.balance); setTypes(typesData.gifts); setOwned(ownedData.gifts);
  };
  useEffect(() => { void load().catch(() => setError('Не удалось загрузить подарки.')); }, []);
  const buy = async (gift: GiftType) => {
    setPending(gift.id); setError(null);
    try { const result = await apiRequest<{ balance: number }>(`/gifts/${gift.id}/buy`, { method: 'POST' }); setBalance(result.balance); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось купить подарок.'); }
    finally { setPending(null); }
  };
  const upgrade = async (gift: UserGift) => {
    setPending(gift.id); setError(null);
    try { const result = await apiRequest<{ balance: number }>(`/user-gifts/${gift.id}/upgrade`, { method: 'POST' }); setBalance(result.balance); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось улучшить подарок.'); }
    finally { setPending(null); }
  };
  return <section className="gifts-page">
    <header className="gifts-hero"><div><p className="eyebrow">Цифровая коллекция Tyson</p><h1>Подарки</h1><p>Ограниченные экземпляры, которые можно сделать collectible.</p></div><div className="diamond-balance"><Diamond />{balance}</div></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <h2 className="gifts-title">Магазин</h2><div className="gift-shop-grid">{types.map((gift) => <article className="gift-card" key={gift.id}><img src={gift.baseImage} alt={gift.title} /><div><h3>{gift.title}</h3><p><Diamond size={15} />{gift.basePrice}</p><small>{gift.remaining ? `Осталось: ${gift.remaining} / ${gift.maxSupply}` : 'Распродано'}</small><button type="button" disabled={!gift.remaining || pending !== null} onClick={() => void buy(gift)}>{gift.remaining ? pending === gift.id ? 'Покупаем…' : 'Купить' : 'Распродано'}</button></div></article>)}</div>
    <h2 className="gifts-title">Моя коллекция</h2><div className="gift-collection">{owned.length ? owned.map((gift) => <article className={gift.isCollectible ? 'owned-gift collectible' : 'owned-gift'} key={gift.id}><img src={gift.image} alt={gift.title} /><div><h3>{gift.title}</h3><p>Serial #{gift.serialNumber} / {gift.maxSupply}</p>{gift.isCollectible ? <><strong><Sparkles size={15} />Collectible</strong><small>Variant #{gift.collectibleVariantNumber}</small></> : <button type="button" disabled={pending !== null} onClick={() => void upgrade(gift)}><Gift size={16} />Улучшить — {gift.upgradePrice} 💎</button>}</div></article>) : <p className="empty-profile">Здесь появятся купленные подарки.</p>}</div>
  </section>;
}
