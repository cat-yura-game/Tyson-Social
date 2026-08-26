import { useEffect, useRef, useState } from 'react';
import { Heart, ThumbsDown, Volume2, VolumeX } from 'lucide-react';
import { apiRawRequest, apiRequest, mediaUrl } from '../api/client';

type ShortVideo = {
  id: string; storageKey: string; caption: string; likeCount: number; viewCount: number;
  username: string; displayName: string; avatarKey: string | null; verified: number;
  viewerReaction: '' | 'like' | 'dislike'; repeated?: boolean;
};

export function ShortsPage() {
  const [videos, setVideos] = useState<ShortVideo[]>([]);
  const [muted, setMuted] = useState(true);
  const seen = useRef(new Set<string>());
  useEffect(() => { void apiRequest<{ videos: ShortVideo[] }>('/shorts/feed').then(({ videos: items }) => setVideos(items)); }, []);
  const countView = (id: string) => { if (!seen.current.has(id)) { seen.current.add(id); void apiRawRequest(`/shorts/${id}/view`, { method: 'POST' }); } };
  return <section className="shorts-page" aria-label="Tyson Shorts beta">
    <header className="shorts-header"><span>Tyson Shorts</span><small>Beta</small></header>
    {!videos.length ? <div className="empty-state"><h1>Tyson Shorts</h1><p>Пока здесь нет видео. Скоро можно будет загрузить первый ролик.</p></div> : <div className="shorts-feed">
      {videos.map((video, index) => <article className="short-video" key={`${video.id}-${index}`}>
        <video src={mediaUrl(video.storageKey) ?? ''} playsInline muted={muted} loop controls={false} preload="metadata" onPlay={() => countView(video.id)} />
        <div className="short-gradient" />
        <div className="short-info"><strong>{video.displayName}{video.verified === 1 && ' ✓'}</strong><small>@{video.username}{video.repeated && ' · повтор для beta-ленты'}</small>{video.caption && <p>{video.caption}</p>}</div>
        <div className="short-actions"><button type="button" aria-label="Лайк"><Heart /> <span>{video.likeCount}</span></button><button type="button" aria-label="Не интересно"><ThumbsDown /></button><button type="button" aria-label={muted ? 'Включить звук' : 'Выключить звук'} onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX /> : <Volume2 />}</button></div>
      </article>)}
    </div>}</section>;
}
