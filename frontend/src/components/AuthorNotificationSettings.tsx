import { BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiRequest, mediaUrl } from '../api/client';

interface AuthorPreference { id: string; username: string; displayName: string; avatarKey: string | null; enabled: number | boolean }

export function AuthorNotificationSettings() {
  const [authors, setAuthors] = useState<AuthorPreference[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  useEffect(() => { void apiRequest<{ authors: AuthorPreference[] }>('/users/me/post-notification-authors').then((data) => setAuthors(data.authors)).catch(() => setAuthors([])); }, []);

  const toggle = async (author: AuthorPreference) => {
    const enabled = !author.enabled; setPendingId(author.id);
    try {
      await apiRequest('/users/me/post-notification-authors', { method: 'PUT', body: JSON.stringify({ authorUserId: author.id, enabled }) });
      setAuthors((current) => current?.map((item) => item.id === author.id ? { ...item, enabled } : item) ?? []);
    } finally { setPendingId(null); }
  };

  return <section className="author-notification-settings" aria-labelledby="author-notification-title">
    <div><p className="eyebrow">Новые публикации</p><h2 id="author-notification-title"><BellRing size={19} />Избранные авторы</h2><p>Выберите подписки, о новых публикациях которых Tyson должен сообщать отдельно.</p></div>
    {authors === null ? <span className="settings-loading">Загрузка…</span> : authors.length ? <div className="author-notification-list">{authors.map((author) => <label key={author.id}><span className="avatar avatar-small">{author.avatarKey ? <img className="avatar-image" src={mediaUrl(author.avatarKey) ?? ''} alt="" /> : author.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{author.displayName}</strong><small>@{author.username}</small></span><input type="checkbox" checked={Boolean(author.enabled)} disabled={pendingId === author.id} onChange={() => void toggle(author)} /></label>)}</div> : <p className="author-notification-empty">Сначала подпишитесь на интересных авторов.</p>}
  </section>;
}
