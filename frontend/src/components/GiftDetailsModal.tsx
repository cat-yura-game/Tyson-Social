import { ChevronLeft, Crown, Gem, Send, Share2, Shirt, Sparkles, Tag, X } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

export type GiftDetails = { id: string; title: string; serialNumber: number; maxSupply: number; basePrice: number; upgradePrice?: number; image: string; accentColor: string; inscription?: string | null; isCollectible: boolean; worn?: boolean; isPublic?: boolean; activeListingId?: string | null; isUnlimited?: boolean; canUpgrade?: boolean; canTransfer?: boolean; canWear?: boolean; exchangeReward?: number; collectibleVariants?: string[] };
export type GiftOwner = { username: string; displayName: string; avatarKey?: string | null };

export function GiftDetailsModal({ gift, owner, mine = false, onClose, onTransfer, onVisibility, onWear, onSell, onUpgrade, onExchange, onRemoveInscription }: { gift: GiftDetails; owner: GiftOwner; mine?: boolean; onClose(): void; onTransfer?(): void; onVisibility?(): void; onWear?(): void; onSell?(): void; onUpgrade?(): Promise<void> | void; onExchange?(): void; onRemoveInscription?(): void }) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [copied, setCopied] = useState(false);
  const canUpgrade = mine && !gift.isCollectible && gift.canUpgrade !== false && !!onUpgrade;
  const upgrade = async () => { if (!onUpgrade || upgrading) return; setUpgrading(true); try { await onUpgrade(); setUpgradeOpen(false); } finally { setUpgrading(false); } };
  const copyLink = async () => {
    const link = `https://tyso.eu.cc/?to=/gift/${gift.id}`;
    try { await navigator.clipboard.writeText(link); }
    catch {
      const input = document.createElement('textarea'); input.value = link; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select(); document.execCommand('copy'); input.remove();
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };
  return createPortal(<div className="gift-modal-backdrop" role="presentation" onClick={onClose}>
    <section className={upgradeOpen ? 'gift-modal gift-upgrade-modal' : 'gift-modal'} role="dialog" aria-modal="true" aria-label={`Подарок ${gift.title}`} onClick={(event) => event.stopPropagation()} style={{ '--gift-accent': gift.accentColor } as CSSProperties}>
      {upgradeOpen ? <><div className="gift-upgrade-top"><button className="gift-modal-close" type="button" aria-label="Назад" onClick={() => setUpgradeOpen(false)}><ChevronLeft /></button><div className="gift-variant-strip">{gift.collectibleVariants?.map((variant) => <img key={variant} src={variant} alt="Вариант collectible" />)}</div><img src={gift.collectibleVariants?.[0] ?? gift.image} alt={gift.title} /><h2>Сделать уникальным</h2><p>Варианты collectible определятся при улучшении.</p></div><div className="gift-upgrade-body"><div><Gem /><section><h3>Уникальность</h3><p>Подарку будет присвоен вариант collectible, особый цвет и уникальный номер.</p></section></div><div><Tag /><section><h3>Можно продать</h3><p>После улучшения подарок можно выставить на вторичный рынок.</p></section></div><div><Crown /><section><h3>Можно носить</h3><p>Добавьте подарок в профиль как личный статус.</p></section></div><button className="gift-upgrade-confirm" type="button" disabled={upgrading} onClick={() => void upgrade()}>{upgrading ? 'Улучшаем…' : <>Улучшить за <Gem />{gift.upgradePrice ?? 25}</>}</button></div></> : <>
        <div className="gift-modal-top"><button className="gift-modal-close" type="button" aria-label="Закрыть" onClick={onClose}><X /></button>{gift.isCollectible && <button className="gift-modal-share" type="button" aria-label="Скопировать ссылку на подарок" onClick={() => void copyLink()}><Share2 /><span>{copied ? 'Скопировано' : 'Ссылка'}</span></button>}<img src={gift.image} alt={gift.title} /><h2>{gift.title} {!gift.isUnlimited && <span>#{gift.serialNumber}</span>}</h2><p>{gift.isCollectible ? 'Collectible подарок' : 'Цифровой подарок Tyson'}</p>{mine && <div className={gift.isCollectible ? 'gift-modal-actions collectible-actions' : 'gift-modal-actions regular-actions'}>{gift.isCollectible && gift.canTransfer !== false && <>{onTransfer && <button type="button" onClick={onTransfer}><Send />Передать</button>}{onWear && <button type="button" onClick={onWear}><Shirt />{gift.worn ? 'Снять' : 'Надеть'}</button>}</>}{gift.isCollectible && gift.canTransfer !== false && onSell && <button type="button" onClick={onSell}><Tag />Продать</button>}{!gift.isCollectible && gift.exchangeReward && onExchange && <button type="button" onClick={onExchange}><Gem />Обменять · {gift.exchangeReward} 💎</button>}</div>}</div>
      <dl className="gift-modal-info"><div><dt>Владелец</dt><dd>{owner.displayName} <small>@{owner.username}</small></dd></div><div><dt>Статус</dt><dd>{gift.isCollectible ? 'Collectible' : 'Обычный'}</dd></div>{gift.inscription && <div><dt>Подпись</dt><dd>{gift.inscription}{mine && gift.isCollectible && onRemoveInscription && <button className="gift-inscription-remove" type="button" onClick={onRemoveInscription}>Убрать · 25 💎</button>}</dd></div>}{gift.isCollectible && <div><dt>Цвет</dt><dd><i style={{ background: gift.accentColor }} />{gift.accentColor === '#111111' ? 'Чёрный' : 'Особый'}</dd></div>}<div><dt>Ценность</dt><dd>{gift.basePrice + (gift.isCollectible ? gift.upgradePrice ?? 0 : 0)} 💎</dd></div>{!gift.isUnlimited && <div><dt>Тираж</dt><dd>#{gift.serialNumber} из {gift.maxSupply}</dd></div>}<div><dt>Профиль</dt><dd>{gift.isPublic === false ? 'Скрыт' : 'Виден в профиле'}</dd></div></dl>
        {canUpgrade && <button className="gift-modal-upgrade" type="button" onClick={() => setUpgradeOpen(true)}>Улучшить <Sparkles /></button>}
        {mine && onVisibility && <p className="gift-visibility-row">Подарок {gift.isPublic === false ? 'скрыт из профиля.' : 'виден в профиле.'} <button type="button" onClick={onVisibility}>{gift.isPublic === false ? 'Показать' : 'Скрыть'} ›</button></p>}
        <button className="gift-modal-ok" type="button" onClick={onClose}>OK</button>
      </>}
    </section>
  </div>, document.body);
}
