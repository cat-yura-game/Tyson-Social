export interface Post {
  id: string;
  body: string;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  updatedAt: string;
  authorId: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  verified: number | boolean;
  viewerReaction: '' | 'like' | 'dislike';
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  username: string;
  displayName: string;
}
