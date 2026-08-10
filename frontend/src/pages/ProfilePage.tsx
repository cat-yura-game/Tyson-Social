import { BadgeCheck, CalendarDays } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { PostCard } from '../components/PostCard';

export function ProfilePage() {
  const { username = 'nikita' } = useParams();
  return (
    <section className="profile-page">
      <div className="profile-cover" />
      <header className="profile-header">
        <div className="avatar profile-avatar">Н</div>
        <button className="secondary-button" type="button">Редактировать профиль</button>
        <div className="profile-copy"><h1>Никита Орлов <BadgeCheck size={20} /></h1><p>@{username}</p><p className="profile-bio">Продуктовый дизайнер. Ищу спокойные технологии и хорошие городские истории.</p><span><CalendarDays size={16} />В Tyson с августа 2026</span></div>
        <div className="profile-stats"><span><strong>128</strong>публикаций</span><span><strong>4,8K</strong>подписчиков</span><span><strong>312</strong>подписок</span></div>
      </header>
      <div className="section-label">Публикации</div>
      <PostCard id="profile-post" author="Никита Орлов" username={username} time="2 дня" likes={318} comments={42} body="Хороший продукт объясняет себя не подсказками, а последовательностью маленьких, понятных решений." />
    </section>
  );
}
