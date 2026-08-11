export type RecommendationSignalType = 'open' | 'like' | 'dislike' | 'comment';

export interface AiRecommendationCandidate {
  id: string;
  text: string;
}

export interface AiRecommendationSignal {
  type: RecommendationSignalType;
  text: string;
}

export interface RecommendationRankingInput {
  candidates: AiRecommendationCandidate[];
  signals: AiRecommendationSignal[];
  preferredTopics: string[];
}

export interface RecommendationRankingResult {
  orderedPostIds: string[];
  provider: string;
  modelVersion: string;
}

export interface RecommendationProvider {
  rank(input: RecommendationRankingInput): Promise<RecommendationRankingResult>;
}

export class DevelopmentRecommendationProvider implements RecommendationProvider {
  async rank(input: RecommendationRankingInput): Promise<RecommendationRankingResult> {
    return {
      orderedPostIds: input.candidates.map((candidate) => candidate.id),
      provider: 'development',
      modelVersion: 'deterministic-v1',
    };
  }
}
