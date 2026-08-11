import { Send, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

export function CreatePage() {
  const { user } = useAuth(); const navigate = useNavigate();
  const [body, setBody] = useState(''); const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); setPending(true); setError(null); try { const result = await apiRequest<{ id: string; status: string }>('/posts', { method: 'POST', body: JSON.stringify({ body }) }); navigate(result.status === 'published' ? `/post/${result.id}` : '/'); } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось опубликовать пост.'); } finally { setPending(false); } };
  return <section className="surface-page narrow-page"><header className="page-heading"><div><p className="eyebrow">Новая публикация</p><h1>Поделитесь идеей</h1></div></header><form className="composer-card" onSubmit={(event) => void submit(event)}><div className="composer-author"><span className="avatar avatar-small">{user?.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{user?.displayName}</strong><small>Публикация от вашего имени</small></span></div><textarea required minLength={1} maxLength={10000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="О чём вы думаете?" aria-label="Текст публикации" /><div className="composer-tools"><span>Текстовый пост</span><span>{body.length} / 10 000</span></div><div className="moderation-note"><Sparkles size={18} /><span>Перед публикацией Gemini проверит публичный контент на спам, мошенничество и нарушения правил.</span></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={pending || !body.trim()} type="submit">{pending ? 'Проверяем…' : 'Опубликовать'}<Send size={18} /></button></form></section>;
}
