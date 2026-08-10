export interface StoredPostReactionCounts {
  likes: number;
  dislikes: number;
}

export interface PublicPost {
  id: string;
  body: string;
  likeCount: number;
}

export function toPublicPost(
  post: { id: string; body: string },
  reactions: StoredPostReactionCounts,
): PublicPost {
  return {
    id: post.id,
    body: post.body,
    likeCount: Math.max(0, reactions.likes),
  };
}
