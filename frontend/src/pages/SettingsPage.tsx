import { ArrowLeft, BadgeCheck, BatteryMedium, BellRing, Camera, ChevronRight, CircleDashed, Database, Gem, LockKeyhole, Monitor, MonitorSmartphone, Moon, QrCode, RefreshCw, Save, Send, ShieldCheck, Sparkles, Sun, Trash2, Unlink, UserPlus, Volume2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest, mediaUrl, setAccessToken } from '../api/client';
import { useAuth, type AuthUser } from '../auth/AuthProvider';
import { cropAvatarToSquare } from '../images/crop-square';
import { getThemePreference, setThemePreference, type ThemePreference } from '../theme';
import { PushNotificationSettings } from '../components/PushNotificationSettings';
import { AuthorNotificationSettings } from '../components/AuthorNotificationSettings';
import { applyPowerSavingSettings, type PowerSavingSettings } from '../performance';
import { ProfileQrModal } from '../components/ProfileQrModal';
import { DiamondIcon } from '../components/DiamondIcon';

export function SettingsPage() {
  const { user, refresh, switchAccount } = useAuth();
  const navigate = useNavigate();
  const { section } = useParams();
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
  const settingsCategory = section === 'privacy' || section === 'notifications' || section === 'power' || section === 'data' || section === 'profile' || section === 'appearance' || section === 'ai' || section === 'devices' ? section : null;
  const [privacy, setPrivacy] = useState({ lastSeenVisibility: 'everyone', birthdayVisibility: 'everyone', messagingVisibility: 'everyone', storiesVisibility: 'everyone' });
  const [privacyPending, setPrivacyPending] = useState(false);
  const [messageSoundsEnabled, setMessageSoundsEnabled] = useState(true);
  const [soundPending, setSoundPending] = useState(false);
  const [powerSaving, setPowerSaving] = useState<PowerSavingSettings>({ powerSavingEnabled: false, blockImagesEnabled: false });
  const [powerSavingPending, setPowerSavingPending] = useState(false);
  const [siteRefreshPending, setSiteRefreshPending] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [aiSettings, setAiSettings] = useState({ defaultModelTier: 'lite', profileName: '', profileContext: '', memoryEnabled: false });
  const [aiQuota, setAiQuota] = useState<{ remaining: number; limit: number } | null>(null);
  const [aiPro, setAiPro] = useState<{ active: boolean; expiresAt: string | null } | null>(null);
  const [aiSettingsPending, setAiSettingsPending] = useState(false);
  const [deleteUsername, setDeleteUsername] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [aliases, setAliases] = useState<Array<{ id: string; username: string }>>([]);
  const [newAlias, setNewAlias] = useState('');
  const [aliasPending, setAliasPending] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; device: string; browser: string; createdAt: string; lastSeenAt: string; current: boolean }>>([]);
  const [sessionsPending, setSessionsPending] = useState(false);
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
  useEffect(() => { if (user) void apiRequest<PowerSavingSettings>('/users/me/power-saving-settings').then((value) => { setPowerSaving(value); applyPowerSavingSettings(value); }).catch(() => undefined); }, [user]);
  const loadAliases = async () => { const result = await apiRequest<{ aliases: Array<{ id: string; username: string }> }>('/users/me/aliases'); setAliases(result.aliases); };
  useEffect(() => { if (user) void loadAliases().catch(() => setAliases([])); }, [user]);
  const loadAiPro = async () => setAiPro(await apiRequest<{ active: boolean; expiresAt: string | null }>('/ai/pro'));
  useEffect(() => { if (user) void Promise.all([apiRequest<{ settings: typeof aiSettings; quota: { remaining: number; limit: number } }>('/ai/settings'), loadAiPro()]).then(([{ settings, quota }]) => { setAiSettings(settings); setAiQuota(quota); }).catch(() => undefined); }, [user]);
  const loadSessions = async () => { const result = await apiRequest<{ sessions: typeof sessions }>('/auth/sessions'); setSessions(result.sessions); };
  useEffect(() => { if (user && section === 'devices') void loadSessions().catch(() => setSessions([])); }, [section, user]);

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

  const saveAiSettings = async () => {
    setAiSettingsPending(true);
    try { await apiRequest('/ai/settings', { method: 'PUT', body: JSON.stringify(aiSettings) }); setMessage('Настройки Tyson AI сохранены.'); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить настройки AI.'); }
    finally { setAiSettingsPending(false); }
  };
  const purchaseAiPro = async (plan: 'day' | 'week' | 'month') => { setAiSettingsPending(true); try { await apiRequest('/ai/pro/purchase', { method: 'POST', body: JSON.stringify({ plan }) }); await Promise.all([loadAiPro(), apiRequest<{ quota: { remaining: number; limit: number }; settings: typeof aiSettings }>('/ai/settings').then(({ quota, settings }) => { setAiQuota(quota); setAiSettings(settings); })]); window.dispatchEvent(new Event('diamonds-changed')); setMessage('AI Pro подключён.'); } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось подключить AI Pro.'); } finally { setAiSettingsPending(false); } };

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

  const changePowerSaving = async (next: PowerSavingSettings) => {
    setPowerSavingPending(true); setError(null);
    try {
      const value = await apiRequest<PowerSavingSettings>('/users/me/power-saving-settings', { method: 'PUT', body: JSON.stringify(next) }); setPowerSaving(value); applyPowerSavingSettings(value);
      if (value.powerSavingEnabled && 'serviceWorker' in navigator) {
        const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
        if (subscription) { await apiRequest('/push/subscription', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) }); await subscription.unsubscribe(); }
      }
    }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось изменить энергосбережение.'); }
    finally { setPowerSavingPending(false); }
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
  const addAlias = async (event: FormEvent) => { event.preventDefault(); if (!newAlias.trim()) return; setAliasPending(true); try { await apiRequest('/users/me/aliases', { method: 'POST', body: JSON.stringify({ username: newAlias }) }); setNewAlias(''); await loadAliases(); window.dispatchEvent(new Event('diamonds-changed')); setMessage('Дополнительный username добавлен.'); } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось добавить username.'); } finally { setAliasPending(false); } };
  const deleteAlias = async (id: string) => { if (!window.confirm('Удалить дополнительный username? Его сможет занять другой пользователь.')) return; setAliasPending(true); try { await apiRequest(`/users/me/aliases/${id}`, { method: 'DELETE' }); await loadAliases(); } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось удалить username.'); } finally { setAliasPending(false); } };
  const revokeSession = async (id: string) => { setSessionsPending(true); try { await apiRequest(`/auth/sessions/${id}`, { method: 'DELETE' }); await loadSessions(); } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось завершить сеанс.'); } finally { setSessionsPending(false); } };
  const revokeOtherSessions = async () => { if (!window.confirm('Завершить все остальные сеансы? На этом устройстве вы останетесь в аккаунте.')) return; setSessionsPending(true); try { await apiRequest('/auth/sessions/others', { method: 'DELETE' }); await loadSessions(); } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось завершить сеансы.'); } finally { setSessionsPending(false); } };

  const categories = [
    ['notifications', 'notifications', BellRing, 'Уведомления и звуки', null],
    ['privacy', 'privacy', LockKeyhole, 'Конфиденциальность', null],
    ['devices', 'devices', MonitorSmartphone, 'Устройства', sessions.length ? String(sessions.length) : null],
    ['data', 'data', Database, 'Данные и память', null],
    ['power', 'power', BatteryMedium, 'Энергосбережение', powerSaving.powerSavingEnabled ? 'Вкл.' : 'Выкл.'],
    ['diamonds', 'diamonds', Gem, 'Алмазы', 'Подарки и баланс'],
    ['ai', 'ai', Sparkles, 'Tyson AI', aiQuota ? `${aiQuota.remaining} из ${aiQuota.limit}` : null],
    ['appearance', 'appearance', CircleDashed, 'Оформление', null],
    ['profile', 'profile', Camera, 'Профиль', null],
  ] as const;
  if (!settingsCategory) return <section className="surface-page narrow-page settings-page settings-directory">
    <header className="page-heading"><div><p className="eyebrow">Tyson</p><h1>Настройки</h1></div></header>
    <section className="settings-profile-header" aria-label="Ваш профиль">
      <div className="settings-profile-hero-actions"><button type="button" aria-label="Показать QR-код" onClick={() => setShowQr(true)}><QrCode size={23} /></button><button type="button" onClick={() => navigate('/settings/profile')}>Изм.</button></div>
      <button className="settings-profile-summary" type="button" onClick={() => navigate(`/profile/${user.username}`)}><span className="avatar">{avatar ? <img className="avatar-image" src={avatar} alt="" /> : user.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{user.displayName}</strong><small>@{user.username}</small></span></button>
      <button className="settings-my-profile" type="button" onClick={() => navigate(`/profile/${user.username}`)}><b>Мой профиль</b><ChevronRight /></button>
    </section>
    <nav className="settings-categories" aria-label="Разделы настроек">{categories.map(([target, icon, Icon, label, state]) => <button key={`${target}-${label}`} type="button" onClick={() => navigate(target === 'diamonds' ? '/gifts' : `/settings/${target}`)}><i className={`settings-category-icon ${icon}`}>{target === 'diamonds' ? <DiamondIcon size={24} /> : <Icon size={21} />}</i><span>{label}</span>{state && <small>{state}</small>}<ChevronRight /></button>)}</nav>
    {showQr && <ProfileQrModal username={user.username} onClose={() => setShowQr(false)} />}
  </section>;

  const sectionTitle = settingsCategory === 'notifications' ? 'Уведомления и звуки' : settingsCategory === 'privacy' ? 'Конфиденциальность' : settingsCategory === 'devices' ? 'Устройства' : settingsCategory === 'data' ? 'Данные и память' : settingsCategory === 'power' ? 'Энергосбережение' : settingsCategory === 'ai' ? 'Tyson AI' : settingsCategory === 'appearance' ? 'Оформление' : 'Профиль';
  return <section className="surface-page narrow-page settings-page settings-detail-page">
    <header className="settings-detail-header"><button type="button" aria-label="Назад к настройкам" onClick={() => navigate('/settings')}><ArrowLeft size={21} /></button><div><p className="eyebrow">Настройки Tyson</p><h1>{sectionTitle}</h1></div></header>
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
        ['storiesVisibility', 'Кто может смотреть сторис'],
      ] as const).map(([key, label]) => <label key={key}><span>{label}</span><select value={privacy[key]} onChange={(event) => setPrivacy({ ...privacy, [key]: event.target.value })}><option value="everyone">Все</option><option value="friends">Друзья</option><option value="nobody">Никто</option></select></label>)}<button className="primary-button" type="button" disabled={privacyPending} onClick={() => void savePrivacy()}><Save size={17} />{privacyPending ? 'Сохраняем…' : 'Сохранить приватность'}</button></section>
      <section className="secret-chats-settings" aria-labelledby="secret-chats-title"><div><p className="eyebrow">Приватные сообщения</p><h2 id="secret-chats-title"><LockKeyhole size={18} />Секретные чаты</h2><p>Обычные сообщения синхронизируются по аккаунту и шифруются при хранении. Секретные чаты используют E2EE и доступны только на добавленных устройствах.</p></div><label className="settings-switch"><input type="checkbox" checked={secretChatEnabled} disabled={secretChatPending} onChange={(event) => void changeSecretChat(event.target.checked)} /><span aria-hidden="true" /><b>{secretChatEnabled ? 'Включены' : 'Выключены'}</b></label></section>
    </>}
    {settingsCategory === 'devices' && <section className="device-sessions"><div><p className="eyebrow">Безопасность</p><h2><MonitorSmartphone size={20} />Активные сеансы</h2><p>Если вы не узнаёте устройство, завершите его сеанс.</p></div><div className="device-session-list">{sessions.map((session) => <article key={session.id}><i><MonitorSmartphone size={20} /></i><div><strong>{session.device}{session.current && <span>Это устройство</span>}</strong><small>{session.browser} · был в сети {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.lastSeenAt))}</small></div>{!session.current && <button type="button" disabled={sessionsPending} onClick={() => void revokeSession(session.id)}>Завершить</button>}</article>)}{!sessions.length && <p className="device-session-empty">Загружаем сеансы…</p>}</div><button className="secondary-button device-revoke-all" type="button" disabled={sessionsPending || sessions.filter((session) => !session.current).length === 0} onClick={() => void revokeOtherSessions()}>Выйти со всех остальных устройств</button></section>}
    {settingsCategory === 'power' && <section className="power-saving-settings"><div><p className="eyebrow">Энергосбережение</p><h2><BatteryMedium size={20} />Экономия энергии</h2><p>Режим отключает прозрачные эффекты, звуки новых сообщений и Push-уведомления в Tyson.</p></div><label className="settings-switch"><input type="checkbox" checked={powerSaving.powerSavingEnabled} disabled={powerSavingPending} onChange={(event) => void changePowerSaving({ ...powerSaving, powerSavingEnabled: event.target.checked })} /><span aria-hidden="true" /><b>{powerSaving.powerSavingEnabled ? 'Включено' : 'Выключено'}</b></label></section>}
    {settingsCategory === 'data' && <section className="power-saving-settings"><div><p className="eyebrow">Данные и память</p><h2><Database size={20} />Загрузка медиа</h2><p>Управляйте трафиком: отключённые изображения не будут загружаться из Tyson.</p></div><label className="power-saving-row"><span><strong>Не загружать картинки</strong><small>Посты, аватары и другие пользовательские изображения не будут запрашиваться.</small></span><input type="checkbox" checked={powerSaving.blockImagesEnabled} disabled={powerSavingPending} onChange={(event) => void changePowerSaving({ ...powerSaving, blockImagesEnabled: event.target.checked })} /></label></section>}
    {settingsCategory === 'ai' && <section className="ai-settings"><div><p className="eyebrow">Персонализация</p><h2><Sparkles size={20} />Tyson AI {aiPro?.active && <span className="ai-pro-badge">PRO</span>}</h2><p>{aiQuota ? `Сегодня доступно ${aiQuota.remaining} из ${aiQuota.limit} запросов.` : 'Загружаем лимит запросов…'}</p></div>{!aiPro?.active && <div className="ai-pro-plans"><strong>AI Pro — 100 запросов в день и память</strong><button type="button" onClick={() => void purchaseAiPro('day')}>Попробовать · 1 день · 5 💎</button><button type="button" onClick={() => void purchaseAiPro('week')}>7 дней · 20 💎</button><button type="button" onClick={() => void purchaseAiPro('month')}>30 дней · 80 💎</button><small>Пробный день доступен один раз.</small></div>}{aiPro?.active && <p className="ai-pro-active">AI Pro активен до {aiPro.expiresAt ? new Date(aiPro.expiresAt).toLocaleDateString('ru-RU') : ''}.</p>}<label><span>Модель по умолчанию</span><select value={aiSettings.defaultModelTier} onChange={(event) => setAiSettings({ ...aiSettings, defaultModelTier: event.target.value })}><option value="lite">Быстро — Gemini Flash Lite</option><option value="flash">Стандарт — Gemini Flash</option><option value="smart">Умнее — Gemini 3.7 Flash</option></select></label>{aiPro?.active && <label className="power-saving-row"><span><strong>Память AI</strong><small>Tyson AI будет использовать введённый контекст только в ваших AI-диалогах.</small></span><input type="checkbox" checked={aiSettings.memoryEnabled} onChange={(event) => setAiSettings({ ...aiSettings, memoryEnabled: event.target.checked })} /></label>}<label><span>Как к вам обращаться</span><input disabled={!aiPro?.active} maxLength={80} value={aiSettings.profileName} onChange={(event) => setAiSettings({ ...aiSettings, profileName: event.target.value })} placeholder="Например, Юра" /></label><label><span>О себе для Tyson AI</span><textarea disabled={!aiPro?.active} maxLength={1000} value={aiSettings.profileContext} onChange={(event) => setAiSettings({ ...aiSettings, profileContext: event.target.value })} placeholder="Интересы, стиль общения и полезный контекст" /><small>{aiSettings.profileContext.length} / 1000</small></label><button className="primary-button" type="button" disabled={aiSettingsPending || !aiPro?.active} onClick={() => void saveAiSettings()}><Save size={17} />{aiSettingsPending ? 'Сохраняем…' : 'Сохранить память AI'}</button></section>}
    {settingsCategory === 'appearance' && <section className="theme-settings" aria-labelledby="theme-settings-title"><div><p className="eyebrow">Оформление</p><h2 id="theme-settings-title">Тема Tyson</h2></div><div className="theme-options" role="radiogroup" aria-label="Тема интерфейса"><button type="button" role="radio" aria-checked={theme === 'system'} className={theme === 'system' ? 'selected' : ''} onClick={() => chooseTheme('system')}><Monitor size={18} />Как в системе</button><button type="button" role="radio" aria-checked={theme === 'light'} className={theme === 'light' ? 'selected' : ''} onClick={() => chooseTheme('light')}><Sun size={18} />Светлая</button><button type="button" role="radio" aria-checked={theme === 'dark'} className={theme === 'dark' ? 'selected' : ''} onClick={() => chooseTheme('dark')}><Moon size={18} />Тёмная</button></div></section>}
    {settingsCategory === 'profile' && <>
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
    <section className="alias-settings"><div><p className="eyebrow">Имена пользователя</p><h2>Дополнительные username</h2><p>Основной username остаётся прежним. Каждый дополнительный стоит 50 💎.</p></div><form onSubmit={(event) => void addAlias(event)}><span>@</span><input minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" value={newAlias} onChange={(event) => setNewAlias(event.target.value.replace(/^@/u, ''))} placeholder="новое_имя" /><button type="submit" disabled={aliasPending}>Добавить · 50 💎</button></form>{aliases.length > 0 && <div className="alias-list">{aliases.map((alias) => <div key={alias.id}><span>@{alias.username}</span><button type="button" disabled={aliasPending} onClick={() => void deleteAlias(alias.id)}><Trash2 size={15} />Удалить</button></div>)}</div>}<small>Можно добавить до 20 дополнительных username.</small></section>
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
