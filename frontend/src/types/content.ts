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
  wornGiftId?: string | null;
  wornGiftImage: string | null;
  mediaKey: string | null;
  verified: number | boolean;
  viewerReaction: '' | 'like' | 'dislike';
  diamondCount: number;
  viewerDiamondGiven: number | boolean;
  promoted?: number | boolean;
  pollId?: string | null;
  pollQuestion?: string | null;
  pollEndsAt?: string | null;
}

export interface Poll { id: string; question: string; endsAt: string | null; totalVotes: number; viewerOptionId: string | null; options: Array<{ id: string; label: string; votes: number }>; }

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  wornGiftId?: string | null;
  wornGiftImage: string | null;
  diamondCount: number;
}
