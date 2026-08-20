export interface PowerSavingSettings {
  powerSavingEnabled: boolean;
  blockImagesEnabled: boolean;
}

const STORAGE_KEY = 'tyson_power_saving';

export function applyPowerSavingSettings(settings: PowerSavingSettings): void {
  document.documentElement.dataset.powerSaving = String(settings.powerSavingEnabled);
  document.documentElement.dataset.blockImages = String(settings.blockImagesEnabled);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function restorePowerSavingSettings(): void {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<PowerSavingSettings>;
    applyPowerSavingSettings({ powerSavingEnabled: Boolean(value.powerSavingEnabled), blockImagesEnabled: Boolean(value.blockImagesEnabled) });
  } catch { applyPowerSavingSettings({ powerSavingEnabled: false, blockImagesEnabled: false }); }
}

export function shouldBlockImages(): boolean {
  return document.documentElement.dataset.blockImages === 'true';
}
