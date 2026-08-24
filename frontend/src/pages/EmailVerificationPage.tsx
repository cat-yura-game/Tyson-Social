import { useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, Mail, Sparkles } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Brand } from '../components/Brand';

export function EmailVerificationPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!user) return <Navigate to="/login" replace />;
  if (user.emailVerified) return <Navigate to="/" replace />;

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setPending(true); setMessage(null);
    try {
      await apiRequest('/auth/email/verify', { method: 'POST', body: JSON.stringify({ code }) });
      await refresh(); navigate('/', { replace: true });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Не удалось подтвердить почту.');
    } finally { setPending(false); }
  };

  const resend = async () => {
    setPending(true); setMessage(null);
    try { await apiRequest('/auth/email/resend', { method: 'POST' }); setMessage('Новый код отправлен.'); }
    catch (error) { setMessage(error instanceof ApiError ? error.message : 'Не удалось отправить новый код.'); }
    finally { setPending(false); }
  };

  return <main className="auth-page verification-page"><section className="auth-story"><Brand /><div><p className="eyebrow">Безопасность аккаунта</p><h1>Подтвердите<br /><em>почту.</em></h1></div><small>© 2026 Tyson</small></section><section className="auth-panel"><form className="auth-form verification-form" onSubmit={(event) => void verify(event)}><div className="verification-hero"><span className="verification-hero-icon"><Mail size={27} /></span><span className="verification-sparkle"><Sparkles size={15} /></span></div><p className="eyebrow">Почти готово</p><h2>Введите код</h2><p>Мы отправили шестизначный код на этот адрес.</p><div className="verification-email" title={user.email}><span className="verification-email-mark">T</span><span>{user.email}</span></div><label><span>Код из письма</span><div className="verification-code-input"><CheckCircle2 size={18} /><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000 000" aria-label="Шестизначный код из письма" required autoFocus /></div></label>{message && <p className={message === 'Новый код отправлен.' ? 'verification-success' : 'form-error'} role="alert">{message}</p>}<button className="primary-button" type="submit" disabled={pending || code.length !== 6}>{pending ? 'Проверяем…' : 'Подтвердить почту'}</button><button className="verification-resend" type="button" disabled={pending} onClick={() => void resend()}><ArrowLeft size={15} />Отправить код ещё раз</button><small className="verification-help">Письмо может прийти в течение пары минут. Проверьте папку «Спам».</small></form></section></main>;
}
