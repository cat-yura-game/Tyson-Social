const DEVELOPMENT_PAUSED = true;

export function DevelopmentPausedOverlay() {
  if (!DEVELOPMENT_PAUSED) return null;

  return (
    <div className="development-paused-overlay" role="dialog" aria-modal="true" aria-labelledby="development-paused-title">
      <section className="development-paused-card">
        <span className="development-paused-label">Tyson Social</span>
        <h1 id="development-paused-title">Разработка временно приостановлена</h1>
        <p>Соцсеть Tyson тоже временно недоступна. Мы вернёмся после обновления проекта.</p>
        <a className="development-paused-link" href="https://t.me/TysonSocial" target="_blank" rel="noreferrer">
          Следить за разработкой
        </a>
      </section>
    </div>
  );
}
