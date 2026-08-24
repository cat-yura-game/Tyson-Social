import { BellOff, BellRing, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../api/client';

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function PushNotificationSettings() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [subscribed, setSubscribed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telegram, setTelegram] = useState<{ telegramLinked: boolean; connected: boolean; connectUrl: string; settings: { enabled: boolean; messagesEnabled: boolean; interactionsEnabled: boolean; postsEnabled: boolean; securityEnabled: boolean } | null } | null>(null);
  const [telegramPending, setTelegramPending] = useState(false);

  const loadTelegram = async () => setTelegram(await apiRequest<{ telegramLinked: boolean; connected: boolean; connectUrl: string; settings: { enabled: boolean; messagesEnabled: boolean; interactionsEnabled: boolean; postsEnabled: boolean; securityEnabled: boolean } | null }>('/telegram/notifications/settings'));

  useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => setSubscribed(Boolean(subscription)));
  }, [supported]);
  useEffect(() => { void loadTelegram().catch(() => setTelegram(null)); }, []);

  const saveTelegram = async (settings: NonNullable<typeof telegram>['settings']) => {
    if (!settings) return; setTelegramPending(true); setError(null);
    try { await apiRequest('/telegram/notifications/settings', { method: 'PUT', body: JSON.stringify(settings) }); setTelegram((value) => value ? { ...value, settings } : value); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить настройки Telegram.'); }
    finally { setTelegramPending(false); }
  };

  const enable = async () => {
    setPending(true); setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Разрешение на уведомления не выдано.');
      const [{ publicKey }, registration] = await Promise.all([
        apiRequest<{ publicKey: string | null }>('/push/config'), navigator.serviceWorker.ready,
      ]);
      if (!publicKey) throw new Error('Push-уведомления ещё не настроены на сервере.');
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
      const value = subscription.toJSON();
      if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) throw new Error('Браузер вернул неполную подписку.');
      await apiRequest('/push/subscription', { method: 'PUT', body: JSON.stringify({ endpoint: value.endpoint, keys: value.keys }) });
      setSubscribed(true);
    } catch (caught) { setError(caught instanceof ApiError || caught instanceof Error ? caught.message : 'Не удалось включить уведомления.'); }
    finally { setPending(false); }
  };

  const disable = async () => {
    setPending(true); setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await apiRequest('/push/subscription', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось отключить уведомления.'); }
    finally { setPending(false); }
  };

  const test = async () => {
    setPending(true); setError(null);
    try { await apiRequest('/push/test', { method: 'POST' }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось отправить тест.'); }
    finally { setPending(false); }
  };

  return <><section className="push-settings" aria-labelledby="push-settings-title">
    <div><p className="eyebrow">Уведомления</p><h2 id="push-settings-title"><BellRing size={19} />Push-уведомления</h2><p>{supported ? 'Tyson сможет сообщать о подписках, комментариях и алмазных реакциях, даже когда приложение закрыто.' : 'Этот браузер не поддерживает Web Push.'}</p><small>На iPhone сначала добавьте Tyson на экран «Домой», откройте его как приложение и нажмите кнопку ниже.</small></div>
    {supported && <div className="push-settings-actions">{subscribed ? <><button className="secondary-button" type="button" disabled={pending} onClick={() => void test()}><Send size={16} />Проверить</button><button className="secondary-button" type="button" disabled={pending} onClick={() => void disable()}><BellOff size={16} />Отключить</button></> : <button className="primary-button" type="button" disabled={pending} onClick={() => void enable()}><BellRing size={16} />{pending ? 'Подключаем…' : 'Включить уведомления'}</button>}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section><section className="push-settings telegram-notification-settings" aria-labelledby="telegram-notification-settings-title"><div><p className="eyebrow">Telegram</p><h2 id="telegram-notification-settings-title"><Send size={19} />Уведомления в Telegram</h2><p>Альтернатива push-уведомлениям: сообщения будут приходить от бота Tyson Social.</p></div>{telegram === null ? <span className="settings-loading">Загрузка…</span> : !telegram.telegramLinked ? <p className="author-notification-empty">Сначала подключите Telegram в основных настройках аккаунта.</p> : !telegram.connected ? <div className="push-settings-actions"><a className="primary-button" href={telegram.connectUrl} target="_blank" rel="noreferrer"><Send size={16} />Подключить в Telegram</a><button className="secondary-button" type="button" onClick={() => void loadTelegram()}>Проверить</button></div> : <div className="telegram-notification-options"><label className="settings-switch"><span><strong>Все Telegram-уведомления</strong><small>Можно отключить в любой момент.</small></span><input type="checkbox" checked={telegram.settings?.enabled ?? false} disabled={telegramPending} onChange={(event) => void saveTelegram({ ...telegram.settings!, enabled: event.target.checked })} /><i aria-hidden="true" /></label><label><input type="checkbox" checked={telegram.settings?.messagesEnabled ?? false} disabled={telegramPending || !telegram.settings?.enabled} onChange={(event) => void saveTelegram({ ...telegram.settings!, messagesEnabled: event.target.checked })} />Сообщения в Messenger</label><label><input type="checkbox" checked={telegram.settings?.interactionsEnabled ?? false} disabled={telegramPending || !telegram.settings?.enabled} onChange={(event) => void saveTelegram({ ...telegram.settings!, interactionsEnabled: event.target.checked })} />Комментарии, реакции и подписки</label><label><input type="checkbox" checked={telegram.settings?.postsEnabled ?? false} disabled={telegramPending || !telegram.settings?.enabled} onChange={(event) => void saveTelegram({ ...telegram.settings!, postsEnabled: event.target.checked })} />Новые посты избранных авторов</label><label><input type="checkbox" checked={telegram.settings?.securityEnabled ?? false} disabled={telegramPending || !telegram.settings?.enabled} onChange={(event) => void saveTelegram({ ...telegram.settings!, securityEnabled: event.target.checked })} />Безопасность аккаунта</label></div>}</section></>;
}
