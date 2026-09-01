import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, Mail, Send, UserRound } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { useAuth, type AuthUser } from '../auth/AuthProvider';
import { Brand } from '../components/Brand';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const registerMode = mode === 'register';
  const navigate = useNavigate();
  const { user, login, register } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telegramPending, setTelegramPending] = useState(false);
  const [challenge, setChallenge] = useState<{ id: string; token: string; method: 'telegram'|'email'|'both' } | null>(null);
  const [challengeCode, setChallengeCode] = useState('');
  const [challengeError, setChallengeError] = useState<string | null>(null);
  useEffect(() => { if (!challenge) return; const timer = window.setInterval(() => { void apiRequest<{ status: string; user?: AuthUser; accessToken?: string }>(`/auth/login/challenges/${challenge.id}`, { headers: { 'x-login-approval-token': challenge.token } }).then((result) => { if (result.status === 'approved' && result.user && result.accessToken) { window.localStorage.setItem('tyson_access_token', result.accessToken); window.location.assign('/'); } if (result.status === 'denied') { setChallengeError('Вход отклонён в Telegram.'); setChallenge(null); } }).catch(() => undefined); }, 2500); return () => window.clearInterval(timer); }, [challenge]);
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const email = String(form.get('email') ?? '');
      const password = String(form.get('password') ?? '');
      if (registerMode) {
        await register({ email, password, username: String(form.get('username') ?? ''), displayName: String(form.get('displayName') ?? '') });
      } else {
        const result = await login({ email, password });
        if (result.requiresApproval && result.challengeId && result.approvalToken && result.method) { setChallenge({ id: result.challengeId, token: result.approvalToken, method: result.method }); return; }
      }
      navigate(registerMode ? '/verify-email' : '/', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось связаться с сервером Tyson.');
    } finally {
      setPending(false);
    }
  };

  const approveByEmail = async () => { if (!challenge) return; setChallengeError(null); try { await apiRequest(`/auth/login/approve`, { method: 'POST', body: JSON.stringify({ challengeId: challenge.id, approvalToken: challenge.token, code: challengeCode }) }); } catch (caught) { setChallengeError(caught instanceof ApiError ? caught.message : 'Не удалось подтвердить вход.'); } };

  const loginWithTelegram = async () => {
    setTelegramPending(true); setError(null);
    try {
      const result = await apiRequest<{ authorizationUrl: string }>('/auth/telegram/start', {
        method: 'POST', body: JSON.stringify({ action: 'login' }),
      });
      window.location.assign(result.authorizationUrl);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось открыть вход через Telegram.');
      setTelegramPending(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div><p className="eyebrow">Люди. Идеи. Компании.</p><h1>Место для того,<br />что действительно<br /><em>важно.</em></h1><p>Открывайте новое без лишнего шума и управляйте своей лентой.</p></div>
        <small>© 2026 Tyson</small>
      </section>
      <section className="auth-panel">
        {challenge && <div className="auth-approval-card"><h2>Подтвердите вход</h2><p>{challenge.method === 'telegram' ? 'Откройте Telegram и нажмите «Разрешить» в сообщении от Tyson.' : challenge.method === 'both' ? 'Подтвердите вход в Telegram и введите код из письма.' : 'Введите код из письма, чтобы продолжить.'}</p>{challenge.method !== 'telegram' && <><input className="auth-approval-code" value={challengeCode} onChange={(event) => setChallengeCode(event.target.value.replace(/\D/gu, '').slice(0, 6))} inputMode="numeric" placeholder="000000" /><button className="primary-button" type="button" onClick={() => void approveByEmail()}>Подтвердить</button></>}{challengeError && <p className="form-error">{challengeError}</p>}<button className="text-button" type="button" onClick={() => setChallenge(null)}>Отмена</button></div>}
        <form className={`auth-form${challenge ? ' auth-form-hidden' : ''}`} onSubmit={(event) => void handleSubmit(event)}>
          <p className="eyebrow">Добро пожаловать</p>
          <h2>{registerMode ? 'Создать аккаунт' : 'С возвращением'}</h2>
          <p>{registerMode ? 'Присоединяйтесь к Tyson — это займёт меньше минуты.' : 'Войдите, чтобы продолжить свою ленту.'}</p>
          {registerMode && <><label><span>Имя</span><div><UserRound size={18} /><input name="displayName" required maxLength={80} placeholder="Как вас называть" autoComplete="name" /></div></label><label><span>Имя пользователя</span><div><UserRound size={18} /><input name="username" required minLength={3} maxLength={30} pattern="[A-Za-z](?:[A-Za-z0-9]|_[A-Za-z0-9])*" title="Начните с буквы. Нельзя использовать несколько подчёркиваний подряд или подчёркивание в конце." placeholder="username" autoComplete="username" /></div></label></>}
          <label><span>Email</span><div><Mail size={18} /><input name="email" required type="email" maxLength={254} placeholder="name@example.com" autoComplete="email" /></div></label>
          <label><span>Пароль</span><div><LockKeyhole size={18} /><input name="password" required type="password" minLength={12} maxLength={128} placeholder="Минимум 12 символов" autoComplete={registerMode ? 'new-password' : 'current-password'} /></div></label>
          {!registerMode && <Link className="forgot-link" to="/forgot-password">Забыли пароль?</Link>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={pending}>{pending ? 'Подождите…' : registerMode ? 'Создать аккаунт' : 'Войти'}<ArrowRight size={18} /></button>
          <div className="auth-separator"><span>или</span></div><button className="telegram-login-button" type="button" disabled={telegramPending} onClick={() => void loginWithTelegram()}><Send size={18} />{telegramPending ? 'Открываем Telegram…' : registerMode ? 'Зарегистрироваться через Telegram' : 'Войти через Telegram'}</button>
          {registerMode && <p className="verification-note">Telegram передаст Tyson ваше отображаемое имя и username. Пароль и доступ к сообщениям Telegram не передаются.</p>}
          <p className="auth-switch">{registerMode ? 'Уже есть аккаунт?' : 'Впервые в Tyson?'} <Link to={registerMode ? '/login' : '/register'}>{registerMode ? 'Войти' : 'Зарегистрироваться'}</Link></p>
        </form>
      </section>
    </main>
  );
}
