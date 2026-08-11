import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import type { Comment, Post } from '../types/content';

export function PostPage() {
  const { id = '' } = useParams(); const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null); const [comments, setComments] = useState<Comment[]>([]); const [body, setBody] = useState('');
  const load = () => Promise.all([apiRequest<{ post: Post }>(`/posts/${id}`), apiRequest<{ comments: Comment[] }>(`/posts/${id}/comments`)]).then(([postData, commentData]) => { setPost(postData.post); setComments(commentData.comments); });
  useEffect(() => { void load(); }, [id]);
  const submit = async (event: FormEvent) => { event.preventDefault(); await apiRequest(`/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); await load(); };
  if (!post) return <section className="surface-page">Загрузка публикации…</section>;
  return <section className="post-page"><PostCard post={post} /><div className="comments-panel"><h2>Комментарии</h2>{user && <form className="comment-form" onSubmit={(event) => void submit(event)}><input required maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Написать комментарий" /><button className="secondary-button" type="submit">Отправить</button></form>}{comments.map((comment) => <article className="comment" key={comment.id}><strong>{comment.displayName} <small>@{comment.username}</small></strong><p>{comment.body}</p></article>)}{!comments.length && <p className="feed-empty">Комментариев пока нет.</p>}</div></section>;
}
