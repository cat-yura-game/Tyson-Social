import { BadgeCheck, Heart, MessageCircle, MoreHorizontal, Pin, Rocket, Share2, Sparkles, ThumbsDown, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, mediaUrl } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import type { Poll, Post } from '../types/content';
import { RichPostText } from './RichPostText';
import { DiamondIcon } from './DiamondIcon';
import { WornGiftButton } from './WornGiftButton';

export function PostCard({ post, onDeleted }: { post: Post; onDeleted?: (postId: string) => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reaction, setReaction] = useState<Post['viewerReaction']>(post.viewerReaction);
  const [likes, setLikes] = useState(post.likeCount);
  const [diamondCount, setDiamondCount] = useState(post.diamondCount);
  const diamondHold = useRef<number | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [ownerMenu, setOwnerMenu] = useState(false);
  const [promoted, setPromoted] = useState(Boolean(post.promoted));
  const [pinned, setPinned] = useState(Boolean(post.pinnedAt));
  const [poll, setPoll] = useState<Poll | null>(null);
  const [pollPending, setPollPending] = useState(false);
  const time = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
  const minutes = Math.round((new Date(post.publishedAt).getTime() - Date.now()) / 60_000);
  useEffect(() => { if (post.pollId) void apiRequest<{ poll: Poll }>(`/posts/${post.id}/poll`).then(({ poll: next }) => setPoll(next)).catch(() => setPoll(null)); }, [post.id, post.pollId]);
  const vote = async (optionId: string) => { if (!user) { navigate('/login'); return; } if (pollPending) return; setPollPending(true); try { await apiRequest(`/posts/${post.id}/poll`, { method: 'PUT', body: JSON.stringify({ optionId }) }); const next = await apiRequest<{ poll: Poll }>(`/posts/${post.id}/poll`); setPoll(next.poll); } finally { setPollPending(false); } };

  const react = async (next: 'like' | 'dislike') => {
    if (!user) { navigate('/login'); return; }
    if (pending) return;
    setPending(true);
    try {
      const value = reaction === next ? null : next;
      const result = await apiRequest<{ reaction: Post['viewerReaction'] | null; likeCount: number }>(`/posts/${post.id}/reaction`, { method: 'PUT', body: JSON.stringify({ reaction: value }) });
      setReaction(result.reaction ?? '');
      setLikes(result.likeCount);
    } finally { setPending(false); }
  };

  const deletePost = async () => {
    if (deleting || !window.confirm('Удалить публикацию без возможности восстановления?')) return;
    setDeleting(true);
    try {
      await apiRequest(`/posts/${encodeURIComponent(post.id)}`, { method: 'DELETE' });
      setDeleted(true);
      if (onDeleted) onDeleted(post.id);
      else navigate('/');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось удалить публикацию.');
    } finally {
      setDeleting(false);
    }
  };

  const giveDiamond = async (amount = 1) => {
    if (!user) { navigate('/login'); return; }
    if (pending || user.id === post.authorId) return;
    if (!window.confirm(`Отправить автору ${amount} 💎? Это действие нельзя отменить.`)) return;
    setPending(true);
    try {
      const result = await apiRequest<{ diamondCount: number; balance: number }>(`/posts/${post.id}/diamond`, { method: 'POST', body: JSON.stringify({ amount }) });
      setDiamondCount(result.diamondCount);
      window.dispatchEvent(new Event('diamonds-changed'));
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Не удалось отправить алмаз.'); }
    finally { setPending(false); }
  };
  const pickDiamondAmount = () => { const amount = Number(window.prompt('Сколько алмазов отправить?', '1')); if (Number.isInteger(amount) && amount > 0) void giveDiamond(amount); };

  const promotePost = async () => {
    const views = Number(window.prompt('Сколько уникальных просмотров купить?\nСтоимость: 2 💎 за просмотр.', '10'));
    if (!Number.isInteger(views) || views < 1 || views > 500) return;
    if (!window.confirm(`Запустить продвижение на ${views} просмотров за ${views * 2} 💎?`)) return;
    try {
      await apiRequest(`/posts/${post.id}/promote`, { method: 'POST', body: JSON.stringify({ views }) });
      setPromoted(true);
      window.dispatchEvent(new Event('diamonds-changed'));
      window.alert('Продвижение запущено.');
      setOwnerMenu(false);
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Не удалось запустить продвижение.'); }
  };

  const cancelPromotion = async () => {
    if (!window.confirm('Отменить продвижение? Неиспользованные показы будут остановлены, а алмазы не возвращаются.')) return;
    try {
      await apiRequest(`/posts/${post.id}/promote`, { method: 'DELETE' });
      setPromoted(false); setOwnerMenu(false);
      window.alert('Продвижение отменено. Алмазы не возвращаются.');
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Не удалось отменить продвижение.'); }
  };

  const summarize = async () => {
    if (summary) { setSummary(null); return; }
    if (summaryLoading) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const result = await apiRequest<{ summary: string }>(`/posts/${encodeURIComponent(post.id)}/summary`, { method: 'POST' });
      setSummary(result.summary);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : 'Не удалось сократить публикацию.');
    } finally {
      setSummaryLoading(false);
    }
  };
  const togglePin = async () => { try { await apiRequest(`/posts/${post.id}/pin`, { method: 'PUT', body: JSON.stringify({ pinned: !pinned }) }); setPinned((value) => !value); setOwnerMenu(false); } catch (error) { window.alert(error instanceof Error ? error.message : 'Не удалось изменить закрепление.'); } };
  const coauthors = (() => { try { return JSON.parse(post.coauthorsJson ?? '[]') as Array<{ username: string; displayName: string }>; } catch { return []; } })();

  if (deleted) return null;

  return (
    <article className="post-card">
      <header className="post-header">
        <Link to={`/profile/${post.username}`} className="avatar">{post.avatarKey ? <img className="avatar-image" src={mediaUrl(post.avatarKey) ?? ''} alt="" /> : post.displayName.slice(0, 1).toUpperCase()}</Link>
        <div className="post-author"><span><Link to={`/profile/${post.username}`}><strong>{post.displayName}</strong>{post.verified && <BadgeCheck className="verified" size={17} aria-label="Подтверждённый аккаунт" />}</Link>{post.wornGiftImage && post.wornGiftId && <WornGiftButton giftId={post.wornGiftId} image={post.wornGiftImage} owner={{ username: post.username, displayName: post.displayName, avatarKey: post.avatarKey }} />}</span><span>@{post.username} · {Math.abs(minutes) < 60 ? time.format(minutes, 'minute') : new Date(post.publishedAt).toLocaleDateString('ru-RU')}</span></div>
        {user?.id === post.authorId
          ? <div className="post-owner-menu"><button className="icon-button" type="button" aria-label="Действия с публикацией" onClick={() => setOwnerMenu((value) => !value)}><MoreHorizontal size={20} /></button>{ownerMenu && <div className="post-owner-menu-popover"><button type="button" onClick={() => void togglePin()}><Pin size={16} />{pinned ? 'Открепить от профиля' : 'Закрепить в профиле'}</button>{promoted ? <button type="button" onClick={() => void cancelPromotion()}><Rocket size={16} />Отменить продвижение</button> : <button type="button" onClick={() => void promotePost()}><Rocket size={16} />Продвинуть</button>}<button className="danger" type="button" disabled={deleting} onClick={() => void deletePost()}><Trash2 size={16} />Удалить</button></div>}</div>
          : <button className="icon-button" type="button" aria-label="Действия с публикацией"><MoreHorizontal size={20} /></button>}
      </header>
      <div className="post-body">{pinned && <span className="pinned-label"><Pin size={12} />Закреплено в профиле</span>}{promoted && <span className="promoted-label"><Rocket size={12} />Продвигается</span>}{post.title && <Link to={`/post/${post.id}`}><h2 className="post-title">{post.title}</h2></Link>}{coauthors.length > 0 && <p className="post-coauthors">С соавторами: {coauthors.map((person, index) => <span key={person.username}>{index > 0 && ', '}<Link to={`/profile/${person.username}`}>{person.displayName}</Link></span>)}</p>}<RichPostText text={post.body} /></div>
      {post.mediaKey && <Link className="post-media" to={`/post/${post.id}`}><img loading="lazy" src={mediaUrl(post.mediaKey) ?? ''} alt="Изображение публикации" /></Link>}
      {poll && <section className="post-poll"><strong>{poll.question}</strong><div>{poll.options.map((option) => { const percent = poll.totalVotes ? Math.round(option.votes / poll.totalVotes * 100) : 0; const chosen = poll.viewerOptionId === option.id; return <button key={option.id} type="button" disabled={pollPending} className={chosen ? 'chosen' : ''} onClick={() => void vote(option.id)}><span style={{ width: poll.viewerOptionId ? `${percent}%` : '0%' }} /><b>{option.label}</b>{poll.viewerOptionId && <em>{percent}%</em>}</button>; })}</div><small>{poll.totalVotes} {poll.totalVotes === 1 ? 'голос' : 'голосов'}</small></section>}
      {summary && <aside className="post-summary"><span><Sparkles size={15} />Краткое содержание от AI</span><p>{summary}</p></aside>}
      {summaryError && <p className="post-summary-error" role="alert">{summaryError}</p>}
      <footer className="post-actions">
        <button className={reaction === 'like' ? 'reaction-active' : ''} disabled={pending} type="button" aria-label="Нравится" onClick={() => void react('like')}><Heart size={19} /><span>{likes}</span></button>
        <button className={reaction === 'dislike' ? 'reaction-active' : ''} disabled={pending} type="button" aria-label="Не показывать похожее" onClick={() => void react('dislike')}><ThumbsDown size={19} /></button>
        <button className="diamond-reaction" disabled={pending || user?.id === post.authorId} type="button" aria-label="Отправить алмазы автору; удерживайте для выбора суммы" onPointerDown={() => { diamondHold.current = window.setTimeout(() => { diamondHold.current = null; pickDiamondAmount(); }, 550); }} onPointerUp={() => { if (diamondHold.current) { window.clearTimeout(diamondHold.current); diamondHold.current = null; void giveDiamond(); } }} onPointerCancel={() => { if (diamondHold.current) window.clearTimeout(diamondHold.current); diamondHold.current = null; }}><DiamondIcon size={19} /><span>{diamondCount}</span></button>
        <Link to={`/post/${post.id}`} aria-label={`${post.commentCount} комментариев`}><MessageCircle size={19} /><span>{post.commentCount}</span></Link>
        <button type="button" aria-label="Отправить публикацию в Messenger" onClick={() => navigate(user ? `/messages?sharePost=${post.id}` : '/login')}><Share2 size={19} /></button>
        {post.body.length > 500 && <button className="ai-action" type="button" disabled={summaryLoading} onClick={() => void summarize()}><Sparkles size={17} /><span>{summaryLoading ? 'Сокращаем…' : summary ? 'Скрыть краткое' : 'Коротко с AI'}</span></button>}
      </footer>
    </article>
  );
}
