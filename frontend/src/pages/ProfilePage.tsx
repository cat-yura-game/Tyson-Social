import { BadgeCheck, CalendarDays, MessageCircle, UserCheck, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest, mediaUrl } from '../api/client';
import { useAuth, type AuthUser } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import type { Post } from '../types/content';

type PublicProfile = Pick<AuthUser, 'id' | 'username' | 'displayName' | 'avatarKey' | 'bio' | 'verified' | 'createdAt'> & {
  followerCount: number;
  followingCount: number;
  viewerFollowing: boolean;
};

export function ProfilePage() {
  const { username = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);

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
  const toggleFollow = async () => {
    setFollowPending(true);
    setFollowError(null);
    try {
      const result = await apiRequest<{ following: boolean; followerCount: number }>(`/users/${encodeURIComponent(profile.username)}/follow`, {
        method: profile.viewerFollowing ? 'DELETE' : 'PUT',
      });
      setProfile({ ...profile, viewerFollowing: result.following, followerCount: result.followerCount });
    } catch {
      setFollowError('Не удалось изменить подписку. Попробуйте ещё раз.');
    } finally {
      setFollowPending(false);
    }
  };
  return <section className="profile-page">
    <div className="profile-cover" />
    <header className="profile-header">
      {avatar ? <img className="profile-avatar profile-avatar-image" src={avatar} alt="" /> : <div className="avatar profile-avatar">{profile.displayName.slice(0, 1).toUpperCase()}</div>}
      <div className="profile-controls">{isOwner && <Link className="secondary-button" to="/settings">Редактировать профиль</Link>}{user && !isOwner && <><button className={profile.viewerFollowing ? 'secondary-button follow-button following' : 'secondary-button follow-button'} type="button" disabled={followPending} onClick={() => void toggleFollow()}>{profile.viewerFollowing ? <UserCheck size={17} /> : <UserPlus size={17} />}{followPending ? 'Подождите…' : profile.viewerFollowing ? 'Вы подписаны' : 'Подписаться'}</button><button className="secondary-button message-profile-button" type="button" disabled={openingChat} onClick={() => void openChat()}><MessageCircle size={17} />{openingChat ? 'Открываем…' : 'Написать'}</button></>}</div>
      {followError && <p className="profile-follow-error form-error" role="alert">{followError}</p>}
      <div className="profile-copy"><h1>{profile.displayName}{profile.verified && <BadgeCheck className="verified" size={21} aria-label="Подтверждённый аккаунт" />}</h1><p>@{profile.username}</p><p className="profile-bio">{profile.bio || 'Пользователь пока ничего о себе не рассказал.'}</p><span><CalendarDays size={16} />В Tyson с {joined}</span></div>
      <div className="profile-stats"><span><strong>{posts.length}</strong> публикаций</span><span><strong>{profile.followerCount}</strong> подписчиков</span><span><strong>{profile.followingCount}</strong> подписок</span></div>
    </header>
    <div className="section-label">Публикации</div>
    <div className="profile-posts">{posts.length ? posts.map((post) => <PostCard key={post.id} post={post} onDeleted={(postId) => setPosts((current) => current.filter((item) => item.id !== postId))} />) : <div className="empty-profile">Здесь появятся публикации пользователя.</div>}</div>
  </section>;
}
