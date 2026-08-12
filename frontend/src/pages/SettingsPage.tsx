import { BadgeCheck, Camera, Monitor, Moon, Save, Send, Sun, Unlink, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest, mediaUrl } from '../api/client';
import { useAuth, type AuthUser } from '../auth/AuthProvider';
import { cropAvatarToSquare } from '../images/crop-square';
import { getThemePreference, setThemePreference, type ThemePreference } from '../theme';

export function SettingsPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [telegramPending, setTelegramPending] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference());
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<{ linked: boolean; identity: { displayName: string | null; username: string | null; linkedAt: string } | null } | null>(null);
  const [verifiedAccounts, setVerifiedAccounts] = useState<{ canCreate: boolean; accounts: { id: string; username: string; displayName: string }[] } | null>(null);
  const [linkedAccount, setLinkedAccount] = useState({ email: '', username: '', displayName: '', password: '' });
  const [linkedAccountPending, setLinkedAccountPending] = useState(false);
  const [linkedAccountError, setLinkedAccountError] = useState<string | null>(null);
  const telegramResult = searchParams.get('telegram');
  const telegramCallbackError = searchParams.get('telegram_error');

  useEffect(() => {
    let active = true;
    apiRequest<{ linked: boolean; identity: { displayName: string | null; username: string | null; linkedAt: string } | null }>('/auth/telegram/status')
      .then(async (status) => {
        if (!active) return;
        setTelegramStatus(status);
        if (telegramResult === 'linked') await refresh();
      })
      .catch((caught) => { if (active) setTelegramError(caught instanceof ApiError ? caught.message : 'Не удалось проверить подключение Telegram.'); });
    if (telegramCallbackError) setTelegramError(telegramCallbackError === 'already_used' ? 'Этот Telegram уже подключён к другому аккаунту.' : 'Не удалось подключить Telegram. Попробуйте снова.');
    return () => { active = false; };
  }, [refresh, telegramCallbackError, telegramResult]);

  const loadVerifiedAccounts = async () => {
    const result = await apiRequest<{ canCreate: boolean; accounts: { id: string; username: string; displayName: string }[] }>('/users/me/verified-accounts');
    setVerifiedAccounts(result);
  };

  useEffect(() => { if (user?.verified) void loadVerifiedAccounts().catch(() => setVerifiedAccounts(null)); }, [user?.verified]);

  if (!user) return null;

  const save = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setError(null); setMessage(null);
    const nextUsername = username.trim().toLowerCase();
    try {
      const input: { displayName: string; bio: string; username?: string } = { displayName, bio };
      if (nextUsername !== user.username) input.username = nextUsername;
      const result = await apiRequest<{ user: AuthUser }>('/users/me', { method: 'PATCH', body: JSON.stringify(input) });
      await refresh();
      setMessage('Профиль сохранён.');
      if (result.user.username !== user.username) navigate(`/profile/${result.user.username}`);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить профиль.'); }
    finally { setPending(false); }
  };

  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return;
    setPending(true); setError(null); setMessage(null);
    try {
      const squareAvatar = await cropAvatarToSquare(file);
      await apiRequest('/users/me/avatar', { method: 'POST', headers: { 'content-type': squareAvatar.type }, body: squareAvatar });
      await refresh(); setMessage('Фотография профиля обновлена.');
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить фотографию.'); }
    finally { setPending(false); }
  };

  const avatar = mediaUrl(user.avatarKey);

  const chooseTheme = (preference: ThemePreference) => {
    setTheme(preference);
    setThemePreference(preference);
  };

  const connectTelegram = async () => {
    setTelegramPending(true); setTelegramError(null);
    try {
      const result = await apiRequest<{ authorizationUrl: string }>('/auth/telegram/start', {
        method: 'POST', body: JSON.stringify({ action: 'link' }),
      });
      window.location.assign(result.authorizationUrl);
    } catch (caught) {
      setTelegramError(caught instanceof ApiError ? caught.message : 'Не удалось открыть Telegram.');
      setTelegramPending(false);
    }
  };

  const disconnectTelegram = async () => {
    setTelegramPending(true); setTelegramError(null);
    try {
      await apiRequest('/auth/telegram/link', { method: 'DELETE' });
      setTelegramStatus({ linked: false, identity: null });
    } catch (caught) {
      setTelegramError(caught instanceof ApiError ? caught.message : 'Не удалось отключить Telegram.');
    } finally {
      setTelegramPending(false);
    }
  };

  const createLinkedAccount = async (event: FormEvent) => {
    event.preventDefault();
    setLinkedAccountPending(true); setLinkedAccountError(null);
    try {
      await apiRequest('/users/me/verified-accounts', { method: 'POST', body: JSON.stringify(linkedAccount) });
      setLinkedAccount({ email: '', username: '', displayName: '', password: '' });
      await loadVerifiedAccounts();
      setMessage('Подтверждённый дополнительный аккаунт создан. В него можно войти по указанным email и паролю.');
    } catch (caught) { setLinkedAccountError(caught instanceof ApiError ? caught.message : 'Не удалось создать дополнительный аккаунт.'); }
    finally { setLinkedAccountPending(false); }
  };

  return <section className="surface-page narrow-page settings-page">
    <header className="page-heading"><div><p className="eyebrow">Ваш аккаунт</p><h1>Настройки профиля</h1></div></header>
    <section className="theme-settings" aria-labelledby="theme-settings-title"><div><p className="eyebrow">Оформление</p><h2 id="theme-settings-title">Тема Tyson</h2></div><div className="theme-options" role="radiogroup" aria-label="Тема интерфейса"><button type="button" role="radio" aria-checked={theme === 'system'} className={theme === 'system' ? 'selected' : ''} onClick={() => chooseTheme('system')}><Monitor size={18} />Как в системе</button><button type="button" role="radio" aria-checked={theme === 'light'} className={theme === 'light' ? 'selected' : ''} onClick={() => chooseTheme('light')}><Sun size={18} />Светлая</button><button type="button" role="radio" aria-checked={theme === 'dark'} className={theme === 'dark' ? 'selected' : ''} onClick={() => chooseTheme('dark')}><Moon size={18} />Тёмная</button></div></section>
    <div className="avatar-editor">{avatar ? <img src={avatar} alt="Фотография профиля" /> : <span className="avatar profile-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>}<label className="secondary-button"><Camera size={17} />Изменить фото<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(event) => void uploadAvatar(event.target.files?.[0])} /></label></div>
    <form className="settings-form" onSubmit={(event) => void save(event)}>
      <label><span>Отображаемое имя</span><input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label><span>Имя пользователя</span><input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" disabled={!user.usernameChangeAvailable} value={username} onChange={(event) => setUsername(event.target.value)} /><small>{user.usernameChangeAvailable ? 'После регистрации username можно изменить только один раз.' : 'Вы уже использовали единственную смену username.'}</small></label>
      <label><span>О себе</span><textarea maxLength={500} value={bio} onChange={(event) => setBio(event.target.value)} /><small>{bio.length} / 500</small></label>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success">{message}</p>}
      <button className="primary-button" disabled={pending} type="submit"><Save size={17} />{pending ? 'Сохраняем…' : 'Сохранить'}</button>
    </form>
    <section className="telegram-settings" aria-labelledby="telegram-settings-title">
      <div className="telegram-settings-copy"><span className="telegram-mark"><Send size={20} /></span><div><h2 id="telegram-settings-title">Telegram</h2><p>{telegramStatus?.linked ? 'Telegram подтверждает аккаунт и доступен для следующего входа.' : 'Подключите Telegram вместо подтверждения кодом по email.'}</p>{telegramStatus?.identity && <small>{telegramStatus.identity.username ? `@${telegramStatus.identity.username}` : telegramStatus.identity.displayName ?? 'Telegram подключён'}</small>}</div></div>
      {telegramStatus?.linked ? <button className="secondary-button" type="button" disabled={telegramPending} onClick={() => void disconnectTelegram()}><Unlink size={16} />Отключить</button> : <button className="telegram-connect-button" type="button" disabled={telegramPending || telegramStatus === null} onClick={() => void connectTelegram()}><Send size={16} />{telegramPending ? 'Открываем…' : 'Подключить'}</button>}
      {telegramResult === 'linked' && <p className="form-success">Telegram успешно подключён.</p>}
      {telegramError && <p className="form-error" role="alert">{telegramError}</p>}
    </section>
    {verifiedAccounts?.canCreate && <section className="linked-accounts-settings" aria-labelledby="linked-accounts-title">
      <div><p className="eyebrow">Подтверждённый аккаунт</p><h2 id="linked-accounts-title"><BadgeCheck size={18} />Дополнительные аккаунты</h2><p>Созданные здесь профили получат галочку и отдельные данные для входа. Создать можно до 10 аккаунтов.</p></div>
      <form className="linked-account-form" onSubmit={(event) => void createLinkedAccount(event)}>
        <input required type="email" placeholder="Email нового аккаунта" value={linkedAccount.email} onChange={(event) => setLinkedAccount({ ...linkedAccount, email: event.target.value })} />
        <input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" placeholder="Username" value={linkedAccount.username} onChange={(event) => setLinkedAccount({ ...linkedAccount, username: event.target.value })} />
        <input required maxLength={80} placeholder="Отображаемое имя" value={linkedAccount.displayName} onChange={(event) => setLinkedAccount({ ...linkedAccount, displayName: event.target.value })} />
        <input required type="password" minLength={12} maxLength={128} placeholder="Пароль от 12 символов" value={linkedAccount.password} onChange={(event) => setLinkedAccount({ ...linkedAccount, password: event.target.value })} />
        {linkedAccountError && <p className="form-error" role="alert">{linkedAccountError}</p>}
        <button className="secondary-button" type="submit" disabled={linkedAccountPending}><UserPlus size={16} />{linkedAccountPending ? 'Создаём…' : 'Создать аккаунт с галочкой'}</button>
      </form>
      {!!verifiedAccounts.accounts.length && <div className="linked-account-list">{verifiedAccounts.accounts.map((account) => <span key={account.id}><BadgeCheck size={15} />{account.displayName} <small>@{account.username}</small></span>)}</div>}
    </section>}
  </section>;
}
