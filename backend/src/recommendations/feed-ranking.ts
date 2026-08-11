import { createAiProviders } from '../ai/providers';
import { sha256 } from '../security/tokens';
import type { Env } from '../types';
import type { RecommendationSignalType } from './provider';
import { scoreRecommendation } from './scoring';

export interface FeedCandidate {
  id: string;
  body: string;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  updatedAt: string;
  authorId: string;
  [key: string]: unknown;
}

interface HistoryRow {
  eventType: RecommendationSignalType;
  body: string;
  authorId: string;
}

export interface RankedFeed<T> {
  posts: T[];
  strategy: 'gemini' | 'scoring';
}

function randomExploration(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return (value[0] ?? 0) / 0xffffffff;
}

export async function rankFeed<T extends FeedCandidate>(env: Env, viewerId: string, candidates: T[]): Promise<RankedFeed<T>> {
  const historyResult = await env.DB.prepare(`SELECT e.event_type AS eventType, p.body, p.author_user_id AS authorId
    FROM recommendation_events e JOIN posts p ON p.id = e.post_id
    WHERE e.user_id = ? AND e.event_type IN ('open', 'like', 'dislike', 'comment')
    ORDER BY e.created_at DESC LIMIT 30`).bind(viewerId).all<HistoryRow>();
  const history = historyResult.results;
  const authorAffinity = new Map<string, number>();
  const authorDislikes = new Map<string, number>();
  for (const signal of history) {
    const weight = signal.eventType === 'dislike' ? -1 : signal.eventType === 'like' ? 0.7 : signal.eventType === 'comment' ? 0.5 : 0.15;
    authorAffinity.set(signal.authorId, (authorAffinity.get(signal.authorId) ?? 0) + weight);
    if (signal.eventType === 'dislike') authorDislikes.set(signal.authorId, (authorDislikes.get(signal.authorId) ?? 0) + 1);
  }

  const now = Date.now();
  const baseline = candidates.map((post) => ({
    post,
    score: scoreRecommendation({
      ageHours: Math.max(0, (now - Date.parse(post.publishedAt)) / 3_600_000),
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      authorAffinity: (authorAffinity.get(post.authorId) ?? 0) / 3,
      topicAffinity: 0,
      similarContentDislikes: authorDislikes.get(post.authorId) ?? 0,
      exploration: randomExploration(),
    }).total,
  })).sort((left, right) => right.score - left.score).map(({ post }) => post);

  if (baseline.length < 2) return { posts: baseline, strategy: 'scoring' };

  const aiCandidates = baseline.slice(0, 40);
  const signals = history.slice(0, 20).map((signal) => ({
    type: signal.eventType,
    text: signal.body.slice(0, 1000),
  }));
  const contentHash = await sha256(JSON.stringify({
    candidates: aiCandidates.map((post) => [post.id, post.updatedAt]).sort(([left], [right]) => String(left).localeCompare(String(right))),
    signals,
  }));
  try {
    const nowIso = new Date().toISOString();
    const cached = await env.DB.prepare(`SELECT ordered_post_ids_json AS orderedPostIdsJson
      FROM ai_recommendation_cache WHERE user_id = ? AND content_hash = ? AND expires_at > ?`)
      .bind(viewerId, contentHash, nowIso).first<{ orderedPostIdsJson: string }>();

    let orderedIds: string[];
    if (cached) {
      orderedIds = JSON.parse(cached.orderedPostIdsJson) as string[];
    } else {
      const ranking = await createAiProviders(env).recommendation.rank({
        candidates: aiCandidates.map((post) => ({ id: post.id, text: post.body.slice(0, 2000) })),
        signals,
      });
      orderedIds = ranking.orderedPostIds;
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      await env.DB.prepare(`INSERT INTO ai_recommendation_cache
        (user_id, content_hash, ordered_post_ids_json, provider, model_version, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET content_hash = excluded.content_hash,
          ordered_post_ids_json = excluded.ordered_post_ids_json, provider = excluded.provider,
          model_version = excluded.model_version, expires_at = excluded.expires_at, created_at = excluded.created_at`)
        .bind(viewerId, contentHash, JSON.stringify(orderedIds), ranking.provider, ranking.modelVersion, expiresAt, nowIso).run();
    }

    const positions = new Map(orderedIds.map((id, index) => [id, index]));
    const aiRanked = [...aiCandidates].sort((left, right) =>
      (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER));
    return { posts: [...aiRanked, ...baseline.slice(aiCandidates.length)], strategy: 'gemini' };
  } catch (error) {
    console.error(JSON.stringify({ event: 'ai_reranking_failed', error: error instanceof Error ? error.message : 'unknown' }));
    return { posts: baseline, strategy: 'scoring' };
  }
}
