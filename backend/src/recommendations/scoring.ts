export interface RecommendationCandidate {
  ageHours: number;
  likeCount: number;
  commentCount: number;
  authorAffinity: number;
  topicAffinity: number;
  similarContentDislikes: number;
  exploration: number;
}

export interface ScoreBreakdown {
  total: number;
  freshness: number;
  popularity: number;
  affinity: number;
  negativeSignal: number;
  exploration: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function scoreRecommendation(candidate: RecommendationCandidate): ScoreBreakdown {
  const freshness = Math.exp(-Math.max(0, candidate.ageHours) / 72) * 2.4;
  const popularity = (Math.log1p(Math.max(0, candidate.likeCount)) * 0.32)
    + (Math.log1p(Math.max(0, candidate.commentCount)) * 0.22);
  const affinity = (clamp(candidate.authorAffinity, -1, 1) * 1.25)
    + (clamp(candidate.topicAffinity, -1, 1) * 1.1);
  const negativeSignal = -Math.min(6, Math.max(0, candidate.similarContentDislikes) * 2.25);
  const exploration = clamp(candidate.exploration, 0, 1) * 0.7;
  const total = freshness + popularity + affinity + negativeSignal + exploration;

  return { total, freshness, popularity, affinity, negativeSignal, exploration };
}
