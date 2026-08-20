export interface Post {
  id: string;
  title: string;
  body: string;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  updatedAt: string;
  authorId: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  wornGiftImage: string | null;
  mediaKey: string | null;
  verified: number | boolean;
  viewerReaction: '' | 'like' | 'dislike';
  diamondCount: number;
  viewerDiamondGiven: number | boolean;
  promoted?: number | boolean;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  wornGiftImage: string | null;
  diamondCount: number;
}
