import { describe, expect, it } from 'vitest';
import { formatMessageDay, messageDayKey } from './message-day';

describe('Messenger day separators', () => {
  const now = new Date(2026, 7, 13, 20, 30);

  it('groups timestamps by the local calendar day', () => {
    expect(messageDayKey(new Date(2026, 7, 13, 0, 1))).toBe('2026-08-13');
    expect(messageDayKey(new Date(2026, 7, 13, 23, 59))).toBe('2026-08-13');
  });

  it('uses friendly labels for today and yesterday', () => {
    expect(formatMessageDay(new Date(2026, 7, 13, 9, 0), now)).toBe('Сегодня');
    expect(formatMessageDay(new Date(2026, 7, 12, 23, 0), now)).toBe('Вчера');
  });

  it('includes a year only when it differs from the current one', () => {
    expect(formatMessageDay(new Date(2026, 6, 2), now)).toBe('2 июля');
    expect(formatMessageDay(new Date(2025, 6, 2), now)).toContain('2025');
  });
});
