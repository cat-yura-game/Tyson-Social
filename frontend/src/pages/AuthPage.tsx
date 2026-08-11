import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Brand } from '../components/Brand';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const registerMode = mode === 'register';
  const navigate = useNavigate();
  const { user, login, register } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        await login({ email, password });
      }
      navigate('/', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось связаться с сервером Tyson.');
    } finally {
      setPending(false);
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
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <p className="eyebrow">Добро пожаловать</p>
          <h2>{registerMode ? 'Создать аккаунт' : 'С возвращением'}</h2>
          <p>{registerMode ? 'Присоединяйтесь к Tyson — это займёт меньше минуты.' : 'Войдите, чтобы продолжить свою ленту.'}</p>
          {registerMode && <><label><span>Имя</span><div><UserRound size={18} /><input name="displayName" required maxLength={80} placeholder="Как вас называть" autoComplete="name" /></div></label><label><span>Имя пользователя</span><div><UserRound size={18} /><input name="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" placeholder="username" autoComplete="username" /></div></label></>}
          <label><span>Email</span><div><Mail size={18} /><input name="email" required type="email" maxLength={254} placeholder="name@example.com" autoComplete="email" /></div></label>
          <label><span>Пароль</span><div><LockKeyhole size={18} /><input name="password" required type="password" minLength={12} maxLength={128} placeholder="Минимум 12 символов" autoComplete={registerMode ? 'new-password' : 'current-password'} /></div></label>
          {!registerMode && <Link className="forgot-link" to="/forgot-password">Забыли пароль?</Link>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={pending}>{pending ? 'Подождите…' : registerMode ? 'Создать аккаунт' : 'Войти'}<ArrowRight size={18} /></button>
          {registerMode && <p className="verification-note">Письма пока отключены. Аккаунт будет создан со статусом «email не подтверждён».</p>}
          <p className="auth-switch">{registerMode ? 'Уже есть аккаунт?' : 'Впервые в Tyson?'} <Link to={registerMode ? '/login' : '/register'}>{registerMode ? 'Войти' : 'Зарегистрироваться'}</Link></p>
        </form>
      </section>
    </main>
  );
}
