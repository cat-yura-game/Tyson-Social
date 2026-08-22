export type MobileLastTab = 'settings' | 'profile';

const STORAGE_KEY = 'tyson_mobile_last_tab';
const CHANGE_EVENT = 'tyson-mobile-last-tab-change';

export function getMobileLastTab(): MobileLastTab {
  return window.localStorage.getItem(STORAGE_KEY) === 'profile' ? 'profile' : 'settings';
}

export function setMobileLastTab(value: MobileLastTab): void {
  window.localStorage.setItem(STORAGE_KEY, value);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onMobileLastTabChange(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
