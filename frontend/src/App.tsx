import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AuthPage } from './pages/AuthPage';
import { CreatePage } from './pages/CreatePage';
import { FeedPage } from './pages/FeedPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ProfilePage } from './pages/ProfilePage';

function ProductRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<FeedPage />} />
        <Route path="/profile/:username" element={<ProfilePage />} />
        <Route path="/post/:id" element={<PlaceholderPage kind="post" />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/messages" element={<PlaceholderPage kind="messages" />} />
        <Route path="/settings" element={<PlaceholderPage kind="settings" />} />
        <Route path="/company" element={<PlaceholderPage kind="company" />} />
        <Route path="/admin" element={<PlaceholderPage kind="admin" />} />
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
