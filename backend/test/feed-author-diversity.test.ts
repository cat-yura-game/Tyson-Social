import { describe, expect, it } from 'vitest';
import { interleaveAuthors } from '../src/recommendations/feed-ranking';

describe('feed author diversity', () => {
  it('does not place the same author next to itself while another author is available', () => {
    const posts = interleaveAuthors([
      { id: 'a-1', authorId: 'a', body: '', likeCount: 0, commentCount: 0, publishedAt: '', updatedAt: '' },
      { id: 'a-2', authorId: 'a', body: '', likeCount: 0, commentCount: 0, publishedAt: '', updatedAt: '' },
      { id: 'b-1', authorId: 'b', body: '', likeCount: 0, commentCount: 0, publishedAt: '', updatedAt: '' },
      { id: 'c-1', authorId: 'c', body: '', likeCount: 0, commentCount: 0, publishedAt: '', updatedAt: '' },
    ]);

    expect(posts.map((post) => post.id)).toEqual(['a-1', 'b-1', 'a-2', 'c-1']);
  });
});
