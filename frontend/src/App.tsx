import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { AppShell } from './components/AppShell';
import { AuthPage } from './pages/AuthPage';
import { CreatePage } from './pages/CreatePage';
import { FeedPage } from './pages/FeedPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ProfilePage } from './pages/ProfilePage';
import { PostPage } from './pages/PostPage';
import { SettingsPage } from './pages/SettingsPage';

const MessagesPage = lazy(() => import('./pages/MessagesPage').then((module) => ({ default: module.MessagesPage })));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Загрузка Tyson…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function ProductRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<FeedPage />} />
        <Route path="/profile/:username" element={<ProfilePage />} />
        <Route path="/post/:id" element={<PostPage />} />
        <Route path="/create" element={<RequireAuth><CreatePage /></RequireAuth>} />
        <Route path="/messages" element={<RequireAuth><Suspense fallback={<div className="app-loading">Подготовка защищённого мессенджера…</div>}><MessagesPage /></Suspense></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/company" element={<RequireAuth><PlaceholderPage kind="company" /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><PlaceholderPage kind="admin" /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  const { pathname } = useLocation();
  if (pathname === '/login') return <AuthPage mode="login" />;
  if (pathname === '/register') return <AuthPage mode="register" />;
  if (pathname === '/forgot-password') return <AuthPage mode="login" />;
  return <ProductRoutes />;
}
