export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'tyson_theme';

export function getThemePreference(): ThemePreference {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function applyTheme(preference: ThemePreference): void {
  const dark = preference === 'dark'
    || (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function setThemePreference(preference: ThemePreference): void {
  window.localStorage.setItem(STORAGE_KEY, preference);
  applyTheme(preference);
}

export function watchSystemTheme(): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = () => { if (getThemePreference() === 'system') applyTheme('system'); };
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
