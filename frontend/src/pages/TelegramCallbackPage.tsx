import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest, setAccessToken } from '../api/client';
import { useAuth, type AuthUser } from '../auth/AuthProvider';
import { Brand } from '../components/Brand';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_callback: 'Telegram вернул некорректный ответ.',
  expired_state: 'Время авторизации истекло. Попробуйте войти снова.',
  provider_failed: 'Telegram не завершил авторизацию. Попробуйте ещё раз.',
};

export function TelegramCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ticket = searchParams.get('ticket');
    const errorCode = searchParams.get('error') ?? searchParams.get('telegram_error');
    if (errorCode) {
      setError(ERROR_MESSAGES[errorCode] ?? 'Не удалось войти через Telegram.');
      return;
    }
    if (!ticket) {
      setError('Одноразовый билет Telegram отсутствует.');
      return;
    }
    let active = true;
    apiRequest<{ user: AuthUser; accessToken: string }>('/auth/telegram/exchange', {
      method: 'POST',
      body: JSON.stringify({ ticket }),
    }).then(async (session) => {
      if (!active) return;
      setAccessToken(session.accessToken);
      await refresh();
      navigate('/', { replace: true });
    }).catch((caught) => {
      if (active) setError(caught instanceof ApiError ? caught.message : 'Не удалось завершить вход через Telegram.');
    });
    return () => { active = false; };
  }, [navigate, refresh, searchParams]);

  return <main className="telegram-callback-page">
    <Brand />
    {error ? <><h1>Вход не завершён</h1><p>{error}</p><Link className="primary-button" to="/login">Вернуться ко входу</Link></> : <><LoaderCircle className="telegram-spinner" /><h1>Входим через Telegram</h1><p>Проверяем одноразовый код и создаём безопасную сессию Tyson…</p></>}
  </main>;
}
