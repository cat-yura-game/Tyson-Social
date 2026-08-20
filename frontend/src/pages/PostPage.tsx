import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Diamond, Share2 } from 'lucide-react';
import { apiRequest, mediaUrl } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import type { Comment, Post } from '../types/content';

export function PostPage() {
  const { id = '' } = useParams(); const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null); const [comments, setComments] = useState<Comment[]>([]); const [body, setBody] = useState('');
  const load = () => Promise.all([apiRequest<{ post: Post }>(`/posts/${id}`), apiRequest<{ comments: Comment[] }>(`/posts/${id}/comments`)]).then(([postData, commentData]) => { setPost(postData.post); setComments(commentData.comments); });
  useEffect(() => { void load(); }, [id]);
  const submit = async (event: FormEvent) => { event.preventDefault(); await apiRequest(`/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); await load(); };
  const donate = async (comment: Comment) => { if (!user || user.id === comment.authorId) return; const amount = Number(window.prompt('Сколько алмазов отправить?', '1')); if (!Number.isInteger(amount) || amount < 1 || !window.confirm(`Отправить ${amount} 💎 автору комментария? Отменить нельзя.`)) return; await apiRequest(`/comments/${comment.id}/diamond`, { method: 'POST', body: JSON.stringify({ amount }) }); await load(); };
  if (!post) return <section className="surface-page">Загрузка публикации…</section>;
  return <section className="post-page"><PostCard post={post} /><div className="comments-panel"><h2>Комментарии</h2>{user && <form className="comment-form" onSubmit={(event) => void submit(event)}><input required maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Написать комментарий" /><button className="secondary-button" type="submit">Отправить</button></form>}{comments.map((comment) => <article className="comment" key={comment.id}><header className="comment-header"><Link className="avatar avatar-small" to={`/profile/${encodeURIComponent(comment.username)}`}>{comment.avatarKey ? <img className="avatar-image" src={mediaUrl(comment.avatarKey) ?? ''} alt="" /> : comment.displayName.slice(0, 1).toUpperCase()}</Link><div><Link className="comment-author-link" to={`/profile/${encodeURIComponent(comment.username)}`}><strong>{comment.displayName}</strong>{comment.wornGiftImage && <img className="author-worn-gift" src={comment.wornGiftImage} alt="Надетый подарок" />}</Link><small>@{comment.username}</small></div></header><p>{comment.body}</p><footer className="comment-actions"><button type="button" disabled={!user || user.id === comment.authorId} onClick={() => void donate(comment)}><Diamond size={16} />{comment.diamondCount}</button><button type="button" onClick={() => window.location.assign(`/messages?shareComment=${encodeURIComponent(comment.id)}&post=${encodeURIComponent(id)}`)}><Share2 size={16} />Поделиться</button></footer></article>)}{!comments.length && <p className="feed-empty">Комментариев пока нет.</p>}</div></section>;
}
