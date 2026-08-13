import { BadgeCheck, FileText, Search, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiRequest, mediaUrl } from '../api/client';

interface SearchUser {
  id: string; username: string; displayName: string; avatarKey: string | null; bio: string; verified: number;
}

interface SearchPost {
  id: string; title: string; excerpt: string; publishedAt: string; username: string;
  displayName: string; avatarKey: string | null; verified: number;
}

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ users: SearchUser[]; posts: SearchPost[] }>({ users: [], posts: [] });
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2) return;
    setLoading(true); setError(null);
    try {
      const result = await apiRequest<{ users: SearchUser[]; posts: SearchPost[] }>(`/search?q=${encodeURIComponent(value)}`);
      setResults(result); setSearched(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось выполнить поиск.');
    } finally { setLoading(false); }
  };

  return <div className="search-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="search-dialog" role="dialog" aria-modal="true" aria-labelledby="search-dialog-title">
      <header><div><p className="eyebrow">Поиск по Tyson</p><h2 id="search-dialog-title">Найдите людей и публикации</h2></div><button type="button" aria-label="Закрыть поиск" onClick={onClose}><X /></button></header>
      <form onSubmit={(event) => void search(event)}><Search size={20} /><input ref={input} type="search" minLength={2} maxLength={80} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, @username или тема публикации" aria-label="Поисковый запрос" /><button type="submit" disabled={loading || query.trim().length < 2}>{loading ? 'Ищем…' : 'Найти'}</button></form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!searched && !error && <div className="search-dialog-hint"><Search /><strong>Поиск по всей соцсети</strong><span>Введите минимум два символа.</span></div>}
      {searched && !results.users.length && !results.posts.length && <div className="search-dialog-hint"><Search /><strong>Ничего не найдено</strong><span>Попробуйте другой запрос.</span></div>}
      {!!results.users.length && <div className="search-results-group"><h3><UserRound size={16} />Люди</h3><div className="search-user-results">{results.users.map((person) => <Link key={person.id} to={`/profile/${encodeURIComponent(person.username)}`} onClick={onClose}><span className="avatar avatar-small">{person.avatarKey ? <img className="avatar-image" src={mediaUrl(person.avatarKey) ?? ''} alt="" /> : person.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{person.displayName}{person.verified === 1 && <BadgeCheck size={14} />}</strong><small>@{person.username}{person.bio ? ` · ${person.bio}` : ''}</small></span></Link>)}</div></div>}
      {!!results.posts.length && <div className="search-results-group"><h3><FileText size={16} />Публикации</h3><div className="search-post-results">{results.posts.map((post) => <Link key={post.id} to={`/post/${encodeURIComponent(post.id)}`} onClick={onClose}><strong>{post.title || post.excerpt.slice(0, 80)}</strong><p>{post.excerpt}</p><small>{post.displayName}{post.verified === 1 ? ' ✓' : ''} · @{post.username}</small></Link>)}</div></div>}
    </section>
  </div>;
}

