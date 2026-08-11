import { describe, expect, it } from 'vitest';
import { calculateTopicAffinity } from '../src/recommendations/topics';

describe('preferred feed topics', () => {
  it('adds affinity for matching selected topics without making them a hard filter', () => {
    expect(calculateTopicAffinity('Новая нейросеть и модель Gemini', ['ai'])).toBeGreaterThan(0);
    expect(calculateTopicAffinity('Уличная фотография', ['ai'])).toBe(0);
    expect(calculateTopicAffinity('Футбол и новый игровой турнир', ['sport', 'games'])).toBe(1);
  });
});
