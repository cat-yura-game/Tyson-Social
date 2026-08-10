import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Building2, LockKeyhole, MessageCircle, Settings, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

const content: Record<string, { icon: LucideIcon; eyebrow: string; title: string; description: string }> = {
  messages: { icon: LockKeyhole, eyebrow: 'Личные сообщения', title: 'Разговор остаётся вашим', description: 'Мессенджер появится после отдельного аудита E2EE-архитектуры. Сервер Tyson будет хранить только зашифрованные сообщения.' },
  settings: { icon: Settings, eyebrow: 'Ваш аккаунт', title: 'Настройки', description: 'Здесь будут профиль, безопасность, активные сессии, уведомления и управление внешним видом.' },
  company: { icon: Building2, eyebrow: 'Tyson для организаций', title: 'Создайте голос компании', description: 'Подайте заявку, расскажите об организации и дождитесь ручной проверки команды Tyson.' },
  admin: { icon: ShieldCheck, eyebrow: 'Защищённая зона', title: 'Панель управления', description: 'Заявки компаний, очередь модерации и сигналы безопасности доступны только проверенным администраторам.' },
  post: { icon: MessageCircle, eyebrow: 'Публикация', title: 'Одна идея — целый разговор', description: 'Детальная страница поста будет включать медиа, реакции, комментарии и AI-краткое содержание.' },
};

export function PlaceholderPage({ kind }: { kind: keyof typeof content }) {
  const item = content[kind];
  const Icon = item.icon;
  return (
    <section className="surface-page placeholder-page"><div className="feature-icon"><Icon size={28} /></div><p className="eyebrow">{item.eyebrow}</p><h1>{item.title}</h1><p>{item.description}</p><Link className="text-link" to="/">Вернуться в ленту <ArrowRight size={17} /></Link></section>
  );
}
