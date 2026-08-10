import { SlidersHorizontal } from 'lucide-react';
import { PostCard } from '../components/PostCard';

export function FeedPage() {
  return (
    <div className="feed-page">
      <header className="page-heading feed-heading">
        <div><p className="eyebrow">Персональная лента</p><h1>Интересное для вас</h1></div>
        <button className="filter-button" type="button"><SlidersHorizontal size={18} /><span>Настроить</span></button>
      </header>
      <div className="feed-tabs"><button className="active" type="button">Для вас</button><button type="button">Свежее</button><button type="button">Подписки</button></div>
      <section className="feed-list" aria-label="Лента публикаций">
        <PostCard id="city-voice" author="Tyson Studio" username="tysonstudio" time="18 мин" verified accent likes={842} comments={76} body="Мы собрали семь идей, которые делают город дружелюбнее: от тихих дворов до навигации, понятной без слов. Делимся первым выпуском исследования и ждём ваши наблюдения." />
        <PostCard id="slow-tech" author="Мира Волкова" username="mirav" time="1 ч" likes={214} comments={31} body="Технологии становятся по-настоящему полезными не тогда, когда требуют больше внимания, а когда незаметно возвращают нам время. Собрала небольшой список принципов спокойного интерфейса." />
        <PostCard id="coffee-map" author="Северный кофе" username="northcoffee" time="3 ч" verified likes={97} comments={14} body="Открыли карту локальных обжарщиков Петербурга. В ней уже 26 мест, короткие заметки о зерне и маршруты для прогулок по районам." />
      </section>
    </div>
  );
}
