import { Bold, Heading2, ImagePlus, Italic, Link2, List, Pilcrow, Plus, Quote, Rocket, Send, Sparkles, Strikethrough, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
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
  const [promotionViews, setPromotionViews] = useState(0);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [coauthorUsernames, setCoauthorUsernames] = useState('');

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
      setError('Изображение должно быть не больше 10 МиБ для Telegram-аккаунтов.');
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

  const wrapSelection = (before: string, after = before, placeholder = 'текст') => {
    const field = bodyInput.current; if (!field) return;
    const start = field.selectionStart; const end = field.selectionEnd;
    const selected = body.slice(start, end) || placeholder;
    setBody(`${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`);
    window.requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + before.length, start + before.length + selected.length); });
  };

  const insertPrefix = (prefix: string) => {
    const field = bodyInput.current; if (!field) return;
    const start = field.selectionStart; const lineStart = body.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    setBody(`${body.slice(0, lineStart)}${prefix}${body.slice(lineStart)}`);
    window.requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + prefix.length, start + prefix.length); });
  };

  const insertLink = () => {
    const field = bodyInput.current; if (!field) return;
    const url = window.prompt('Введите ссылку (https://...)', 'https://');
    if (!url || !/^https?:\/\/\S+$/iu.test(url)) return;
    const start = field.selectionStart; const end = field.selectionEnd; const label = body.slice(start, end) || 'текст ссылки';
    setBody(`${body.slice(0, start)}[${label}](${url})${body.slice(end)}`);
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
      const poll = pollOpen ? { question: pollQuestion.trim(), options: pollOptions.map((value) => value.trim()).filter(Boolean) } : null;
      if (poll && (!poll.question || poll.options.length < 2)) { setError('Укажите вопрос и минимум два варианта ответа.'); setPending(false); return; }
      const request = image ? new FormData() : null;
      if (request && image) {
        request.set('title', title);
        request.set('body', body);
        request.set('image', image);
        if (poll) request.set('poll', JSON.stringify(poll));
        if (coauthorUsernames.trim()) request.set('coauthorUsernames', coauthorUsernames);
      }
      const result = await apiRequest<{ id: string; status: string }>('/posts', {
        method: 'POST',
        body: request ?? JSON.stringify({ title, body, ...(poll ? { poll } : {}), ...(coauthorUsernames.trim() ? { coauthorUsernames: coauthorUsernames.split(/[\s,]+/u) } : {}) }),
      });
      if (result.status === 'published' && promotionViews > 0) {
        try {
          await apiRequest(`/posts/${result.id}/promote`, { method: 'POST', body: JSON.stringify({ views: promotionViews }) });
          window.dispatchEvent(new Event('diamonds-changed'));
        } catch (promotionError) {
          window.alert(promotionError instanceof Error ? `Пост опубликован, но продвижение не запущено: ${promotionError.message}` : 'Пост опубликован, но продвижение не запущено.');
        }
      }
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
      <div className="formatting-toolbar" aria-label="Форматирование текста"><button type="button" onClick={() => insertPrefix('## ')} title="Заголовок"><Heading2 size={17} /><span>Заголовок</span></button><button type="button" onClick={makeBold} title="Жирный текст"><Bold size={17} /><span>Жирный</span></button><button type="button" onClick={() => wrapSelection('*', '*', 'курсив')} title="Курсив"><Italic size={17} /><span>Курсив</span></button><button type="button" onClick={() => wrapSelection('~~', '~~', 'зачёркнутый текст')} title="Зачёркнуть"><Strikethrough size={17} /></button><button type="button" onClick={insertLink} title="Добавить ссылку"><Link2 size={17} /><span>Ссылка</span></button><button type="button" onClick={() => insertPrefix('- ')} title="Список"><List size={17} /></button><button type="button" onClick={() => insertPrefix('> ')} title="Цитата"><Quote size={17} /></button><button type="button" onClick={newParagraph} title="Новый абзац"><Pilcrow size={17} /><span>Абзац</span></button><button className="ai-rewrite-trigger" type="button" onClick={() => void openRewrite()} title="Изменить стиль с AI"><Sparkles size={17} /><span>Изменить с AI</span></button></div>
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
      <section className="poll-composer">
        <button type="button" className="secondary-button" onClick={() => setPollOpen((value) => !value)}>{pollOpen ? <X size={16} /> : <Plus size={16} />}{pollOpen ? 'Убрать опрос' : 'Добавить опрос'}</button>
        {pollOpen && <div className="poll-composer-fields"><input maxLength={200} value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Вопрос" />{pollOptions.map((option, index) => <div key={index}><input maxLength={100} value={option} onChange={(event) => setPollOptions((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} placeholder={`Вариант ${index + 1}`} />{pollOptions.length > 2 && <button type="button" aria-label="Удалить вариант" onClick={() => setPollOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button>}</div>)}{pollOptions.length < 4 && <button type="button" className="poll-add-option" onClick={() => setPollOptions((current) => [...current, ''])}>+ Вариант</button>}</div>}
      </section>
      <label className="coauthor-composer"><span>Отметить соавторов</span><input maxLength={100} value={coauthorUsernames} onChange={(event) => setCoauthorUsernames(event.target.value)} placeholder="username через запятую (до 3)" /><small>Соавторы будут показаны рядом с автором публикации.</small></label>
      <div className="moderation-note"><Sparkles size={18} /><span>Перед публикацией Gemini проверит текст и изображение на спам, мошенничество и нарушения правил.</span></div>
      <label className="post-promotion-option"><span><Rocket size={19} /><span><strong>Продвинуть публикацию</strong><small>2 💎 за уникальный просмотр аккаунтом в сутки</small></span></span><select value={promotionViews} onChange={(event) => setPromotionViews(Number(event.target.value))}><option value={0}>Не продвигать</option><option value={5}>5 просмотров · 10 💎</option><option value={10}>10 просмотров · 20 💎</option><option value={25}>25 просмотров · 50 💎</option><option value={50}>50 просмотров · 100 💎</option></select></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={pending || !body.trim()} type="submit">{pending ? 'Проверяем…' : 'Опубликовать'}<Send size={18} /></button>
    </form>
  </section>;
}
