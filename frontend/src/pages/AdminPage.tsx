import { Activity, BadgeCheck, MessageSquareText, ShieldAlert, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest, mediaUrl } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

interface AdminStats {
  totalUsers: number; activeUsers: number; restrictedUsers: number; joinedLast24Hours: number;
  verifiedUsers: number; telegramUsers: number; publishedPosts: number; publishedComments: number;
  moderationReviewCount: number; openSecurityEvents: number;
}

interface AdminUser {
  id: string; username: string; displayName: string; email: string; avatarKey: string | null;
  role: 'user' | 'moderator' | 'admin'; status: 'pending_email' | 'active' | 'limited' | 'suspended';
  verified: number; telegramLinked: number; postCount: number; createdAt: string;
}

export function AdminPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (query.trim()) params.set('q', query.trim());
      if (status) params.set('status', status);
      const [overview, list] = await Promise.all([
        apiRequest<{ stats: AdminStats }>('/admin/overview?v=1'),
        apiRequest<{ users: AdminUser[] }>(`/admin/users?${params}`),
      ]);
      setStats(overview.stats); setUsers(list.users);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить админ-панель.');
    }
  }, [query, status]);

  useEffect(() => { if (user?.role === 'admin') void load(); }, [load, user?.role]);

  const changeStatus = async (target: AdminUser, nextStatus: 'active' | 'limited' | 'suspended') => {
    setPendingId(target.id); setError(null);
    try {
      await apiRequest(`/admin/users/${encodeURIComponent(target.id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось изменить статус аккаунта.'); }
    finally { setPendingId(null); }
  };

  if (user?.role !== 'admin') return <section className="surface-page"><p className="form-error">Эта страница доступна только администратору Tyson.</p></section>;

  const cards = stats ? [
    ['Пользователи', stats.totalUsers, Users], ['Активные', stats.activeUsers, Activity],
    ['За 24 часа', stats.joinedLast24Hours, Users], ['С Telegram', stats.telegramUsers, MessageSquareText],
    ['С галочкой', stats.verifiedUsers, BadgeCheck], ['Ограничены', stats.restrictedUsers, ShieldAlert],
  ] as const : [];

  return <section className="surface-page admin-page">
    <header className="page-heading"><div><p className="eyebrow">Управление Tyson</p><h1>Админ-панель</h1></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-stat-grid">{cards.map(([label, value, Icon]) => <article key={label}><Icon size={20} /><span>{label}</span><strong>{value}</strong></article>)}</div>
    {stats && <div className="admin-secondary-stats"><span>Публикаций: <b>{stats.publishedPosts}</b></span><span>Комментариев: <b>{stats.publishedComments}</b></span><span>На проверке: <b>{stats.moderationReviewCount}</b></span><span>Событий безопасности: <b>{stats.openSecurityEvents}</b></span></div>}
    <div className="admin-users-heading"><div><h2>Пользователи</h2><small>Показаны последние 100 аккаунтов</small></div><div><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Username, имя или email" /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Все статусы</option><option value="active">Активные</option><option value="limited">Ограниченные</option><option value="suspended">Заблокированные</option><option value="pending_email">Ожидающие</option></select><button className="secondary-button" type="button" onClick={() => void load()}>Найти</button></div></div>
    <div className="admin-user-list">{users.map((account) => <article key={account.id}>
      <span className="avatar avatar-small">{account.avatarKey ? <img className="avatar-image" src={mediaUrl(account.avatarKey) ?? ''} alt="" /> : account.displayName.slice(0, 1).toUpperCase()}</span>
      <div className="admin-user-main"><strong>{account.displayName}{account.verified === 1 && <BadgeCheck size={15} />}</strong><span>@{account.username} · {account.email}</span><small>{new Date(account.createdAt).toLocaleDateString('ru-RU')} · {account.postCount} публикаций{account.telegramLinked === 1 ? ' · Telegram' : ''}</small></div>
      <span className={`admin-status status-${account.status}`}>{account.status}</span>
      <div className="admin-user-actions">{account.role === 'admin' ? <b>Администратор</b> : <><button disabled={pendingId === account.id} type="button" onClick={() => void changeStatus(account, 'active')}>Активен</button><button disabled={pendingId === account.id} type="button" onClick={() => void changeStatus(account, 'limited')}>Ограничить</button><button disabled={pendingId === account.id} type="button" onClick={() => void changeStatus(account, 'suspended')}>Блокировать</button></>}</div>
    </article>)}</div>
  </section>;
}
