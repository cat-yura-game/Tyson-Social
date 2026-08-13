const russianDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const russianDayWithYear = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

export function messageDayKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'invalid';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatMessageDay(value: string | Date, now = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата неизвестна';
  if (messageDayKey(date) === messageDayKey(now)) return 'Сегодня';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (messageDayKey(date) === messageDayKey(yesterday)) return 'Вчера';

  return date.getFullYear() === now.getFullYear() ? russianDay.format(date) : russianDayWithYear.format(date);
}
