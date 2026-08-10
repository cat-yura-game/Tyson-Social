import type { FormEvent } from 'react';
import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const register = mode === 'register';
  const handleSubmit = (event: FormEvent) => event.preventDefault();

  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div><p className="eyebrow">Люди. Идеи. Компании.</p><h1>Место для того,<br />что действительно<br /><em>важно.</em></h1><p>Открывайте новое без лишнего шума и управляйте своей лентой.</p></div>
        <small>© 2026 Tyson</small>
      </section>
      <section className="auth-panel">
        <form className="auth-form" onSubmit={handleSubmit}>
          <p className="eyebrow">Добро пожаловать</p>
          <h2>{register ? 'Создать аккаунт' : 'С возвращением'}</h2>
          <p>{register ? 'Присоединяйтесь к Tyson — это займёт меньше минуты.' : 'Войдите, чтобы продолжить свою ленту.'}</p>
          {register && <label><span>Имя пользователя</span><div><UserRound size={18} /><input required minLength={3} placeholder="username" autoComplete="username" /></div></label>}
          <label><span>Email</span><div><Mail size={18} /><input required type="email" placeholder="name@example.com" autoComplete="email" /></div></label>
          <label><span>Пароль</span><div><LockKeyhole size={18} /><input required type="password" minLength={12} placeholder="Минимум 12 символов" autoComplete={register ? 'new-password' : 'current-password'} /></div></label>
          {!register && <Link className="forgot-link" to="/forgot-password">Забыли пароль?</Link>}
          <button className="primary-button" type="submit">{register ? 'Создать аккаунт' : 'Войти'}<ArrowRight size={18} /></button>
          <p className="auth-switch">{register ? 'Уже есть аккаунт?' : 'Впервые в Tyson?'} <Link to={register ? '/login' : '/register'}>{register ? 'Войти' : 'Зарегистрироваться'}</Link></p>
        </form>
      </section>
    </main>
  );
}
