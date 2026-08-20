import { Eye, EyeOff, Send, Tag, X } from 'lucide-react';
import type { CSSProperties } from 'react';

export type GiftDetails = { id: string; title: string; serialNumber: number; maxSupply: number; image: string; accentColor: string; isCollectible: boolean; isPublic?: boolean; activeListingId?: string | null };
export type GiftOwner = { username: string; displayName: string; avatarKey?: string | null };

export function GiftDetailsModal({ gift, owner, mine = false, onClose, onTransfer, onVisibility, onSell }: { gift: GiftDetails; owner: GiftOwner; mine?: boolean; onClose(): void; onTransfer?(): void; onVisibility?(): void; onSell?(): void }) {
  return <div className="gift-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="gift-modal" role="dialog" aria-modal="true" aria-label={`Подарок ${gift.title}`} onMouseDown={(event) => event.stopPropagation()} style={{ '--gift-accent': gift.accentColor } as CSSProperties}>
      <div className="gift-modal-top"><button className="gift-modal-close" type="button" aria-label="Закрыть" onClick={onClose}><X /></button><img src={gift.image} alt={gift.title} /><h2>{gift.title} <span>#{gift.serialNumber}</span></h2><p>{gift.isCollectible ? 'Collectible подарок' : 'Цифровой подарок Tyson'}</p>{mine && <div className="gift-modal-actions"><button type="button" onClick={onTransfer}><Send />Передать</button><button type="button" onClick={onVisibility}>{gift.isPublic === false ? <Eye /> : <EyeOff />}{gift.isPublic === false ? 'Показать' : 'Скрыть'}</button><button type="button" onClick={onSell}><Tag />Продать</button></div>}</div>
      <dl className="gift-modal-info"><div><dt>Владелец</dt><dd>{owner.displayName} <small>@{owner.username}</small></dd></div><div><dt>Статус</dt><dd>{gift.isCollectible ? 'Collectible' : 'Обычный'}</dd></div><div><dt>Цвет</dt><dd><i style={{ background: gift.accentColor }} />{gift.accentColor === '#111111' ? 'Чёрный' : 'Особый'}</dd></div><div><dt>Тираж</dt><dd>#{gift.serialNumber} из {gift.maxSupply}</dd></div><div><dt>Профиль</dt><dd>{gift.isPublic === false ? 'Скрыт' : 'Виден в профиле'}</dd></div></dl>
      <button className="gift-modal-ok" type="button" onClick={onClose}>OK</button>
    </section>
  </div>;
}
