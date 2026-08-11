import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { PostCard } from '../components/PostCard';
import type { Post } from '../types/content';

export function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiRequest<{ posts: Post[] }>('/feed').then((data) => setPosts(data.posts)).finally(() => setLoading(false)); }, []);
  return <div className="feed-page">
    <header className="page-heading feed-heading"><div><p className="eyebrow">Персональная лента</p><h1>Интересное для вас</h1></div><button className="filter-button" type="button"><SlidersHorizontal size={18} /><span>Настроить</span></button></header>
    <div className="feed-tabs"><button className="active" type="button">Для вас</button><button type="button">Свежее</button></div>
    <section className="feed-list" aria-label="Лента публикаций">{loading ? <div className="feed-empty">Загрузка…</div> : posts.length ? posts.map((post) => <PostCard key={post.id} post={post} />) : <div className="feed-empty"><strong>Лента пока пуста</strong><span>Создайте первый пост в Tyson.</span></div>}</section>
  </div>;
}
