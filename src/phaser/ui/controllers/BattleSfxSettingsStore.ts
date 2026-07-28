export const BATTLE_SFX_SETTINGS_STORAGE_KEY = 'pathfinder-tcg:battle-sfx:v1';

export interface BattleSfxSettings {
  readonly volume: number;
  readonly muted: boolean;
}

export const DEFAULT_BATTLE_SFX_SETTINGS: BattleSfxSettings = Object.freeze({
  volume: 0.8,
  muted: false,
});

export interface BattleSfxSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BattleSfxSettingsStoreOptions {
  readonly storage?: BattleSfxSettingsStorage | null;
  readonly onStorageError?: (error: unknown) => void;
}

export type BattleSfxSettingsListener = (settings: BattleSfxSettings) => void;

function freezeSettings(settings: BattleSfxSettings): BattleSfxSettings {
  return Object.freeze({ ...settings });
}

function isBattleSfxSettings(value: unknown): value is BattleSfxSettings {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (!('volume' in value) || !('muted' in value)) {
    return false;
  }

  return (
    typeof value.volume === 'number' &&
    Number.isFinite(value.volume) &&
    value.volume >= 0 &&
    value.volume <= 1 &&
    typeof value.muted === 'boolean'
  );
}

function resolveBrowserStorage(): BattleSfxSettingsStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class BattleSfxSettingsStore {
  private readonly storage: BattleSfxSettingsStorage | null;
  private readonly onStorageError?: (error: unknown) => void;
  private readonly listeners = new Set<BattleSfxSettingsListener>();
  private settings: BattleSfxSettings;

  constructor(options: BattleSfxSettingsStoreOptions = {}) {
    this.storage = options.storage === undefined ? resolveBrowserStorage() : options.storage;
    this.onStorageError = options.onStorageError;
    this.settings = this.read();
  }

  get value(): BattleSfxSettings {
    return this.settings;
  }

  setVolume(volume: number): BattleSfxSettings {
    if (!Number.isFinite(volume)) {
      throw new RangeError('전투 SFX 음량은 유한한 수여야 합니다.');
    }

    return this.update({
      ...this.settings,
      volume: Math.min(1, Math.max(0, volume)),
    });
  }

  setMuted(muted: boolean): BattleSfxSettings {
    return this.update({
      ...this.settings,
      muted,
    });
  }

  subscribe(listener: BattleSfxSettingsListener): () => void {
    this.listeners.add(listener);
    listener(this.settings);

    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    this.listeners.clear();
  }

  private read(): BattleSfxSettings {
    if (this.storage === null) {
      return DEFAULT_BATTLE_SFX_SETTINGS;
    }

    try {
      const stored = this.storage.getItem(BATTLE_SFX_SETTINGS_STORAGE_KEY);

      if (stored === null) {
        return DEFAULT_BATTLE_SFX_SETTINGS;
      }

      const value: unknown = JSON.parse(stored);
      return isBattleSfxSettings(value) ? freezeSettings(value) : DEFAULT_BATTLE_SFX_SETTINGS;
    } catch (error: unknown) {
      this.onStorageError?.(error);
      return DEFAULT_BATTLE_SFX_SETTINGS;
    }
  }

  private update(next: BattleSfxSettings): BattleSfxSettings {
    this.settings = freezeSettings(next);

    if (this.storage !== null) {
      try {
        this.storage.setItem(BATTLE_SFX_SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
      } catch (error: unknown) {
        this.onStorageError?.(error);
      }
    }

    for (const listener of this.listeners) {
      listener(this.settings);
    }

    return this.settings;
  }
}
