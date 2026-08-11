import { ImagePlus, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const POST_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function CreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const imageInput = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!image) { setPreview(null); return; }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setError(null);
    if (!selected) { setImage(null); return; }
    if (!POST_IMAGE_TYPES.has(selected.type)) {
      setError('Поддерживаются изображения JPEG, PNG и WebP.');
      event.target.value = '';
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setError('Изображение должно быть не больше 5 МиБ.');
      event.target.value = '';
      return;
    }
    setImage(selected);
  };

  const removeImage = () => {
    setImage(null);
    if (imageInput.current) imageInput.current.value = '';
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const request = image ? new FormData() : null;
      if (request && image) {
        request.set('body', body);
        request.set('image', image);
      }
      const result = await apiRequest<{ id: string; status: string }>('/posts', {
        method: 'POST',
        body: request ?? JSON.stringify({ body }),
      });
      navigate(result.status === 'published' ? `/post/${result.id}` : '/');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось опубликовать пост.');
    } finally {
      setPending(false);
    }
  };

  return <section className="surface-page narrow-page">
    <header className="page-heading"><div><p className="eyebrow">Новая публикация</p><h1>Поделитесь идеей</h1></div></header>
    <form className="composer-card" onSubmit={(event) => void submit(event)}>
      <div className="composer-author"><span className="avatar avatar-small">{user?.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{user?.displayName}</strong><small>Публикация от вашего имени</small></span></div>
      <textarea required minLength={1} maxLength={10000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="О чём вы думаете?" aria-label="Текст публикации" />
      {preview && <div className="composer-image-preview"><img src={preview} alt="Выбранное изображение публикации" /><button type="button" aria-label="Убрать изображение" onClick={removeImage}><X size={18} /></button></div>}
      <div className="composer-tools">
        <button type="button" onClick={() => imageInput.current?.click()}><ImagePlus size={17} />{image ? 'Заменить картинку' : 'Добавить картинку'}</button>
        <input ref={imageInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} />
        <span>{body.length} / 10 000</span>
      </div>
      <div className="moderation-note"><Sparkles size={18} /><span>Перед публикацией Gemini проверит текст и изображение на спам, мошенничество и нарушения правил.</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={pending || !body.trim()} type="submit">{pending ? 'Проверяем…' : 'Опубликовать'}<Send size={18} /></button>
    </form>
  </section>;
}
