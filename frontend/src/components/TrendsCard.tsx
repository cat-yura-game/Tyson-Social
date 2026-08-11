import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';

interface TrendTopic {
  label: string;
  query: string;
  postCount: number;
}

function publicationLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'публикаций';
  if (mod10 === 1) return 'публикация';
  if (mod10 >= 2 && mod10 <= 4) return 'публикации';
  return 'публикаций';
}

export function TrendsCard() {
  const [topics, setTopics] = useState<TrendTopic[] | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ topics: TrendTopic[] }>('/trends')
      .then((result) => { if (active) setTopics(result.topics); })
      .catch(() => { if (active) setTopics([]); });
    return () => { active = false; };
  }, []);

  return <section className="rail-card trends-card">
    <p className="eyebrow">Сейчас обсуждают</p>
    {topics === null ? <p className="trends-status">Собираем актуальные темы…</p> : topics.length ? topics.map((topic) => (
      <Link key={topic.query} to={`/?${new URLSearchParams({ topic: topic.query }).toString()}`}>
        <strong>{topic.label}</strong>
        <small>{topic.postCount.toLocaleString('ru-RU')} {publicationLabel(topic.postCount)}</small>
      </Link>
    )) : <p className="trends-status">Темы появятся после новых публикаций.</p>}
  </section>;
}
