export const FEED_TOPICS = [
  { id: 'technology', label: 'Технологии', keywords: ['технолог', 'гаджет', 'программ', 'разработ', 'интернет', 'смартфон'] },
  { id: 'ai', label: 'Искусственный интеллект', keywords: ['ai', 'ии', 'нейросет', 'gemini', 'модель', 'искусственн'] },
  { id: 'science', label: 'Наука', keywords: ['наук', 'исследован', 'космос', 'физик', 'биолог', 'медицин'] },
  { id: 'design', label: 'Дизайн и архитектура', keywords: ['дизайн', 'архитект', 'интерьер', 'городск', 'типограф'] },
  { id: 'photography', label: 'Фотография', keywords: ['фото', 'снимок', 'камер', 'объектив', 'фотограф'] },
  { id: 'art', label: 'Искусство', keywords: ['искусств', 'живопис', 'выставк', 'худож', 'иллюстрац'] },
  { id: 'music', label: 'Музыка', keywords: ['музык', 'песн', 'альбом', 'концерт', 'исполнител'] },
  { id: 'games', label: 'Игры', keywords: ['игр', 'гейм', 'консол', 'steam', 'киберспорт'] },
  { id: 'sport', label: 'Спорт', keywords: ['спорт', 'футбол', 'хоккей', 'трениров', 'матч', 'турнир'] },
  { id: 'travel', label: 'Путешествия', keywords: ['путешеств', 'туризм', 'поездк', 'маршрут', 'страна', 'город'] },
  { id: 'business', label: 'Бизнес', keywords: ['бизнес', 'стартап', 'рынок', 'компан', 'предприним', 'финанс'] },
  { id: 'education', label: 'Образование', keywords: ['образован', 'обучен', 'университет', 'школ', 'курс', 'знани'] },
] as const;

export type FeedTopicId = typeof FEED_TOPICS[number]['id'];

export const FEED_TOPIC_IDS = FEED_TOPICS.map((topic) => topic.id) as [FeedTopicId, ...FeedTopicId[]];

export function calculateTopicAffinity(text: string, selectedTopics: FeedTopicId[]): number {
  if (!selectedTopics.length) return 0;
  const normalized = text.toLocaleLowerCase('ru-RU');
  const selected = FEED_TOPICS.filter((topic) => selectedTopics.includes(topic.id));
  const matches = selected.filter((topic) => topic.keywords.some((keyword) => normalized.includes(keyword))).length;
  return Math.min(1, matches / Math.min(2, selected.length));
}
