import { describe, expect, it } from 'vitest';
import { scoreRecommendation } from '../src/recommendations/scoring';

const base = {
  ageHours: 8,
  likeCount: 20,
  commentCount: 4,
  authorAffinity: 0.3,
  topicAffinity: 0.5,
  similarContentDislikes: 0,
  exploration: 0.1,
};

describe('recommendation scoring', () => {
  it('strongly penalizes hidden negative feedback', () => {
    const neutral = scoreRecommendation(base);
    const disliked = scoreRecommendation({ ...base, similarContentDislikes: 2 });
    expect(disliked.total).toBeLessThan(neutral.total - 4);
  });

  it('retains a bounded exploration contribution', () => {
    expect(scoreRecommendation({ ...base, exploration: 50 }).exploration).toBe(0.7);
  });
});
