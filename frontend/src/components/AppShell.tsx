import { Bell, Home, LogIn, LogOut, MessageCircle, Plus, Search, Settings, Sparkles, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { mediaUrl } from '../api/client';
import { Brand } from './Brand';
import { TrendsCard } from './TrendsCard';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const mobileImmersive = location.pathname === '/ai' || location.pathname === '/messages';
  const profilePath = user ? `/profile/${user.username}` : '/login';
  const navItems = [
    { to: '/', label: 'Главная', icon: Home, end: true },
    { to: '/messages', label: 'Сообщения', icon: MessageCircle },
    { to: '/ai', label: 'AI', icon: Sparkles },
    { to: profilePath, label: user ? 'Профиль' : 'Войти', icon: user ? UserRound : LogIn },
    { to: '/settings', label: 'Настройки', icon: Settings },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className={mobileImmersive ? 'app-shell mobile-immersive' : 'app-shell'}>
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
        <TrendsCard />
        <section className="rail-card quiet-card"><p className="eyebrow">Ваши рекомендации</p><p>Лента становится точнее с каждым лайком, открытием и скрытым дизлайком.</p></section>
      </aside>
      <nav className="bottom-nav" aria-label="Мобильная навигация">
        {[
          { to: '/', label: 'Главная', icon: Home, end: true },
          { to: '/messages', label: 'Сообщения', icon: MessageCircle },
          { to: user ? '/create' : '/login', label: 'Создать', icon: Plus },
          { to: '/ai', label: 'AI', icon: Sparkles },
          { to: profilePath, label: user ? 'Профиль' : 'Войти', icon: user ? UserRound : LogIn },
        ].map(({ to, label, icon: Icon, end }) => <NavLink key={`${to}-${label}`} to={to} end={end} aria-label={label} className={({ isActive }) => isActive ? 'active' : ''}><Icon className="mobile-nav-icon" /><span>{label}</span></NavLink>)}
      </nav>
    </div>
  );
}
