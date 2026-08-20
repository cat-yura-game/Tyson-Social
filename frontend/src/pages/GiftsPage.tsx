import { Diamond, Gift, ListChecks, Sparkles } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { GiftDetailsModal, type GiftDetails, type GiftOwner } from '../components/GiftDetailsModal';
import { useAuth } from '../auth/AuthProvider';

type GiftType = { id: string; title: string; basePrice: number; upgradePrice: number; maxSupply: number; soldCount: number; remaining: number; baseImage: string; active: boolean };
type UserGift = GiftDetails & { worn: boolean; isPublic: boolean; activeListingId: string | null; purchasedAt: string; variant: string | null; upgradePrice: number; collectibleVariantNumber: number | null };
type MarketListing = { id: string; price: number; gift: UserGift; seller: { username: string; displayName: string } };

export function GiftsPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [types, setTypes] = useState<GiftType[]>([]);
  const [owned, setOwned] = useState<UserGift[]>([]);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ gift: GiftDetails; owner: GiftOwner; mine: boolean } | null>(null);
  const load = async () => {
    const [balanceData, typesData, ownedData, marketData] = await Promise.all([
      apiRequest<{ balance: number }>('/diamonds/balance'), apiRequest<{ gifts: GiftType[] }>('/gifts'), apiRequest<{ gifts: UserGift[] }>('/users/me/gifts'), apiRequest<{ listings: MarketListing[] }>('/gift-market'),
    ]);
    setBalance(balanceData.balance); setTypes(typesData.gifts); setOwned(ownedData.gifts); setListings(marketData.listings);
  };
  useEffect(() => { void load().catch(() => setError('Не удалось загрузить подарки.')); }, []);
  const buy = async (gift: GiftType) => {
    if (!window.confirm(`Купить «${gift.title}» за ${gift.basePrice} 💎?`)) return;
    setPending(gift.id); setError(null);
    try { const result = await apiRequest<{ balance: number }>(`/gifts/${gift.id}/buy`, { method: 'POST' }); setBalance(result.balance); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось купить подарок.'); }
    finally { setPending(null); }
  };
  const upgrade = async (gift: UserGift) => {
    if (!window.confirm(`Улучшить «${gift.title}» за ${gift.upgradePrice} 💎? После улучшения подарок получит уникальный цвет, его можно будет носить и продавать.`)) return;
    setPending(gift.id); setError(null);
    try { const result = await apiRequest<{ balance: number }>(`/user-gifts/${gift.id}/upgrade`, { method: 'POST' }); setBalance(result.balance); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось улучшить подарок.'); }
    finally { setPending(null); }
  };
  const wear = async (gift: UserGift) => {
    setPending(gift.id); setError(null);
    try { await apiRequest(`/user-gifts/${gift.id}/wear`, { method: 'POST' }); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось надеть подарок.'); }
    finally { setPending(null); }
  };
  const removeWear = async (gift: UserGift) => {
    setPending(gift.id); setError(null);
    try { await apiRequest('/users/me/worn-gift', { method: 'DELETE' }); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось снять подарок.'); }
    finally { setPending(null); }
  };
  const transfer = async (gift: UserGift) => {
    const recipientUsername = window.prompt('Кому передать подарок? Комиссия за передачу — 5 💎. Введите @username без @.')?.trim().replace(/^@/, '');
    if (!recipientUsername) return;
    setPending(gift.id); setError(null);
    try { await apiRequest(`/user-gifts/${gift.id}/transfer`, { method: 'POST', body: JSON.stringify({ recipientUsername }) }); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось передать подарок.'); }
    finally { setPending(null); }
  };
  const toggleVisibility = async (gift: UserGift) => {
    setPending(gift.id); setError(null);
    try { await apiRequest(`/user-gifts/${gift.id}/public`, { method: 'PUT', body: JSON.stringify({ isPublic: !gift.isPublic }) }); await load(); setSelected(null); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось изменить видимость подарка.'); }
    finally { setPending(null); }
  };
  const removeInscription = async (gift: UserGift) => {
    if (!window.confirm('Убрать подпись за 25 💎? Это действие нельзя отменить.')) return;
    setPending(gift.id); setError(null);
    try { await apiRequest(`/user-gifts/${gift.id}/inscription`, { method: 'DELETE' }); await load(); setSelected(null); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось убрать подпись.'); }
    finally { setPending(null); }
  };
  const listGift = async (gift: UserGift) => {
    const price = Number(window.prompt('Цена продажи в алмазах:', '25'));
    if (!Number.isInteger(price) || price < 1) return;
    setPending(gift.id); setError(null);
    try { await apiRequest(`/user-gifts/${gift.id}/list`, { method: 'POST', body: JSON.stringify({ price }) }); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось выставить подарок.'); }
    finally { setPending(null); }
  };
  const exchangeGift = async (gift: UserGift) => {
    if (!window.confirm('Обменять этот обычный подарок на 20 💎? Подарок будет уничтожен, а тираж не изменится.')) return;
    setPending(gift.id); setError(null);
    try { const result = await apiRequest<{ balance: number }>(`/user-gifts/${gift.id}/exchange`, { method: 'POST' }); setBalance(result.balance); window.dispatchEvent(new Event('diamonds-changed')); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось обменять подарок.'); }
    finally { setPending(null); }
  };
  const cancelListing = async (listingId: string) => {
    setPending(listingId); setError(null);
    try { await apiRequest(`/gift-market/${listingId}`, { method: 'DELETE' }); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось снять объявление.'); }
    finally { setPending(null); }
  };
  const buyListing = async (listing: MarketListing) => {
    if (!window.confirm(`Купить «${listing.gift.title}» за ${listing.price} 💎?`)) return;
    setPending(listing.id); setError(null);
    try { const result = await apiRequest<{ balance: number }>(`/gift-market/${listing.id}/buy`, { method: 'POST' }); setBalance(result.balance); window.dispatchEvent(new Event('diamonds-changed')); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось купить подарок.'); }
    finally { setPending(null); }
  };
  return <section className="gifts-page">
    <header className="diamonds-hero"><div className="diamond-sparkles" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div><Diamond className="diamonds-hero-icon" fill="currentColor" /><h1>Алмазы Tyson</h1><p>Алмазы помогают дарить подарки, поддерживать авторов и участвовать в коллекции Tyson.</p><section className="diamonds-balance-card" aria-label="Ваш баланс"><Diamond fill="currentColor" /><strong>{balance}</strong><span>Ваш баланс</span></section><Link className="diamonds-earn-button" to="/earn"><ListChecks size={18} />Заработать</Link></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <h2 className="gifts-title">Магазин</h2><div className="gift-shop-grid">{types.map((gift) => <article className="gift-card" key={gift.id}><img src={gift.baseImage} alt={gift.title} /><div><h3>{gift.title}</h3><p><Diamond size={15} />{gift.basePrice}</p><small>{gift.remaining ? `Осталось: ${gift.remaining} / ${gift.maxSupply}` : 'Распродано'}</small><button type="button" disabled={!gift.remaining || pending !== null} onClick={() => void buy(gift)}>{gift.remaining ? pending === gift.id ? 'Покупаем…' : 'Купить' : 'Распродано'}</button></div></article>)}</div>
    <h2 className="gifts-title">Вторичный рынок</h2><div className="gift-collection">{listings.length ? listings.map((listing) => { const mine = owned.some((gift) => gift.id === listing.gift.id && gift.activeListingId === listing.id); return <article className={listing.gift.isCollectible ? 'owned-gift collectible' : 'owned-gift'} style={{ '--gift-accent': listing.gift.accentColor } as CSSProperties} key={listing.id}><button className="gift-open" type="button" onClick={() => setSelected({ gift: listing.gift, owner: listing.seller, mine })}><img src={listing.gift.image} alt={listing.gift.title} /></button><div><h3>{listing.gift.title}</h3><p>Serial #{listing.gift.serialNumber} · @{listing.seller.username}</p><strong><Diamond size={15} />{listing.price}</strong>{mine ? <button type="button" disabled={pending !== null} onClick={() => void cancelListing(listing.id)}>Снять с продажи</button> : <button type="button" disabled={pending !== null} onClick={() => void buyListing(listing)}>{pending === listing.id ? 'Покупаем…' : 'Купить'}</button>}</div></article>; }) : <p className="empty-profile">На рынке пока нет подарков.</p>}</div>
    <h2 className="gifts-title">Моя коллекция</h2><div className="gift-collection">{owned.length ? owned.map((gift) => { const exchangeDeadline = new Date(new Date(gift.purchasedAt).getTime() + 7 * 86_400_000); const exchangeable = !gift.isCollectible && Date.now() < exchangeDeadline.getTime(); return <article className={gift.isCollectible ? 'owned-gift collectible' : 'owned-gift'} style={gift.isCollectible ? { '--gift-accent': gift.accentColor } as CSSProperties : undefined} key={gift.id}><button className="gift-open" type="button" onClick={() => setSelected({ gift, owner: { username: user?.username ?? '', displayName: user?.displayName ?? '' }, mine: true })}><img src={gift.image} alt={gift.title} /></button><div><h3>{gift.title}{gift.worn && <span className="worn-gift-label">Надет</span>}</h3><p>Serial #{gift.serialNumber} / {gift.maxSupply}</p>{gift.isCollectible ? <><strong><Sparkles size={15} />Collectible</strong><small>Variant #{gift.collectibleVariantNumber}</small></> : <><button type="button" disabled={pending !== null || Boolean(gift.activeListingId)} onClick={() => void upgrade(gift)}><Gift size={16} />Улучшить — {gift.upgradePrice} 💎</button>{exchangeable && <button className="gift-exchange-button" type="button" disabled={pending !== null || Boolean(gift.activeListingId)} onClick={() => void exchangeGift(gift)}>Обменять на 20 💎</button>}<small>{exchangeable ? `Обмен доступен до ${exchangeDeadline.toLocaleDateString('ru-RU')}` : 'Обмен недоступен после 7 дней или улучшения'}</small></>}<details className="gift-menu"><summary>•••</summary><div>{gift.activeListingId ? <button type="button" disabled={pending !== null} onClick={() => void cancelListing(gift.activeListingId!)}>Снять с рынка</button> : <>{gift.isCollectible && <><button type="button" disabled={pending !== null} onClick={() => void listGift(gift)}>Продать на рынке</button>{gift.worn ? <button type="button" disabled={pending !== null} onClick={() => void removeWear(gift)}>Снять</button> : <button type="button" disabled={pending !== null} onClick={() => void wear(gift)}>Надеть</button>}<button type="button" disabled={pending !== null} onClick={() => void transfer(gift)}>Передать · 5 💎</button></>}</>}</div></details></div></article>; }) : <p className="empty-profile">Здесь появятся купленные подарки.</p>}</div>
    {selected && <GiftDetailsModal gift={selected.gift} owner={selected.owner} mine={selected.mine} onClose={() => setSelected(null)} onTransfer={() => { const gift = owned.find((item) => item.id === selected.gift.id); if (gift) void transfer(gift); }} onWear={() => { const gift = owned.find((item) => item.id === selected.gift.id); if (gift) { setSelected(null); void (gift.worn ? removeWear(gift) : wear(gift)); } }} onVisibility={() => { const gift = owned.find((item) => item.id === selected.gift.id); if (gift) void toggleVisibility(gift); }} onSell={selected.gift.isCollectible ? () => { const gift = owned.find((item) => item.id === selected.gift.id); if (gift) void listGift(gift); } : undefined} onRemoveInscription={() => { const gift = owned.find((item) => item.id === selected.gift.id); if (gift) void removeInscription(gift); }} />}
  </section>;
}
