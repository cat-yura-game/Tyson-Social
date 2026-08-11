import { ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRawRequest, apiRequest, mediaUrl } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

interface Story {
  id: string;
  storageKey: string;
  mediaType: 'image' | 'video';
  createdAt: string;
  expiresAt: string;
  authorId: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  verified: number;
}

interface StoryGroup {
  authorId: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  stories: Story[];
}

const MAX_STORY_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime'];

export function StoriesBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStories = async () => {
    const result = await apiRequest<{ stories: Story[] }>('/stories');
    setStories(result.stories);
  };

  useEffect(() => { void loadStories().catch(() => setStories([])); }, []);

  const groups = useMemo(() => {
    const byAuthor = new Map<string, StoryGroup>();
    for (const story of stories) {
      const group = byAuthor.get(story.authorId);
      if (group) group.stories.push(story);
      else byAuthor.set(story.authorId, {
        authorId: story.authorId,
        username: story.username,
        displayName: story.displayName,
        avatarKey: story.avatarKey,
        stories: [story],
      });
    }
    return [...byAuthor.values()];
  }, [stories]);

  const openGroup = (authorId: string) => {
    const index = stories.findIndex((story) => story.authorId === authorId);
    if (index >= 0) setActiveIndex(index);
  };

  const chooseStory = () => {
    if (!user) { navigate('/login'); return; }
    inputRef.current?.click();
  };

  const uploadStory = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) { setError('Выберите изображение, MP4, WebM или MOV.'); return; }
    if (file.size > MAX_STORY_BYTES) { setError('Файл сторис должен быть не больше 5 МиБ.'); return; }
    setUploading(true);
    try {
      await apiRawRequest('/stories', { method: 'POST', headers: { 'content-type': file.type }, body: file });
      await loadStories();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Не удалось опубликовать сторис.');
    } finally {
      setUploading(false);
    }
  };

  const deleteStory = async (story: Story) => {
    await apiRequest(`/stories/${encodeURIComponent(story.id)}`, { method: 'DELETE' });
    setActiveIndex(null);
    await loadStories();
  };

  const activeStory = activeIndex === null ? null : stories[activeIndex];
  const move = (direction: -1 | 1) => {
    if (activeIndex === null) return;
    const next = activeIndex + direction;
    if (next < 0 || next >= stories.length) setActiveIndex(null);
    else setActiveIndex(next);
  };

  return <>
    <section className="stories-section" aria-label="Сторис">
      <div className="stories-scroll">
        <button className="story-add" type="button" onClick={chooseStory} disabled={uploading}>
          <span className="story-avatar story-avatar-add">
            {user?.avatarKey ? <img src={mediaUrl(user.avatarKey) ?? ''} alt="" /> : <span>{user?.displayName.slice(0, 1).toUpperCase() ?? <Plus size={24} />}</span>}
            <i><Plus size={14} /></i>
          </span>
          <small>{uploading ? 'Загрузка…' : 'Добавить сторис'}</small>
        </button>
        {groups.map((group) => <button className="story-person" type="button" key={group.authorId} onClick={() => openGroup(group.authorId)}>
          <span className="story-ring"><span className="story-avatar">
            {group.avatarKey ? <img src={mediaUrl(group.avatarKey) ?? ''} alt="" /> : <span>{group.displayName.slice(0, 1).toUpperCase()}</span>}
          </span></span>
          <small>{group.authorId === user?.id ? 'Ваша история' : group.displayName}</small>
        </button>)}
      </div>
      {error && <p className="stories-error" role="alert">{error}</p>}
      <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime" onChange={(event) => void uploadStory(event)} />
    </section>
    {activeStory && <div className="story-viewer" role="dialog" aria-modal="true" aria-label={`Сторис ${activeStory.displayName}`}>
      <button className="story-viewer-close" type="button" onClick={() => setActiveIndex(null)} aria-label="Закрыть"><X /></button>
      <div className="story-viewer-card">
        <header><span className="story-viewer-avatar">{activeStory.avatarKey ? <img src={mediaUrl(activeStory.avatarKey) ?? ''} alt="" /> : activeStory.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{activeStory.displayName}</strong><small>{new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(activeStory.createdAt))}</small></span>{activeStory.authorId === user?.id && <button type="button" onClick={() => void deleteStory(activeStory)} aria-label="Удалить сторис"><Trash2 size={18} /></button>}</header>
        {activeStory.mediaType === 'video'
          ? <video key={activeStory.id} src={mediaUrl(activeStory.storageKey) ?? ''} autoPlay controls playsInline />
          : <img src={mediaUrl(activeStory.storageKey) ?? ''} alt={`Сторис ${activeStory.displayName}`} />}
      </div>
      <button className="story-viewer-nav previous" type="button" onClick={() => move(-1)} aria-label="Предыдущая сторис"><ChevronLeft /></button>
      <button className="story-viewer-nav next" type="button" onClick={() => move(1)} aria-label="Следующая сторис"><ChevronRight /></button>
    </div>}
  </>;
}
