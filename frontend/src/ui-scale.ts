const STORAGE_KEY = 'tyson_ui_scale';

export const MIN_UI_SCALE = 90;
export const MAX_UI_SCALE = 125;
export const DEFAULT_UI_SCALE = 100;

export function getUiScale(): number {
  const value = Number(window.localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_UI_SCALE && value <= MAX_UI_SCALE ? value : DEFAULT_UI_SCALE;
}

export function applyUiScale(value: number): void {
  const scale = Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, Math.round(value)));
  document.documentElement.style.setProperty('--tyson-ui-scale', String(scale / 100));
}

export function setUiScale(value: number): void {
  const scale = Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, Math.round(value)));
  window.localStorage.setItem(STORAGE_KEY, String(scale));
  applyUiScale(scale);
}
