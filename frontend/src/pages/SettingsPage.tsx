import { BadgeCheck, BellRing, Camera, LockKeyhole, Monitor, Moon, RefreshCw, Save, Send, ShieldCheck, Sun, Trash2, Unlink, UserPlus, Volume2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest, mediaUrl, setAccessToken } from '../api/client';
import { useAuth, type AuthUser } from '../auth/AuthProvider';
import { cropAvatarToSquare } from '../images/crop-square';
import { getThemePreference, setThemePreference, type ThemePreference } from '../theme';
import { PushNotificationSettings } from '../components/PushNotificationSettings';
import { AuthorNotificationSettings } from '../components/AuthorNotificationSettings';

export function SettingsPage() {
  const { user, refresh, switchAccount } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [birthdayMonthDay, setBirthdayMonthDay] = useState(user?.birthdayMonthDay ?? '');
  const [birthdayYear, setBirthdayYear] = useState(user?.birthdayYear?.toString() ?? '');
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
  const [secretChatEnabled, setSecretChatEnabled] = useState(false);
  const [secretChatPending, setSecretChatPending] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<'profile' | 'privacy' | 'notifications'>('profile');
  const [privacy, setPrivacy] = useState({ lastSeenVisibility: 'everyone', birthdayVisibility: 'everyone', messagingVisibility: 'everyone' });
  const [privacyPending, setPrivacyPending] = useState(false);
  const [messageSoundsEnabled, setMessageSoundsEnabled] = useState(true);
  const [soundPending, setSoundPending] = useState(false);
  const [siteRefreshPending, setSiteRefreshPending] = useState(false);
  const [deleteUsername, setDeleteUsername] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  useEffect(() => { if (user?.verified) void loadVerifiedAccounts().catch(() => setVerifiedAccounts(null)); }, [user?.id, user?.verified]);
  useEffect(() => { if (user) void apiRequest<{ secretChatEnabled: boolean }>('/users/me/messaging-settings').then((value) => setSecretChatEnabled(value.secretChatEnabled)).catch(() => undefined); }, [user]);
  useEffect(() => { if (user) void Promise.all([
    apiRequest<typeof privacy>('/users/me/privacy-settings'), apiRequest<{ messageSoundsEnabled: boolean }>('/users/me/notification-settings'),
  ]).then(([privacySettings, notifications]) => { setPrivacy(privacySettings); setMessageSoundsEnabled(notifications.messageSoundsEnabled); }).catch(() => undefined); }, [user]);

  if (!user) return null;

  const save = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setError(null); setMessage(null);
    const nextUsername = username.trim().toLowerCase();
    try {
      const input: { displayName: string; bio: string; username?: string; birthdayMonthDay: string | null; birthdayYear: number | null } = {
        displayName, bio, birthdayMonthDay: birthdayMonthDay || null, birthdayYear: birthdayYear ? Number(birthdayYear) : null,
      };
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

  const changeAccount = async (accountId: string) => {
    setLinkedAccountPending(true); setLinkedAccountError(null);
    try { await switchAccount(accountId); navigate('/settings', { replace: true }); }
    catch (caught) { setLinkedAccountError(caught instanceof ApiError ? caught.message : 'Не удалось переключить аккаунт.'); }
    finally { setLinkedAccountPending(false); }
  };

  const changeSecretChat = async (enabled: boolean) => {
    setSecretChatPending(true);
    try { const result = await apiRequest<{ secretChatEnabled: boolean }>('/users/me/messaging-settings', { method: 'PUT', body: JSON.stringify({ secretChatEnabled: enabled }) }); setSecretChatEnabled(result.secretChatEnabled); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось изменить настройку секретных чатов.'); }
    finally { setSecretChatPending(false); }
  };

  const savePrivacy = async () => {
    setPrivacyPending(true); setError(null);
    try { const value = await apiRequest<typeof privacy>('/users/me/privacy-settings', { method: 'PUT', body: JSON.stringify(privacy) }); setPrivacy(value); setMessage('Настройки конфиденциальности сохранены.'); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить настройки конфиденциальности.'); }
    finally { setPrivacyPending(false); }
  };

  const changeMessageSound = async (enabled: boolean) => {
    setSoundPending(true);
    try { const value = await apiRequest<{ messageSoundsEnabled: boolean }>('/users/me/notification-settings', { method: 'PUT', body: JSON.stringify({ messageSoundsEnabled: enabled }) }); setMessageSoundsEnabled(value.messageSoundsEnabled); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось изменить настройку звука.'); }
    finally { setSoundPending(false); }
  };

  const refreshSite = async () => {
    setSiteRefreshPending(true);
    try {
      if ('caches' in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update()));
      }
    } finally {
      const freshUrl = new URL(window.location.href);
      freshUrl.searchParams.set('tyson_refresh', Date.now().toString());
      window.location.replace(freshUrl.toString());
    }
  };

  const deleteAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!window.confirm('Аккаунт, публикации, сообщения и файлы будут удалены без возможности восстановления. Продолжить?')) return;
    setDeletePending(true); setDeleteError(null);
    try {
      await apiRequest('/users/me', { method: 'DELETE', body: JSON.stringify({ username: deleteUsername.trim(), password: deletePassword || undefined, confirmation: 'DELETE' }) });
      setAccessToken(null);
      window.location.replace('/login');
    } catch (caught) {
      setDeleteError(caught instanceof ApiError ? caught.message : 'Не удалось удалить аккаунт.');
      setDeletePending(false);
    }
  };

  return <section className="surface-page narrow-page settings-page">
    <header className="page-heading"><div><p className="eyebrow">Ваш аккаунт</p><h1>Настройки профиля</h1></div></header>
    <nav className="settings-categories" aria-label="Разделы настроек">
      <button type="button" className={settingsCategory === 'profile' ? 'active' : ''} onClick={() => setSettingsCategory('profile')}>Профиль</button>
      <button type="button" className={settingsCategory === 'privacy' ? 'active' : ''} onClick={() => setSettingsCategory('privacy')}><ShieldCheck size={15} />Конфиденциальность</button>
      <button type="button" className={settingsCategory === 'notifications' ? 'active' : ''} onClick={() => setSettingsCategory('notifications')}><BellRing size={15} />Уведомления и звуки</button>
    </nav>
    {settingsCategory === 'notifications' && <>
      <section className="notification-sound-settings"><div><p className="eyebrow">Звуки</p><h2><Volume2 size={19} />Звук новых сообщений</h2><p>Воспроизводить короткий сигнал в Tyson при получении нового сообщения.</p></div><label className="settings-switch"><input type="checkbox" checked={messageSoundsEnabled} disabled={soundPending} onChange={(event) => void changeMessageSound(event.target.checked)} /><span aria-hidden="true" /><b>{messageSoundsEnabled ? 'Включён' : 'Выключен'}</b></label></section>
      <PushNotificationSettings />
      <AuthorNotificationSettings />
    </>}
    {settingsCategory === 'privacy' && <>
      <section className="privacy-settings"><div><p className="eyebrow">Конфиденциальность</p><h2><ShieldCheck size={19} />Кто может видеть и писать вам</h2><p>«Друзья» — пользователи с взаимной подпиской.</p></div>{([
        ['lastSeenVisibility', 'Время последнего посещения'],
        ['birthdayVisibility', 'День рождения'],
        ['messagingVisibility', 'Кто может написать вам'],
      ] as const).map(([key, label]) => <label key={key}><span>{label}</span><select value={privacy[key]} onChange={(event) => setPrivacy({ ...privacy, [key]: event.target.value })}><option value="everyone">Все</option><option value="friends">Друзья</option><option value="nobody">Никто</option></select></label>)}<button className="primary-button" type="button" disabled={privacyPending} onClick={() => void savePrivacy()}><Save size={17} />{privacyPending ? 'Сохраняем…' : 'Сохранить приватность'}</button></section>
      <section className="secret-chats-settings" aria-labelledby="secret-chats-title"><div><p className="eyebrow">Приватные сообщения</p><h2 id="secret-chats-title"><LockKeyhole size={18} />Секретные чаты</h2><p>Обычные сообщения синхронизируются по аккаунту и шифруются при хранении. Секретные чаты используют E2EE и доступны только на добавленных устройствах.</p></div><label className="settings-switch"><input type="checkbox" checked={secretChatEnabled} disabled={secretChatPending} onChange={(event) => void changeSecretChat(event.target.checked)} /><span aria-hidden="true" /><b>{secretChatEnabled ? 'Включены' : 'Выключены'}</b></label></section>
    </>}
    {settingsCategory === 'profile' && <>
    <section className="theme-settings" aria-labelledby="theme-settings-title"><div><p className="eyebrow">Оформление</p><h2 id="theme-settings-title">Тема Tyson</h2></div><div className="theme-options" role="radiogroup" aria-label="Тема интерфейса"><button type="button" role="radio" aria-checked={theme === 'system'} className={theme === 'system' ? 'selected' : ''} onClick={() => chooseTheme('system')}><Monitor size={18} />Как в системе</button><button type="button" role="radio" aria-checked={theme === 'light'} className={theme === 'light' ? 'selected' : ''} onClick={() => chooseTheme('light')}><Sun size={18} />Светлая</button><button type="button" role="radio" aria-checked={theme === 'dark'} className={theme === 'dark' ? 'selected' : ''} onClick={() => chooseTheme('dark')}><Moon size={18} />Тёмная</button></div></section>
    <section className="site-refresh-settings" aria-labelledby="site-refresh-title"><div><p className="eyebrow">Версия сайта</p><h2 id="site-refresh-title">Обновить Tyson</h2><p>Удалит старые файлы интерфейса из кэша и загрузит актуальную версию. Аккаунт, сообщения и настройки сохранятся.</p></div><button className="secondary-button" type="button" disabled={siteRefreshPending} onClick={() => void refreshSite()}><RefreshCw className={siteRefreshPending ? 'refresh-spinning' : ''} size={17} />{siteRefreshPending ? 'Обновляем…' : 'Обновить сайт'}</button></section>
    <div className="avatar-editor">{avatar ? <img src={avatar} alt="Фотография профиля" /> : <span className="avatar profile-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>}<label className="secondary-button"><Camera size={17} />Изменить фото<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(event) => void uploadAvatar(event.target.files?.[0])} /></label></div>
    <form className="settings-form" onSubmit={(event) => void save(event)}>
      <label><span>Отображаемое имя</span><input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label><span>Имя пользователя</span><input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" disabled={!user.usernameChangeAvailable} value={username} onChange={(event) => setUsername(event.target.value)} /><small>{user.usernameChangeAvailable ? 'После регистрации username можно изменить только один раз.' : 'Вы уже использовали единственную смену username.'}</small></label>
      <label><span>О себе</span><textarea maxLength={500} value={bio} onChange={(event) => setBio(event.target.value)} /><small>{bio.length} / 500</small></label>
      <fieldset className="birthday-settings"><legend>День рождения</legend><p>Год необязателен: без него в профиле будет виден только день и месяц.</p><div><label><span>День и месяц</span><input type="text" inputMode="numeric" placeholder="ДД-ММ, например 14-08" pattern="\d{2}-\d{2}" value={birthdayMonthDay} onChange={(event) => setBirthdayMonthDay(event.target.value.replace(/[^\d-]/gu, '').slice(0, 5))} /></label><label><span>Год (необязательно)</span><input type="number" min="1900" max={new Date().getFullYear()} placeholder="Например 2008" value={birthdayYear} onChange={(event) => setBirthdayYear(event.target.value)} /></label></div></fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success">{message}</p>}
      <button className="primary-button" disabled={pending} type="submit"><Save size={17} />{pending ? 'Сохраняем…' : 'Сохранить'}</button>
    </form>
    <section className="telegram-settings" aria-labelledby="telegram-settings-title">
      <div className="telegram-settings-copy"><span className="telegram-mark"><Send size={20} /></span><div><h2 id="telegram-settings-title">Telegram</h2><p>{telegramStatus?.linked ? 'Telegram подтверждает аккаунт и доступен для следующего входа.' : 'Подключите Telegram вместо подтверждения кодом по email.'}</p>{telegramStatus?.identity && <small>{telegramStatus.identity.username ? `@${telegramStatus.identity.username}` : telegramStatus.identity.displayName ?? 'Telegram подключён'}</small>}</div></div>
      {telegramStatus?.linked ? <button className="secondary-button" type="button" disabled={telegramPending} onClick={() => void disconnectTelegram()}><Unlink size={16} />Отключить</button> : <button className="telegram-connect-button" type="button" disabled={telegramPending || telegramStatus === null} onClick={() => void connectTelegram()}><Send size={16} />{telegramPending ? 'Открываем…' : 'Подключить'}</button>}
      {telegramResult === 'linked' && <p className="form-success">Telegram успешно подключён.</p>}
      {telegramError && <p className="form-error" role="alert">{telegramError}</p>}
    </section>
    {verifiedAccounts && (verifiedAccounts.canCreate || verifiedAccounts.accounts.length > 0) && <section className="linked-accounts-settings" aria-labelledby="linked-accounts-title">
      <div><p className="eyebrow">Подтверждённый аккаунт</p><h2 id="linked-accounts-title"><BadgeCheck size={18} />Дополнительные аккаунты</h2><p>Созданные здесь профили получат галочку и отдельные данные для входа. Создать можно до 10 аккаунтов.</p></div>
      {verifiedAccounts.canCreate && <form className="linked-account-form" onSubmit={(event) => void createLinkedAccount(event)}>
        <input required type="email" placeholder="Email нового аккаунта" value={linkedAccount.email} onChange={(event) => setLinkedAccount({ ...linkedAccount, email: event.target.value })} />
        <input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" placeholder="Username" value={linkedAccount.username} onChange={(event) => setLinkedAccount({ ...linkedAccount, username: event.target.value })} />
        <input required maxLength={80} placeholder="Отображаемое имя" value={linkedAccount.displayName} onChange={(event) => setLinkedAccount({ ...linkedAccount, displayName: event.target.value })} />
        <input required type="password" minLength={12} maxLength={128} placeholder="Пароль от 12 символов" value={linkedAccount.password} onChange={(event) => setLinkedAccount({ ...linkedAccount, password: event.target.value })} />
        {linkedAccountError && <p className="form-error" role="alert">{linkedAccountError}</p>}
        <button className="secondary-button" type="submit" disabled={linkedAccountPending}><UserPlus size={16} />{linkedAccountPending ? 'Создаём…' : 'Создать аккаунт с галочкой'}</button>
      </form>}
      {!!verifiedAccounts.accounts.length && <div className="linked-account-list">{verifiedAccounts.accounts.map((account) => <button key={account.id} type="button" disabled={linkedAccountPending} onClick={() => void changeAccount(account.id)}><BadgeCheck size={15} /><span>{account.displayName} <small>@{account.username}</small></span><span className="linked-account-switch">Перейти</span></button>)}</div>}
    </section>}
    <section className="delete-account-settings" aria-labelledby="delete-account-title">
      <div><p className="eyebrow">Опасная зона</p><h2 id="delete-account-title"><Trash2 size={18} />Удалить аккаунт</h2><p>Профиль, публикации, комментарии, истории, AI-диалоги, сообщения и загруженные файлы будут удалены без возможности восстановления.</p></div>
      <form onSubmit={(event) => void deleteAccount(event)}><label><span>Введите @{user.username}</span><input required autoComplete="off" value={deleteUsername} onChange={(event) => setDeleteUsername(event.target.value)} placeholder={user.username} /></label>{!telegramStatus?.linked && <label><span>Текущий пароль</span><input required type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></label>}{deleteError && <p className="form-error" role="alert">{deleteError}</p>}<button type="submit" disabled={deletePending || deleteUsername.trim().toLowerCase() !== user.username.toLowerCase()}><Trash2 size={16} />{deletePending ? 'Удаляем…' : 'Удалить аккаунт навсегда'}</button></form>
    </section>
    </>}
  </section>;
}
