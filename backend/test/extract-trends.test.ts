import { describe, expect, it } from 'vitest';
import { extractTrends } from '../src/trends/extract-trends';

describe('trend extraction', () => {
  it('counts each topic once per post and prioritizes real hashtags', () => {
    const topics = extractTrends([
      { id: 'a', body: '#Дизайн дизайн городской дизайн', likeCount: 2, commentCount: 0 },
      { id: 'b', body: 'Новый #Дизайн города', likeCount: 0, commentCount: 1 },
      { id: 'c', body: 'Городской транспорт', likeCount: 0, commentCount: 0 },
    ]);
    expect(topics[0]).toEqual({ label: '#Дизайн', query: '#Дизайн', postCount: 2 });
    expect(topics.find((topic) => topic.query === 'дизайн')?.postCount).toBe(1);
  });

  it('does not create topics from common filler words', () => {
    expect(extractTrends([{ id: 'a', body: 'Это просто пост про Tyson', likeCount: 0, commentCount: 0 }])).toEqual([]);
  });
});
