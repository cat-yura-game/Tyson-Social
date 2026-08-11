import { BadgeCheck, CalendarDays, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest, mediaUrl } from '../api/client';
import { useAuth, type AuthUser } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import type { Post } from '../types/content';

type PublicProfile = Pick<AuthUser, 'id' | 'username' | 'displayName' | 'avatarKey' | 'bio' | 'verified' | 'createdAt'>;

export function ProfilePage() {
  const { username = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  useEffect(() => {
    setLoading(true); setMissing(false);
    Promise.all([
      apiRequest<{ user: PublicProfile }>(`/users/${encodeURIComponent(username)}`),
      apiRequest<{ posts: Post[] }>(`/users/${encodeURIComponent(username)}/posts`),
    ]).then(([profileData, postsData]) => { setProfile(profileData.user); setPosts(postsData.posts); })
      .catch(() => setMissing(true)).finally(() => setLoading(false));
  }, [username]);

  if (loading) return <section className="surface-page profile-state">Загрузка профиля…</section>;
  if (missing || !profile) return <section className="surface-page profile-state"><h1>Профиль не найден</h1><Link className="text-link" to="/">Вернуться в ленту</Link></section>;

  const joined = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(profile.createdAt));
  const isOwner = user?.id === profile.id;
  const avatar = mediaUrl(profile.avatarKey);
  const openChat = async () => {
    setOpeningChat(true);
    try {
      const result = await apiRequest<{ conversation: { id: string } }>('/messages/conversations', {
        method: 'POST',
        body: JSON.stringify({ recipientUsername: profile.username }),
      });
      navigate(`/messages?conversation=${encodeURIComponent(result.conversation.id)}`);
    } finally {
      setOpeningChat(false);
    }
  };
  return <section className="profile-page">
    <div className="profile-cover" />
    <header className="profile-header">
      {avatar ? <img className="profile-avatar profile-avatar-image" src={avatar} alt="" /> : <div className="avatar profile-avatar">{profile.displayName.slice(0, 1).toUpperCase()}</div>}
      <div className="profile-controls">{isOwner && <Link className="secondary-button" to="/settings">Редактировать профиль</Link>}{user && !isOwner && <button className="secondary-button message-profile-button" type="button" disabled={openingChat} onClick={() => void openChat()}><MessageCircle size={17} />{openingChat ? 'Открываем…' : 'Написать'}</button>}</div>
      <div className="profile-copy"><h1>{profile.displayName}{profile.verified && <BadgeCheck className="verified" size={21} aria-label="Подтверждённый аккаунт" />}</h1><p>@{profile.username}</p><p className="profile-bio">{profile.bio || 'Пользователь пока ничего о себе не рассказал.'}</p><span><CalendarDays size={16} />В Tyson с {joined}</span>{isOwner && !user.emailVerified && <span className="unverified-badge">Email пока не подтверждён</span>}</div>
      <div className="profile-stats"><span><strong>{posts.length}</strong> публикаций</span></div>
    </header>
    <div className="section-label">Публикации</div>
    <div className="profile-posts">{posts.length ? posts.map((post) => <PostCard key={post.id} post={post} />) : <div className="empty-profile">Здесь появятся публикации пользователя.</div>}</div>
  </section>;
}
