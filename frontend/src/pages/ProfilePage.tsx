import { BadgeCheck, CalendarDays } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth, type AuthUser } from '../auth/AuthProvider';

type PublicProfile = Pick<AuthUser, 'id' | 'username' | 'displayName' | 'avatarKey' | 'bio' | 'status' | 'verified' | 'createdAt'>;

export function ProfilePage() {
  const { username = '' } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setLoading(true);
    setMissing(false);
    apiRequest<{ user: PublicProfile }>(`/users/${encodeURIComponent(username)}`)
      .then(({ user: nextProfile }) => setProfile(nextProfile))
      .catch(() => setMissing(true))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) return <section className="surface-page profile-state">Загрузка профиля…</section>;
  if (missing || !profile) return <section className="surface-page profile-state"><h1>Профиль не найден</h1><Link className="text-link" to="/">Вернуться в ленту</Link></section>;

  const joined = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(profile.createdAt));
  const isOwner = user?.id === profile.id;
  return (
    <section className="profile-page">
      <div className="profile-cover" />
      <header className="profile-header">
        <div className="avatar profile-avatar">{profile.displayName.slice(0, 1).toUpperCase()}</div>
        {isOwner && <Link className="secondary-button" to="/settings">Редактировать профиль</Link>}
        <div className="profile-copy">
          <h1>{profile.displayName}{profile.verified && <BadgeCheck className="verified" size={21} aria-label="Подтверждённый аккаунт" />}</h1><p>@{profile.username}</p>
          <p className="profile-bio">{profile.bio || 'Пользователь пока ничего о себе не рассказал.'}</p>
          <span><CalendarDays size={16} />В Tyson с {joined}</span>
          {isOwner && !user.emailVerified && <span className="unverified-badge">Email пока не подтверждён</span>}
        </div>
        <div className="profile-stats"><span><strong>0</strong> публикаций</span><span><strong>0</strong> подписчиков</span><span><strong>0</strong> подписок</span></div>
      </header>
      <div className="section-label">Публикации</div>
      <div className="empty-profile">Здесь появятся публикации пользователя.</div>
    </section>
  );
}
