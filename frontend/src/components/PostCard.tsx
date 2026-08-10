import { BadgeCheck, Bookmark, Heart, MessageCircle, MoreHorizontal, Share2, Sparkles, ThumbsDown } from 'lucide-react';
import { Link } from 'react-router-dom';

interface PostCardProps {
  id: string;
  author: string;
  username: string;
  time: string;
  body: string;
  likes: number;
  comments: number;
  verified?: boolean;
  accent?: boolean;
}

export function PostCard({ id, author, username, time, body, likes, comments, verified, accent }: PostCardProps) {
  return (
    <article className="post-card">
      <header className="post-header">
        <Link to={`/profile/${username}`} className={`avatar ${accent ? 'avatar-accent' : ''}`}>{author.slice(0, 1)}</Link>
        <div className="post-author">
          <Link to={`/profile/${username}`}><strong>{author}</strong>{verified && <BadgeCheck className="verified" size={17} aria-label="Подтверждённая компания" />}</Link>
          <span>@{username} · {time}</span>
        </div>
        <button className="icon-button" type="button" aria-label="Действия с публикацией"><MoreHorizontal size={20} /></button>
      </header>
      <Link className="post-body" to={`/post/${id}`}>{body}</Link>
      {accent && <div className="post-visual"><span>Город<br />слышит<br />тебя.</span><small>Tyson / Идеи рядом</small></div>}
      <footer className="post-actions">
        <button type="button" aria-label="Нравится"><Heart size={19} /><span>{likes}</span></button>
        <button type="button" aria-label="Не показывать похожее"><ThumbsDown size={19} /></button>
        <Link to={`/post/${id}`} aria-label={`${comments} комментариев`}><MessageCircle size={19} /><span>{comments}</span></Link>
        <button className="ai-action" type="button"><Sparkles size={17} /><span>Коротко с AI</span></button>
        <button type="button" aria-label="Поделиться"><Share2 size={18} /></button>
        <button type="button" aria-label="Сохранить"><Bookmark size={19} /></button>
      </footer>
    </article>
  );
}
