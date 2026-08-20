import { BadgeCheck, CalendarDays, Gift, MessageCircle, QrCode, UserCheck, UserPlus } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest, mediaUrl } from '../api/client';
import { useAuth, type AuthUser } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { GiftDetailsModal, type GiftDetails } from '../components/GiftDetailsModal';
import { ProfileQrModal } from '../components/ProfileQrModal';
import type { Post } from '../types/content';

type PublicProfile = Pick<AuthUser, 'id' | 'username' | 'displayName' | 'avatarKey' | 'bio' | 'verified' | 'createdAt'> & {
  followerCount: number;
  followingCount: number;
  viewerFollowing: boolean;
};
type ProfileGift = GiftDetails;

export function ProfilePage() {
  const { username = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [gifts, setGifts] = useState<ProfileGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const [selectedGift, setSelectedGift] = useState<GiftDetails | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [profileTab, setProfileTab] = useState<'posts' | 'gifts'>('posts');

  useEffect(() => {
    setLoading(true); setMissing(false);
    Promise.all([
      apiRequest<{ user: PublicProfile }>(`/users/${encodeURIComponent(username)}`),
      apiRequest<{ posts: Post[] }>(`/users/${encodeURIComponent(username)}/posts`),
      apiRequest<{ gifts: ProfileGift[] }>(`/users/${encodeURIComponent(username)}/gifts`),
    ]).then(([profileData, postsData, giftsData]) => { setProfile(profileData.user); setPosts(postsData.posts); setGifts(giftsData.gifts); })
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
  const exchangeGift = async () => {
    if (!selectedGift || !window.confirm(`Обменять подарок на ${selectedGift.exchangeReward} 💎? Подарок будет удалён.`)) return;
    await apiRequest(`/user-gifts/${selectedGift.id}/exchange`, { method: 'POST' });
    setGifts((current) => current.filter((gift) => gift.id !== selectedGift.id));
    setSelectedGift(null);
    window.dispatchEvent(new Event('diamonds-changed'));
  };
  const upgradeGift = async () => {
    if (!selectedGift) return;
    const result = await apiRequest<{ gift: GiftDetails }>(`/user-gifts/${selectedGift.id}/upgrade`, { method: 'POST' });
    setGifts((current) => current.map((gift) => gift.id === result.gift.id ? result.gift : gift));
    setSelectedGift(result.gift);
    window.dispatchEvent(new Event('diamonds-changed'));
  };
  const setGiftVisibility = async () => {
    if (!selectedGift) return;
    const result = await apiRequest<{ isPublic: boolean }>(`/user-gifts/${selectedGift.id}/public`, { method: 'PUT', body: JSON.stringify({ isPublic: !selectedGift.isPublic }) });
    const updated = { ...selectedGift, isPublic: result.isPublic };
    setGifts((current) => current.map((gift) => gift.id === updated.id ? updated : gift));
    setSelectedGift(updated);
  };
  const sellGift = async () => {
    if (!selectedGift) return;
    const raw = window.prompt('Цена продажи в алмазах');
    if (raw === null) return;
    const price = Number(raw);
    if (!Number.isInteger(price) || price < 1) return;
    await apiRequest(`/user-gifts/${selectedGift.id}/list`, { method: 'POST', body: JSON.stringify({ price }) });
    setSelectedGift(null);
  };
  return <section className="profile-page">
    <div className="profile-cover" />
    <header className="profile-header">
      {avatar ? <img className="profile-avatar profile-avatar-image" src={avatar} alt="" /> : <div className="avatar profile-avatar">{profile.displayName.slice(0, 1).toUpperCase()}</div>}
      <div className="profile-controls">{isOwner && <Link className="secondary-button" to="/settings">Редактировать профиль</Link>}<button className="secondary-button profile-qr-trigger" type="button" onClick={() => setShowQr(true)}><QrCode size={17} />QR-код</button>{user && !isOwner && <><button className={profile.viewerFollowing ? 'secondary-button follow-button following' : 'secondary-button follow-button'} type="button" disabled={followPending} onClick={() => void toggleFollow()}>{profile.viewerFollowing ? <UserCheck size={17} /> : <UserPlus size={17} />}{followPending ? 'Подождите…' : profile.viewerFollowing ? 'Вы подписаны' : 'Подписаться'}</button><button className="secondary-button message-profile-button" type="button" disabled={openingChat} onClick={() => void openChat()}><MessageCircle size={17} />{openingChat ? 'Открываем…' : 'Написать'}</button></>}</div>
      {followError && <p className="profile-follow-error form-error" role="alert">{followError}</p>}
      <div className="profile-copy"><h1>{profile.displayName}{profile.verified && <BadgeCheck className="verified" size={21} aria-label="Подтверждённый аккаунт" />}{gifts.find((gift) => gift.worn) && <img className="profile-worn-gift" src={gifts.find((gift) => gift.worn)?.image} alt="Надетый подарок" />}</h1><p>@{profile.username}</p><p className="profile-bio">{profile.bio || 'Пользователь пока ничего о себе не рассказал.'}</p><span><CalendarDays size={16} />В Tyson с {joined}</span></div>
      <div className="profile-stats"><span><strong>{posts.length}</strong> публикаций</span><span><strong>{profile.followerCount}</strong> подписчиков</span><span><strong>{profile.followingCount}</strong> подписок</span></div>
    </header>
    <div className="profile-tabs" role="tablist" aria-label="Разделы профиля"><button className={profileTab === 'posts' ? 'active' : ''} type="button" role="tab" aria-selected={profileTab === 'posts'} onClick={() => setProfileTab('posts')}>Публикации</button><button className={profileTab === 'gifts' ? 'active' : ''} type="button" role="tab" aria-selected={profileTab === 'gifts'} onClick={() => setProfileTab('gifts')}><Gift size={17} />Подарки{gifts.length > 0 && <span>{gifts.length}</span>}</button></div>
    {profileTab === 'posts' ? <div className="profile-posts">{posts.length ? posts.map((post) => <PostCard key={post.id} post={post} onDeleted={(postId) => setPosts((current) => current.filter((item) => item.id !== postId))} />) : <div className="empty-profile">Здесь появятся публикации пользователя.</div>}</div> : <section className="profile-gift-gallery" aria-label="Подарки профиля">{gifts.length ? gifts.map((gift) => <button className={gift.worn ? 'profile-gift-tile worn' : 'profile-gift-tile'} style={{ '--gift-accent': gift.accentColor } as CSSProperties} type="button" onClick={() => setSelectedGift(gift)} key={gift.id}><img src={gift.image} alt={gift.title} />{gift.worn && <span>Надет</span>}</button>) : <div className="empty-profile">У пользователя пока нет подарков.</div>}</section>}
    {selectedGift && <GiftDetailsModal gift={selectedGift} owner={{ username: profile.username, displayName: profile.displayName, avatarKey: profile.avatarKey }} mine={isOwner} onUpgrade={isOwner ? upgradeGift : undefined} onVisibility={isOwner ? () => void setGiftVisibility() : undefined} onSell={isOwner ? () => void sellGift() : undefined} onExchange={isOwner ? () => void exchangeGift() : undefined} onClose={() => setSelectedGift(null)} />}
    {showQr && <ProfileQrModal username={profile.username} onClose={() => setShowQr(false)} />}
  </section>;
}
