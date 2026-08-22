import { AtSign, BadgeCheck, BarChart3, CalendarDays, Copy, Gift, MessageCircle, QrCode, Repeat2, UserCheck, UserPlus, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest, mediaUrl } from '../api/client';
import { useAuth, type AuthUser } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { GiftDetailsModal, type GiftDetails } from '../components/GiftDetailsModal';
import { ProfileQrModal } from '../components/ProfileQrModal';
import type { Post } from '../types/content';
import './profile-analytics.css';

type PublicProfile = Pick<AuthUser, 'id' | 'username' | 'displayName' | 'avatarKey' | 'bio' | 'verified' | 'createdAt' | 'lastSeenAt' | 'birthdayMonthDay' | 'birthdayYear'> & {
  followerCount: number;
  followingCount: number;
  viewerFollowing: boolean;
  aliases: Array<{ id: string; username: string; createdAt: string; purchasePrice: number }>;
};
type ProfileGift = GiftDetails;
type AuthorAnalytics = { periodDays: number; reach: number; impressions: number; interactions: number; followers: number; topPosts: Array<{ id: string; title: string; body: string; publishedAt: string; likeCount: number; commentCount: number; repostCount: number; impressions: number; reach: number }> };

export function ProfilePage() {
  const { username = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reposts, setReposts] = useState<Post[]>([]);
  const [gifts, setGifts] = useState<ProfileGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const [selectedGift, setSelectedGift] = useState<GiftDetails | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [profileTab, setProfileTab] = useState<'posts' | 'reposts' | 'gifts'>('posts');
  const [selectedAlias, setSelectedAlias] = useState<PublicProfile['aliases'][number] | null>(null);
  const [analytics, setAnalytics] = useState<AuthorAnalytics | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    setLoading(true); setMissing(false);
    Promise.all([
      apiRequest<{ user: PublicProfile }>(`/users/${encodeURIComponent(username)}`),
      apiRequest<{ posts: Post[] }>(`/users/${encodeURIComponent(username)}/posts`),
      apiRequest<{ posts: Post[] }>(`/users/${encodeURIComponent(username)}/reposts`),
      apiRequest<{ gifts: ProfileGift[] }>(`/users/${encodeURIComponent(username)}/gifts`),
    ]).then(([profileData, postsData, repostsData, giftsData]) => { setProfile(profileData.user); setPosts(postsData.posts.filter((post) => !post.repostOfPostId)); setReposts(repostsData.posts); setGifts(giftsData.gifts); })
      .catch(() => setMissing(true)).finally(() => setLoading(false));
  }, [username]);

  if (loading) return <section className="surface-page profile-state">Загрузка профиля…</section>;
  if (missing || !profile) return <section className="surface-page profile-state"><h1>Профиль не найден</h1><Link className="text-link" to="/">Вернуться в ленту</Link></section>;

  const joined = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(profile.createdAt));
  const lastSeen = profile.lastSeenAt ? (() => {
    const date = new Date(profile.lastSeenAt); const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
    if (minutes < 3) return 'В сети недавно';
    if (minutes < 60) return `Был(а) в сети ${minutes} мин. назад`;
    return `Был(а) в сети ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(date)}`;
  })() : 'Был(а) в сети недавно';
  const birthday = profile.birthdayMonthDay ? (() => {
    const [month, day] = profile.birthdayMonthDay.split('-').map(Number);
    const date = new Date(profile.birthdayYear ?? 2000, month - 1, day);
    const text = new Intl.DateTimeFormat('ru-RU', profile.birthdayYear ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' }).format(date);
    return `День рождения: ${text}`;
  })() : null;
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
  const transferGift = async () => {
    if (!selectedGift) return;
    const recipientUsername = window.prompt('Username получателя без @')?.trim().replace(/^@/, '').toLowerCase();
    if (!recipientUsername) return;
    await apiRequest(`/user-gifts/${selectedGift.id}/transfer`, { method: 'POST', body: JSON.stringify({ recipientUsername }) });
    setGifts((current) => current.filter((gift) => gift.id !== selectedGift.id));
    setSelectedGift(null);
    window.dispatchEvent(new Event('diamonds-changed'));
  };
  const wearGift = async () => {
    if (!selectedGift) return;
    if (selectedGift.worn) await apiRequest('/users/me/worn-gift', { method: 'DELETE' });
    else await apiRequest(`/user-gifts/${selectedGift.id}/wear`, { method: 'POST' });
    setGifts((current) => current.map((gift) => ({ ...gift, worn: gift.id === selectedGift.id ? !selectedGift.worn : false })));
    setSelectedGift({ ...selectedGift, worn: !selectedGift.worn });
  };
  const openAnalytics = async () => {
    setAnalyticsOpen((open) => !open);
    if (analytics || analyticsLoading) return;
    setAnalyticsLoading(true);
    try { setAnalytics(await apiRequest<AuthorAnalytics>('/users/me/analytics')); }
    finally { setAnalyticsLoading(false); }
  };
  return <section className="profile-page">
    <div className="profile-cover" />
    <header className="profile-header">
      {avatar ? <img className="profile-avatar profile-avatar-image" src={avatar} alt="" /> : <div className="avatar profile-avatar">{profile.displayName.slice(0, 1).toUpperCase()}</div>}
      <div className="profile-controls">{isOwner && <><Link className="secondary-button" to="/settings">Редактировать профиль</Link><button className="secondary-button" type="button" aria-expanded={analyticsOpen} onClick={() => void openAnalytics()}><BarChart3 size={17} />Аналитика</button></>}<button className="secondary-button profile-qr-trigger" type="button" onClick={() => setShowQr(true)}><QrCode size={17} />QR-код</button>{user && !isOwner && <><button className={profile.viewerFollowing ? 'secondary-button follow-button following' : 'secondary-button follow-button'} type="button" disabled={followPending} onClick={() => void toggleFollow()}>{profile.viewerFollowing ? <UserCheck size={17} /> : <UserPlus size={17} />}{followPending ? 'Подождите…' : profile.viewerFollowing ? 'Вы подписаны' : 'Подписаться'}</button><button className="secondary-button message-profile-button" type="button" disabled={openingChat} onClick={() => void openChat()}><MessageCircle size={17} />{openingChat ? 'Открываем…' : 'Написать'}</button></>}</div>
      {followError && <p className="profile-follow-error form-error" role="alert">{followError}</p>}
      <div className="profile-copy"><h1>{profile.displayName}{profile.verified && <BadgeCheck className="verified" size={21} aria-label="Подтверждённый аккаунт" />}{gifts.find((gift) => gift.worn) && <button className="profile-worn-gift-button" type="button" onClick={() => setSelectedGift(gifts.find((gift) => gift.worn) ?? null)} aria-label="Открыть надетый подарок"><img className="profile-worn-gift" src={gifts.find((gift) => gift.worn)?.image} alt="Надетый подарок" /></button>}</h1><div className="profile-identity"><p>@{profile.username}{profile.aliases.length > 0 && <><span className="profile-alias-caption">а также</span>{profile.aliases.map((alias) => <button key={alias.id} type="button" onClick={() => setSelectedAlias(alias)}>@{alias.username}</button>)}</>}</p><small className="profile-last-seen">{lastSeen}</small></div><p className="profile-bio">{profile.bio || 'Пользователь пока ничего о себе не рассказал.'}</p>{birthday && <span><CalendarDays size={16} />{birthday}</span>}<span><CalendarDays size={16} />В Tyson с {joined}</span></div>
      <div className="profile-stats"><span><strong>{posts.length}</strong> публикаций</span><span><strong>{profile.followerCount}</strong> подписчиков</span><span><strong>{profile.followingCount}</strong> подписок</span></div>
    </header>
    {isOwner && analyticsOpen && <section className="author-analytics" aria-label="Аналитика автора"><header><div><p className="eyebrow">Только для вас</p><h2><BarChart3 size={20} />Мини-аналитика</h2><p>Последние {analytics?.periodDays ?? 30} дней.</p></div></header>{analyticsLoading ? <p className="author-analytics-loading">Считаем статистику…</p> : analytics && <><div className="author-analytics-metrics"><article><strong>{analytics.reach}</strong><span>охват</span><small>уникальных аккаунтов</small></article><article><strong>{analytics.impressions}</strong><span>показов</span><small>в ленте Tyson</small></article><article><strong>{analytics.interactions}</strong><span>взаимодействий</span><small>лайки, комментарии, репосты</small></article><article><strong>+{analytics.followers}</strong><span>подписчиков</span><small>за период</small></article></div><div className="author-analytics-posts"><h3>Публикации с лучшим охватом</h3>{analytics.topPosts.length ? analytics.topPosts.map((post) => <article key={post.id}><div><strong>{post.title || post.body.slice(0, 56) || 'Публикация без текста'}</strong><small>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(post.publishedAt))}</small></div><span>{post.reach} охват · {post.impressions} показов</span><small>{post.likeCount} лайков · {post.commentCount} комментариев · {post.repostCount} репостов</small></article>) : <p>Публикаций за период пока нет.</p>}</div></>}</section>}
    <div className="profile-tabs" role="tablist" aria-label="Разделы профиля"><button className={profileTab === 'posts' ? 'active' : ''} type="button" role="tab" aria-selected={profileTab === 'posts'} onClick={() => setProfileTab('posts')}>Публикации</button><button className={profileTab === 'reposts' ? 'active' : ''} type="button" role="tab" aria-selected={profileTab === 'reposts'} onClick={() => setProfileTab('reposts')}><Repeat2 size={17} />Репосты{reposts.length > 0 && <span>{reposts.length}</span>}</button><button className={profileTab === 'gifts' ? 'active' : ''} type="button" role="tab" aria-selected={profileTab === 'gifts'} onClick={() => setProfileTab('gifts')}><Gift size={17} />Подарки{gifts.length > 0 && <span>{gifts.length}</span>}</button></div>
    {profileTab === 'posts' ? <div className="profile-posts">{posts.length ? posts.map((post) => <PostCard key={post.id} post={post} onDeleted={(postId) => setPosts((current) => current.filter((item) => item.id !== postId))} />) : <div className="empty-profile">Здесь появятся публикации пользователя.</div>}</div> : profileTab === 'reposts' ? <div className="profile-posts">{reposts.length ? reposts.map((post) => <PostCard key={post.id} post={post} onDeleted={(postId) => setReposts((current) => current.filter((item) => item.id !== postId))} />) : <div className="empty-profile">Репостов пока нет.</div>}</div> : <section className="profile-gift-gallery" aria-label="Подарки профиля">{gifts.length ? gifts.map((gift) => <button className={gift.worn ? 'profile-gift-tile worn' : 'profile-gift-tile'} style={{ '--gift-accent': gift.accentColor } as CSSProperties} type="button" onClick={() => setSelectedGift(gift)} key={gift.id}><img src={gift.image} alt={gift.title} />{gift.worn && <span>Надет</span>}</button>) : <div className="empty-profile">У пользователя пока нет подарков.</div>}</section>}
    {selectedGift && <GiftDetailsModal gift={selectedGift} owner={{ username: profile.username, displayName: profile.displayName, avatarKey: profile.avatarKey }} mine={isOwner} onUpgrade={isOwner ? upgradeGift : undefined} onTransfer={isOwner ? () => void transferGift() : undefined} onWear={isOwner ? () => void wearGift() : undefined} onVisibility={isOwner ? () => void setGiftVisibility() : undefined} onSell={isOwner ? () => void sellGift() : undefined} onExchange={isOwner ? () => void exchangeGift() : undefined} onClose={() => setSelectedGift(null)} />}
    {showQr && <ProfileQrModal username={profile.username} onClose={() => setShowQr(false)} />}
    {selectedAlias && createPortal(<div className="alias-modal-backdrop" role="presentation" onClick={() => setSelectedAlias(null)}><section className="alias-modal" role="dialog" aria-modal="true" aria-label="Коллекционный username" onClick={(event) => event.stopPropagation()}><button className="alias-modal-close" type="button" aria-label="Закрыть" onClick={() => setSelectedAlias(null)}><X /></button><span className="alias-modal-icon"><AtSign size={38} /></span><h2>@{selectedAlias.username}</h2><strong>Коллекционный username</strong><p>Принадлежит пользователю <b>{profile.displayName}</b></p><p>Имя приобретено {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(selectedAlias.createdAt))} за <b>{selectedAlias.purchasePrice} 💎</b>.</p><button className="alias-copy-button" type="button" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/profile/${selectedAlias.username}`)}><Copy size={17} />Копировать ссылку</button></section></div>, document.body)}
  </section>;
}
