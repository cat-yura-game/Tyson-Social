import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

interface TopicOption {
  id: string;
  label: string;
}

interface FeedPreferences {
  selectedTopics: string[];
  availableTopics: TopicOption[];
  maximumSelectedTopics: number;
}

export function FeedPreferencesDialog({ onClose, onSaved }: { onClose(): void; onSaved(): void }) {
  const { user } = useAuth();
  const [availableTopics, setAvailableTopics] = useState<TopicOption[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [maximum, setMaximum] = useState(6);
  const [loading, setLoading] = useState(Boolean(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    apiRequest<FeedPreferences>('/users/me/feed-preferences')
      .then((result) => {
        if (!active) return;
        setAvailableTopics(result.availableTopics);
        setSelectedTopics(result.selectedTopics);
        setMaximum(result.maximumSelectedTopics);
      })
      .catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить интересы.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);

  const toggle = (id: string) => {
    setSelectedTopics((current) => current.includes(id)
      ? current.filter((topic) => topic !== id)
      : current.length < maximum ? [...current, id] : current);
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      await apiRequest('/users/me/feed-preferences', {
        method: 'PUT',
        body: JSON.stringify({ topics: selectedTopics }),
      });
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить интересы.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="preferences-title">
      <button className="dialog-close" type="button" aria-label="Закрыть" onClick={onClose}><X size={19} /></button>
      <p className="eyebrow">Персональная лента</p>
      <h2 id="preferences-title">Что вам интересно?</h2>
      <p>Выберите до {maximum} тем. Они усилят подходящие публикации, но не скроют весь новый контент.</p>
      {!user ? <div className="preferences-login"><span>Войдите в аккаунт, чтобы сохранить интересы.</span><Link className="primary-button" to="/login">Войти</Link></div> : loading ? <p className="preferences-loading">Загружаем темы…</p> : <>
        <div className="topic-options">
          {availableTopics.map((topic) => {
            const selected = selectedTopics.includes(topic.id);
            return <button key={topic.id} className={selected ? 'topic-option selected' : 'topic-option'} type="button" aria-pressed={selected} onClick={() => toggle(topic.id)}>
              {selected && <Check size={15} />}{topic.label}
            </button>;
          })}
        </div>
        <div className="preferences-footer">
          <small>Выбрано: {selectedTopics.length} из {maximum}</small>
          <button className="primary-button" type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  </div>;
}
