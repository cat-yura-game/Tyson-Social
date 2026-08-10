import {
  Bell,
  Building2,
  Home,
  MessageCircle,
  Plus,
  Search,
  Settings,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Brand } from './Brand';

const navItems = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/messages', label: 'Сообщения', icon: MessageCircle },
  { to: '/company', label: 'Для компаний', icon: Building2 },
  { to: '/profile/nikita', label: 'Профиль', icon: UserRound },
  { to: '/settings', label: 'Настройки', icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="mobile-header">
        <Brand />
        <button className="icon-button" type="button" aria-label="Уведомления"><Bell size={21} /></button>
      </header>

      <aside className="sidebar">
        <Brand />
        <nav className="primary-nav" aria-label="Основная навигация">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Icon size={21} strokeWidth={1.9} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink className="create-button" to="/create"><Plus size={20} />Создать пост</NavLink>
        <div className="sidebar-profile">
          <span className="avatar avatar-small">Н</span>
          <span><strong>Никита Орлов</strong><small>@nikita</small></span>
          <span className="status-dot" title="В сети" />
        </div>
      </aside>

      <main className="main-content">{children}</main>

      <aside className="right-rail">
        <label className="search-box">
          <Search size={18} />
          <input type="search" placeholder="Найти в Tyson" aria-label="Поиск в Tyson" />
        </label>
        <section className="rail-card">
          <p className="eyebrow">Сейчас обсуждают</p>
          <a href="#topic-design"><strong>Новый городской дизайн</strong><small>1 284 публикации</small></a>
          <a href="#topic-ai"><strong>AI без шума</strong><small>892 публикации</small></a>
          <a href="#topic-photo"><strong>Уличная фотография</strong><small>517 публикаций</small></a>
        </section>
        <section className="rail-card quiet-card">
          <p className="eyebrow">Ваши рекомендации</p>
          <p>Лента становится точнее с каждым лайком, открытием и скрытым дизлайком.</p>
        </section>
      </aside>

      <nav className="bottom-nav" aria-label="Мобильная навигация">
        {navItems.slice(0, 2).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} aria-label={label} className={({ isActive }) => isActive ? 'active' : ''}><Icon /></NavLink>
        ))}
        <NavLink className="mobile-create" to="/create" aria-label="Создать пост"><Plus /></NavLink>
        {navItems.slice(3, 5).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} aria-label={label} className={({ isActive }) => isActive ? 'active' : ''}><Icon /></NavLink>
        ))}
      </nav>
    </div>
  );
}
