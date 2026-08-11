import { Bold, ImagePlus, Pilcrow, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const POST_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const REWRITE_STYLES = [
  { id: 'business', label: 'Деловой' },
  { id: 'corporate', label: 'Корпоративный' },
  { id: 'professional', label: 'Профессиональный' },
  { id: 'friendly', label: 'Дружелюбный' },
  { id: 'concise', label: 'Краткий' },
  { id: 'persuasive', label: 'Убедительный' },
  { id: 'expert', label: 'Экспертный' },
  { id: 'storytelling', label: 'Сторителлинг' },
  { id: 'energetic', label: 'Энергичный' },
  { id: 'neutral', label: 'Нейтральный' },
] as const;
type RewriteStyle = typeof REWRITE_STYLES[number]['id'];

export function CreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const imageInput = useRef<HTMLInputElement>(null);
  const bodyInput = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteStyle, setRewriteStyle] = useState<RewriteStyle>('friendly');
  const [customInstruction, setCustomInstruction] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [rewriteResult, setRewriteResult] = useState<{ title: string; body: string } | null>(null);
  const [rewriteRemaining, setRewriteRemaining] = useState<number | null>(null);

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

  const makeBold = () => {
    const field = bodyInput.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = body.slice(start, end) || 'жирный текст';
    const next = `${body.slice(0, start)}**${selected}**${body.slice(end)}`;
    setBody(next);
    window.requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + 2, start + 2 + selected.length);
    });
  };

  const newParagraph = () => {
    const field = bodyInput.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    setBody(`${body.slice(0, start)}\n\n${body.slice(end)}`);
    window.requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + 2, start + 2); });
  };

  const openRewrite = async () => {
    setRewriteOpen((open) => !open);
    setRewriteResult(null);
    if (rewriteRemaining === null) {
      try {
        const quota = await apiRequest<{ remaining: number }>('/ai/quota');
        setRewriteRemaining(quota.remaining);
      } catch { setRewriteRemaining(null); }
    }
  };

  const rewritePost = async () => {
    if (!body.trim() || rewriting) return;
    setRewriting(true); setError(null); setRewriteResult(null);
    try {
      const result = await apiRequest<{ title: string; body: string; quota: { remaining: number } }>('/ai/rewrite-post', {
        method: 'POST',
        body: JSON.stringify({ title, body, style: rewriteStyle, customInstruction: customInstruction.trim() }),
      });
      setRewriteResult({ title: result.title, body: result.body });
      setRewriteRemaining(result.quota.remaining);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось переписать пост с AI.');
    } finally { setRewriting(false); }
  };

  const applyRewrite = () => {
    if (!rewriteResult) return;
    setTitle(rewriteResult.title);
    setBody(rewriteResult.body);
    setRewriteResult(null);
    setRewriteOpen(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const request = image ? new FormData() : null;
      if (request && image) {
        request.set('title', title);
        request.set('body', body);
        request.set('image', image);
      }
      const result = await apiRequest<{ id: string; status: string }>('/posts', {
        method: 'POST',
        body: request ?? JSON.stringify({ title, body }),
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
      <input className="composer-title-input" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Заголовок (необязательно)" aria-label="Заголовок публикации" />
      <div className="formatting-toolbar" aria-label="Форматирование текста"><button type="button" onClick={makeBold} title="Жирный текст"><Bold size={17} /><span>Жирный</span></button><button type="button" onClick={newParagraph} title="Новый абзац"><Pilcrow size={17} /><span>Новый абзац</span></button><button className="ai-rewrite-trigger" type="button" onClick={() => void openRewrite()} title="Изменить стиль с AI"><Sparkles size={17} /><span>Изменить с AI</span></button></div>
      <textarea ref={bodyInput} required minLength={1} maxLength={10000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="О чём вы думаете? Нажмите Enter для новой строки." aria-label="Текст публикации" />
      {rewriteOpen && <section className="ai-rewrite-panel">
        <header><div><strong>Изменить пост с AI</strong><small>Выберите стиль или дополните его своей инструкцией</small></div><span>{rewriteRemaining === null ? 'Загрузка лимита…' : `Осталось запросов: ${rewriteRemaining}`}</span></header>
        <div className="rewrite-style-options">{REWRITE_STYLES.map((style) => <button className={rewriteStyle === style.id ? 'selected' : ''} type="button" key={style.id} onClick={() => setRewriteStyle(style.id)}>{style.label}</button>)}</div>
        <label className="custom-rewrite-instruction"><span>Своя инструкция</span><textarea maxLength={500} rows={2} value={customInstruction} onChange={(event) => setCustomInstruction(event.target.value)} placeholder="Например: сделай текст понятным для начинающих и сохрани шутку в конце" /></label>
        {!rewriteResult && <button className="secondary-button rewrite-generate" type="button" disabled={rewriting || !body.trim() || rewriteRemaining === 0} onClick={() => void rewritePost()}><Sparkles size={17} />{rewriting ? 'Переписываем…' : 'Создать вариант'}</button>}
        {rewriteResult && <div className="rewrite-result"><span>Предложенный вариант</span>{rewriteResult.title && <h3>{rewriteResult.title}</h3>}<p>{rewriteResult.body}</p><footer><button className="secondary-button" type="button" onClick={() => setRewriteResult(null)}>Попробовать ещё</button><button className="primary-button" type="button" onClick={applyRewrite}>Применить к посту</button></footer></div>}
      </section>}
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
