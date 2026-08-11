import { Bell, Building2, Home, LogIn, LogOut, MessageCircle, Plus, Search, Settings, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { mediaUrl } from '../api/client';
import { Brand } from './Brand';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const profilePath = user ? `/profile/${user.username}` : '/login';
  const navItems = [
    { to: '/', label: 'Главная', icon: Home, end: true },
    { to: '/messages', label: 'Сообщения', icon: MessageCircle },
    { to: '/company', label: 'Для компаний', icon: Building2 },
    { to: profilePath, label: user ? 'Профиль' : 'Войти', icon: user ? UserRound : LogIn },
    { to: '/settings', label: 'Настройки', icon: Settings },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <header className="mobile-header"><Brand /><button className="icon-button" type="button" aria-label="Уведомления"><Bell size={21} /></button></header>
      <aside className="sidebar">
        <Brand />
        <nav className="primary-nav" aria-label="Основная навигация">
          {navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={`${to}-${label}`} to={to} end={end} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}><Icon size={21} strokeWidth={1.9} /><span>{label}</span></NavLink>)}
        </nav>
        <NavLink className="create-button" to={user ? '/create' : '/login'}><Plus size={20} />Создать пост</NavLink>
        {user ? (
          <div className="sidebar-profile">
            <span className="avatar avatar-small">{user.avatarKey ? <img className="avatar-image" src={mediaUrl(user.avatarKey) ?? ''} alt="" /> : user.displayName.slice(0, 1).toUpperCase()}</span>
            <span><strong>{user.displayName}</strong><small>@{user.username}</small></span>
            <button className="icon-button logout-button" type="button" aria-label="Выйти" title="Выйти" onClick={() => void handleLogout()}><LogOut size={17} /></button>
          </div>
        ) : <NavLink className="sidebar-login" to="/login"><LogIn size={17} />Войти в Tyson</NavLink>}
      </aside>
      <main className="main-content">{children}</main>
      <aside className="right-rail">
        <label className="search-box"><Search size={18} /><input type="search" placeholder="Найти в Tyson" aria-label="Поиск в Tyson" /></label>
        <section className="rail-card"><p className="eyebrow">Сейчас обсуждают</p><a href="#topic-design"><strong>Новый городской дизайн</strong><small>1 284 публикации</small></a><a href="#topic-ai"><strong>AI без шума</strong><small>892 публикации</small></a><a href="#topic-photo"><strong>Уличная фотография</strong><small>517 публикаций</small></a></section>
        <section className="rail-card quiet-card"><p className="eyebrow">Ваши рекомендации</p><p>Лента становится точнее с каждым лайком, открытием и скрытым дизлайком.</p></section>
      </aside>
      <nav className="bottom-nav" aria-label="Мобильная навигация">
        {navItems.slice(0, 2).map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} aria-label={label} className={({ isActive }) => isActive ? 'active' : ''}><Icon /></NavLink>)}
        <NavLink className="mobile-create" to={user ? '/create' : '/login'} aria-label="Создать пост"><Plus /></NavLink>
        {navItems.slice(3, 5).map(({ to, label, icon: Icon }) => <NavLink key={`${to}-${label}`} to={to} aria-label={label} className={({ isActive }) => isActive ? 'active' : ''}><Icon /></NavLink>)}
      </nav>
    </div>
  );
}
