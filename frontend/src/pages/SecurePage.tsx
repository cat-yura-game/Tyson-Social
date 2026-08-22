import { ArrowLeft, Check, Copy, Gem, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import './secure.css';

type Plan = 'day' | 'week' | 'month';
type SecureState = { active: boolean; expiresAt: string | null; plans: Record<Plan, { cost: number; days: number; label: string }> };
type Platform = 'iphone' | 'android' | 'pc';
const instructions: Record<Platform, { label: string; storeLabel: string; storeUrl: string; steps: string[] }> = {
  iphone: { label: 'iPhone', storeLabel: 'Скачать INCY в App Store', storeUrl: 'https://apps.apple.com/us/app/incy/id6756943388', steps: ['Установите и откройте INCY.', 'В Tyson Secure скопируйте свою ссылку подписки.', 'В INCY добавьте подписку по ссылке и вставьте её из буфера.', 'Выберите нужный профиль и подключитесь.'] },
  android: { label: 'Android', storeLabel: 'Скачать INCY в Google Play', storeUrl: 'https://play.google.com/store/apps/details?hl=ru&id=llc.itdev.incy', steps: ['Установите и откройте INCY.', 'В Tyson Secure скопируйте свою ссылку подписки.', 'В INCY добавьте подписку по ссылке и вставьте её из буфера.', 'Выберите нужный профиль и подключитесь.'] },
  pc: { label: 'ПК', storeLabel: 'Скачать INCY для Windows', storeUrl: 'https://github.com/INCY-DEV/incy-platforms/releases/latest', steps: ['Скачайте установщик INCY для Windows и установите приложение.', 'В Tyson Secure скопируйте свою ссылку подписки.', 'В INCY добавьте подписку по ссылке и вставьте её из буфера.', 'Выберите профиль и включите подключение.'] },
};

export function SecurePage() {
  const navigate = useNavigate();
  const [secure, setSecure] = useState<SecureState | null>(null);
  const [accessUrl, setAccessUrl] = useState<string | null>(null);
  const [pending, setPending] = useState<Plan | 'link' | null>(null);
  const [platform, setPlatform] = useState<Platform>('iphone');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => setSecure(await apiRequest<SecureState>('/secure'));
  useEffect(() => { void load().catch(() => setError('Не удалось загрузить Tyson Secure.')); }, []);
  const purchase = async (plan: Plan) => {
    setPending(plan); setError(null); setMessage(null);
    try { await apiRequest('/secure/purchase', { method: 'POST', body: JSON.stringify({ plan }) }); await load(); window.dispatchEvent(new Event('diamonds-changed')); setMessage('Tyson Secure подключён.'); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось подключить Tyson Secure.'); }
    finally { setPending(null); }
  };
  const getLink = async () => {
    setPending('link'); setError(null);
    try { const result = await apiRequest<{ url: string }>('/secure/access-link', { method: 'POST' }); setAccessUrl(result.url); await navigator.clipboard?.writeText(result.url); setMessage('Ссылка скопирована. Добавьте её в INCY как подписку.'); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось получить ссылку.'); }
    finally { setPending(null); }
  };
  return <section className="surface-page narrow-page secure-page">
    <header className="settings-detail-header"><button type="button" aria-label="Назад" onClick={() => navigate('/settings')}><ArrowLeft size={21} /></button><div><p className="eyebrow">Tyson</p><h1>Tyson Secure</h1></div></header>
    <section className="secure-hero"><ShieldCheck size={30} /><div><span>Защищённое подключение</span><h2>Tyson Secure</h2><p>Обычные локации, автоподбор и отдельные профили белых списков.</p></div></section>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success">{message}</p>}
    {secure?.active ? <section className="secure-active"><div><span>Подписка активна</span><h2>До {secure.expiresAt ? new Date(secure.expiresAt).toLocaleDateString('ru-RU') : ''}</h2><p>Все пять профилей будут в одной ссылке.</p></div><button className="primary-button" type="button" disabled={pending === 'link'} onClick={() => void getLink()}>{pending === 'link' ? 'Готовим…' : <><Copy size={17} />Скопировать ссылку</>}</button>{accessUrl && <code>{accessUrl}</code>}</section> : <section className="secure-plans"><div><p className="eyebrow">Подписка</p><h2>Выберите срок</h2><p>Доступ к обычным локациям и белым спискам в Happ или INCY.</p></div>{secure && (Object.entries(secure.plans) as Array<[Plan, SecureState['plans'][Plan]]>).map(([key, plan]) => <button key={key} type="button" disabled={pending !== null} onClick={() => void purchase(key)}><span><strong>{plan.label}</strong><small>{plan.days === 1 ? 'Попробовать Secure' : 'Продление добавится к сроку'}</small></span><b>{pending === key ? '…' : <><Gem size={16} />{plan.cost}</>}</b></button>)}<small className="secure-notice"><Check size={14} />Если профиль не работает, обновите подписку и попробуйте другую локацию. Обход белых списков не гарантируется.</small></section>}
    <section className="secure-guide"><div><p className="eyebrow">Как подключить</p><h2>Инструкция для INCY</h2><p>Выберите устройство и выполните четыре коротких шага.</p></div><div className="secure-platform-tabs" role="tablist" aria-label="Устройство">{(Object.keys(instructions) as Platform[]).map((key) => <button key={key} role="tab" type="button" aria-selected={platform === key} className={platform === key ? 'selected' : ''} onClick={() => setPlatform(key)}>{instructions[key].label}</button>)}</div><article className="secure-guide-card"><a href={instructions[platform].storeUrl} target="_blank" rel="noreferrer">{instructions[platform].storeLabel} ↗</a><ol>{instructions[platform].steps.map((step) => <li key={step}>{step}</li>)}</ol><small>В INCY подписки поддерживают добавление по ссылке и автообновление.</small></article></section>
  </section>;
}
