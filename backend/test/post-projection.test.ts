import { describe, expect, it } from 'vitest';
import { toPublicPost } from '../src/services/post-projection';

describe('public post projection', () => {
  it('never exposes hidden dislike counts', () => {
    const result = toPublicPost({ id: 'post-1', body: 'Hello' }, { likes: 12, dislikes: 183 });
    expect(result).toEqual({ id: 'post-1', body: 'Hello', likeCount: 12 });
    expect(result).not.toHaveProperty('dislikes');
    expect(JSON.stringify(result)).not.toContain('183');
  });
});
