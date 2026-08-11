export interface TrendSourcePost {
  id: string;
  body: string;
  likeCount: number;
  commentCount: number;
}

export interface TrendTopic {
  label: string;
  query: string;
  postCount: number;
}

const STOP_WORDS = new Set([
  'этот', 'эта', 'это', 'эти', 'того', 'тоже', 'только', 'когда', 'чтобы', 'который', 'которая', 'которые',
  'нашей', 'нашего', 'своей', 'свой', 'было', 'будет', 'есть', 'очень', 'просто', 'пока', 'сейчас', 'здесь',
  'для', 'или', 'как', 'что', 'при', 'над', 'под', 'без', 'про', 'всего', 'уже', 'ещё', 'еще', 'пост', 'tyson', 'тайсон',
  'this', 'that', 'with', 'from', 'have', 'will', 'your', 'about', 'just', 'into', 'than', 'then', 'the', 'and',
]);

interface TopicAccumulator {
  label: string;
  query: string;
  postIds: Set<string>;
  engagement: number;
  hashtag: boolean;
  firstSeen: number;
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase('ru-RU') + value.slice(1);
}

export function extractTrends(posts: TrendSourcePost[], limit = 3): TrendTopic[] {
  const topics = new Map<string, TopicAccumulator>();
  let order = 0;

  const add = (key: string, label: string, query: string, post: TrendSourcePost, hashtag: boolean) => {
    const existing = topics.get(key);
    if (existing) {
      existing.postIds.add(post.id);
      existing.engagement += post.likeCount + post.commentCount * 2;
      return;
    }
    topics.set(key, {
      label,
      query,
      postIds: new Set([post.id]),
      engagement: post.likeCount + post.commentCount * 2,
      hashtag,
      firstSeen: order++,
    });
  };

  for (const post of posts) {
    const hashtags = [...post.body.matchAll(/#([\p{L}\p{N}_]{2,40})/gu)];
    for (const match of hashtags) {
      const value = match[1];
      if (!value) continue;
      const normalized = value.toLocaleLowerCase('ru-RU');
      add(`#${normalized}`, `#${value}`, `#${value}`, post, true);
    }

    const textWithoutHashtags = post.body.replace(/#[\p{L}\p{N}_]{2,40}/gu, ' ');
    const uniqueWords = new Set(
      [...textWithoutHashtags.matchAll(/[\p{L}][\p{L}\p{N}-]{3,39}/gu)]
        .map((match) => match[0].toLocaleLowerCase('ru-RU'))
        .filter((word) => !STOP_WORDS.has(word)),
    );
    for (const word of uniqueWords) add(word, capitalize(word), word, post, false);
  }

  return [...topics.values()]
    .sort((left, right) => {
      const countDifference = right.postIds.size - left.postIds.size;
      if (countDifference) return countDifference;
      if (left.hashtag !== right.hashtag) return left.hashtag ? -1 : 1;
      const engagementDifference = right.engagement - left.engagement;
      return engagementDifference || left.firstSeen - right.firstSeen;
    })
    .slice(0, Math.max(0, limit))
    .map((topic) => ({ label: topic.label, query: topic.query, postCount: topic.postIds.size }));
}
