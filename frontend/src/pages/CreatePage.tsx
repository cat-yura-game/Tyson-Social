import { ImagePlus, Send, Sparkles } from 'lucide-react';

export function CreatePage() {
  return (
    <section className="surface-page narrow-page">
      <header className="page-heading"><div><p className="eyebrow">Новая публикация</p><h1>Поделитесь идеей</h1></div></header>
      <div className="composer-card">
        <div className="composer-author"><span className="avatar avatar-small">Н</span><span><strong>Никита Орлов</strong><small>Публикация от вашего имени</small></span></div>
        <textarea maxLength={10000} placeholder="О чём вы думаете?" aria-label="Текст публикации" />
        <div className="composer-tools"><button type="button"><ImagePlus size={19} />Добавить изображения</button><span>0 / 10 000</span></div>
        <div className="moderation-note"><Sparkles size={18} /><span>Перед публикацией Tyson проверит контент на спам, мошенничество и нарушения правил.</span></div>
        <button className="primary-button" type="button">Опубликовать<Send size={18} /></button>
      </div>
    </section>
  );
}
