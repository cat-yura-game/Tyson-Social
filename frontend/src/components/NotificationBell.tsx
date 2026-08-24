import { Bell, CheckCheck, Gem, MessageCircle, UserPlus, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, mediaUrl } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

interface NotificationItem {
  id: string;
  type: 'follow' | 'comment' | 'diamond';
  entityId: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
  actorUsername: string | null;
  actorDisplayName: string | null;
  actorAvatarKey: string | null;
}

const icons = { follow: UserPlus, comment: MessageCircle, diamond: Gem };

export function NotificationBell({ enabled }: { enabled: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) { setItems([]); setUnread(0); return; }
    try {
      const [data, telegram] = await Promise.all([
        apiRequest<{ notifications: NotificationItem[]; unreadCount: number }>('/notifications'),
        apiRequest<{ linked: boolean }>('/auth/telegram/status'),
      ]);
      const needsVerification = !user?.emailVerified && !telegram.linked;
      const important: NotificationItem[] = needsVerification ? [{ id: 'email-verification', type: 'diamond', entityId: null, message: 'Важно: вы не подтвердили почту. Зайдите в профиль, чтобы подтвердить её.', readAt: null, createdAt: new Date().toISOString(), actorUsername: null, actorDisplayName: 'Tyson', actorAvatarKey: null }] : [];
      setItems([...important, ...data.notifications]); setUnread(data.unreadCount + important.length);
    } catch { /* The header remains usable during a temporary API failure. */ }
  }, [enabled, user?.emailVerified]);

  useEffect(() => {
    void refresh();
    if (!enabled) return undefined;
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh, enabled]);

  const toggle = () => {
    if (!enabled) { navigate('/login'); return; }
    setOpen((value) => !value);
    if (!open) { setLoading(true); void refresh().finally(() => setLoading(false)); }
  };

  const markAll = async () => {
    await apiRequest('/notifications/read-all', { method: 'POST' });
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnread(0);
  };

  const openItem = async (item: NotificationItem) => {
    if (!item.readAt) {
      setUnread((value) => Math.max(0, value - 1));
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
      void apiRequest(`/notifications/${encodeURIComponent(item.id)}/read`, { method: 'POST' });
    }
    setOpen(false);
    navigate(item.id === 'email-verification' && user ? `/profile/${user.username}` : item.type === 'follow' && item.actorUsername ? `/profile/${item.actorUsername}` : item.entityId ? `/post/${item.entityId}` : '/');
  };

  return <>
    <button className="icon-button notification-bell" type="button" aria-label="Уведомления" aria-expanded={open} onClick={toggle}>
      <Bell size={21} />{unread > 0 && <span className="notification-badge">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <div className="notification-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="notification-panel" role="dialog" aria-modal="true" aria-label="Уведомления">
        <header><div><p className="eyebrow">Tyson</p><h2>Уведомления</h2></div><div>{unread > 0 && <button type="button" title="Прочитать всё" aria-label="Отметить всё прочитанным" onClick={() => void markAll()}><CheckCheck size={19} /></button>}<button type="button" aria-label="Закрыть" onClick={() => setOpen(false)}><X size={20} /></button></div></header>
        <div className="notification-list">
          {loading && !items.length ? <p className="notification-empty">Загрузка…</p> : items.length ? items.map((item) => {
            const Icon = icons[item.type];
            return <button className={item.readAt ? 'notification-item' : 'notification-item unread'} type="button" key={item.id} onClick={() => void openItem(item)}>
              <span className="notification-avatar">{item.actorAvatarKey ? <img src={mediaUrl(item.actorAvatarKey) ?? ''} alt="" /> : (item.actorDisplayName ?? 'T').slice(0, 1).toUpperCase()}<i><Icon size={12} /></i></span>
              <span className="notification-copy"><strong>{item.actorDisplayName ?? 'Tyson'}</strong> {item.message}<small>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt))}</small></span>
              {!item.readAt && <span className="notification-dot" />}
            </button>;
          }) : <p className="notification-empty"><Bell size={25} />Пока уведомлений нет</p>}
        </div>
      </section>
    </div>}
  </>;
}
