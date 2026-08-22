import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import './styles.css';
import { applyTheme, getThemePreference, watchSystemTheme } from './theme';
import { restorePowerSavingSettings } from './performance';
import { applyUiScale, getUiScale } from './ui-scale';

applyTheme(getThemePreference());
applyUiScale(getUiScale());
restorePowerSavingSettings();
watchSystemTheme();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js', { scope: '/' }); });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider><App /></AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
