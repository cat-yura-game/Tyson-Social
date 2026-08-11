import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { PostCard } from '../components/PostCard';
import { FeedPreferencesDialog } from '../components/FeedPreferencesDialog';
import type { Post } from '../types/content';
import { useAuth } from '../auth/AuthProvider';
import { StoriesBar } from '../components/StoriesBar';

export function FeedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const topic = searchParams.get('topic')?.trim() ?? '';
  const requestedView = searchParams.get('view');
  const view: 'for-you' | 'fresh' | 'following' = requestedView === 'fresh' || requestedView === 'following' ? requestedView : 'for-you';
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferencesVersion, setPreferencesVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (topic) params.set('topic', topic);
    if (view !== 'for-you') params.set('view', view);
    const query = params.size ? `?${params.toString()}` : '';
    apiRequest<{ posts: Post[] }>(`/feed${query}`)
      .then((data) => { if (active) setPosts(data.posts); })
      .catch(() => { if (active) setPosts([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [preferencesVersion, topic, view]);
  const selectView = (nextView: 'for-you' | 'fresh' | 'following') => {
    if (nextView === 'following' && !user) { navigate('/login'); return; }
    const next = new URLSearchParams(searchParams);
    if (nextView === 'for-you') next.delete('view'); else next.set('view', nextView);
    setSearchParams(next);
  };
  return <div className="feed-page">
    <StoriesBar />
    <header className="page-heading feed-heading"><div><p className="eyebrow">Персональная лента</p><h1>{view === 'fresh' ? 'Свежие публикации' : view === 'following' ? 'Публикации подписок' : 'Интересное для вас'}</h1></div><button className="filter-button" type="button" onClick={() => setShowPreferences(true)}><SlidersHorizontal size={18} /><span>Настроить</span></button></header>
    <div className="feed-tabs"><button className={view === 'for-you' ? 'active' : ''} type="button" onClick={() => selectView('for-you')}>Для вас</button><button className={view === 'following' ? 'active' : ''} type="button" onClick={() => selectView('following')}>Подписки</button><button className={view === 'fresh' ? 'active' : ''} type="button" onClick={() => selectView('fresh')}>Свежее</button></div>
    {topic && <div className="active-topic"><span>Тема: <strong>{topic}</strong></span><Link to="/">Показать всю ленту</Link></div>}
    <section className="feed-list" aria-label="Лента публикаций">{loading ? <div className="feed-empty">Загрузка…</div> : posts.length ? posts.map((post) => <PostCard key={post.id} post={post} onDeleted={(postId) => setPosts((current) => current.filter((item) => item.id !== postId))} />) : <div className="feed-empty"><strong>{view === 'following' ? 'В подписках пока пусто' : 'Лента пока пуста'}</strong><span>{view === 'following' ? 'Подпишитесь на интересных авторов — их посты появятся здесь.' : 'Создайте первый пост в Tyson.'}</span></div>}</section>
    {showPreferences && <FeedPreferencesDialog onClose={() => setShowPreferences(false)} onSaved={() => setPreferencesVersion((version) => version + 1)} />}
  </div>;
}
