export const STICKERS = [
  { id: 'love', src: '/stickers/love.webp', accessibleLabel: 'Любовь' },
  { id: 'looking', src: '/stickers/looking.webp', accessibleLabel: 'Смотрит' },
  { id: 'like', src: '/stickers/like.webp', accessibleLabel: 'Нравится' },
  { id: 'dislike', src: '/stickers/dislike.webp', accessibleLabel: 'Не нравится' },
  { id: 'dead-laugh', src: '/stickers/dead-laugh.webp', accessibleLabel: 'Умер со смеху' },
  { id: 'fire', src: '/stickers/fire.webp', accessibleLabel: 'Огонь' },
  { id: 'laugh', src: '/stickers/laugh.webp', accessibleLabel: 'Смешно' },
  { id: 'angry', src: '/stickers/angry.webp', accessibleLabel: 'Злой' },
  { id: 'crying', src: '/stickers/crying.webp', accessibleLabel: 'Плачет' },
  { id: 'shock', src: '/stickers/shock.webp', accessibleLabel: 'Шок' },
  { id: 'rocket', src: '/stickers/rocket.webp', accessibleLabel: 'Мощно' },
  { id: 'thinking', src: '/stickers/thinking.webp', accessibleLabel: 'Думает' },
  { id: 'confirm', src: '/stickers/confirm.webp', accessibleLabel: 'Да' },
  { id: 'no', src: '/stickers/no.webp', accessibleLabel: 'Нет' },
  { id: 'awkward', src: '/stickers/awkward.webp', accessibleLabel: 'Неловко' },
  { id: 'cool', src: '/stickers/cool.webp', accessibleLabel: 'Круто' },
  { id: 'got-it', src: '/stickers/got-it.webp', accessibleLabel: 'Ну ты понял' },
  { id: 'sleep', src: '/stickers/sleep.webp', accessibleLabel: 'Сплю' },
  { id: 'eye-roll', src: '/stickers/eye-roll.webp', accessibleLabel: 'Закатывает глаза' },
  { id: 'suspicious', src: '/stickers/suspicious.webp', accessibleLabel: 'Подозревает' },
  { id: 'quiet', src: '/stickers/quiet.webp', accessibleLabel: 'Тихо' },
  { id: 'please', src: '/stickers/please.webp', accessibleLabel: 'Пожалуйста' },
  { id: 'salute', src: '/stickers/salute.webp', accessibleLabel: 'Есть' },
] as const;

export type StickerId = typeof STICKERS[number]['id'];

const stickersById = new Map<string, typeof STICKERS[number]>(STICKERS.map((sticker) => [sticker.id, sticker]));

export function getSticker(id: string) {
  return stickersById.get(id) ?? null;
}
