import { BadgeCheck, Heart, MessageCircle, MoreHorizontal, Sparkles, ThumbsDown } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, mediaUrl } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import type { Post } from '../types/content';
import { RichPostText } from './RichPostText';

export function PostCard({ post }: { post: Post }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reaction, setReaction] = useState<Post['viewerReaction']>(post.viewerReaction);
  const [likes, setLikes] = useState(post.likeCount);
  const [pending, setPending] = useState(false);
  const time = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
  const minutes = Math.round((new Date(post.publishedAt).getTime() - Date.now()) / 60_000);

  const react = async (next: 'like' | 'dislike') => {
    if (!user) { navigate('/login'); return; }
    if (pending) return;
    setPending(true);
    try {
      const value = reaction === next ? null : next;
      const result = await apiRequest<{ reaction: Post['viewerReaction'] | null; likeCount: number }>(`/posts/${post.id}/reaction`, { method: 'PUT', body: JSON.stringify({ reaction: value }) });
      setReaction(result.reaction ?? '');
      setLikes(result.likeCount);
    } finally { setPending(false); }
  };

  return (
    <article className="post-card">
      <header className="post-header">
        <Link to={`/profile/${post.username}`} className="avatar">{post.avatarKey ? <img className="avatar-image" src={mediaUrl(post.avatarKey) ?? ''} alt="" /> : post.displayName.slice(0, 1).toUpperCase()}</Link>
        <div className="post-author"><Link to={`/profile/${post.username}`}><strong>{post.displayName}</strong>{post.verified && <BadgeCheck className="verified" size={17} aria-label="Подтверждённый аккаунт" />}</Link><span>@{post.username} · {Math.abs(minutes) < 60 ? time.format(minutes, 'minute') : new Date(post.publishedAt).toLocaleDateString('ru-RU')}</span></div>
        <button className="icon-button" type="button" aria-label="Действия с публикацией"><MoreHorizontal size={20} /></button>
      </header>
      <Link className="post-body" to={`/post/${post.id}`}>{post.title && <h2 className="post-title">{post.title}</h2>}<RichPostText text={post.body} /></Link>
      {post.mediaKey && <Link className="post-media" to={`/post/${post.id}`}><img loading="lazy" src={mediaUrl(post.mediaKey) ?? ''} alt="Изображение публикации" /></Link>}
      <footer className="post-actions">
        <button className={reaction === 'like' ? 'reaction-active' : ''} disabled={pending} type="button" aria-label="Нравится" onClick={() => void react('like')}><Heart size={19} /><span>{likes}</span></button>
        <button className={reaction === 'dislike' ? 'reaction-active' : ''} disabled={pending} type="button" aria-label="Не показывать похожее" onClick={() => void react('dislike')}><ThumbsDown size={19} /></button>
        <Link to={`/post/${post.id}`} aria-label={`${post.commentCount} комментариев`}><MessageCircle size={19} /><span>{post.commentCount}</span></Link>
        {post.body.length > 500 && <button className="ai-action" type="button"><Sparkles size={17} /><span>Коротко с AI</span></button>}
      </footer>
    </article>
  );
}
