import { describe, expect, it, vi } from 'vitest';

import {
  BATTLE_SFX_SETTINGS_STORAGE_KEY,
  BattleSfxSettingsStore,
  DEFAULT_BATTLE_SFX_SETTINGS,
  type BattleSfxSettingsStorage,
} from './BattleSfxSettingsStore.js';

class MemoryStorage implements BattleSfxSettingsStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('Phase 6 local battle SFX settings', () => {
  it('starts at the approved 0.8 volume and unmuted client-only default', () => {
    const store = new BattleSfxSettingsStore({ storage: null });

    expect(store.value).toEqual({
      volume: 0.8,
      muted: false,
    });
    expect(store.value).toBe(DEFAULT_BATTLE_SFX_SETTINGS);
  });

  it('persists volume and mute independently from battle simulation state', () => {
    const storage = new MemoryStorage();
    const store = new BattleSfxSettingsStore({ storage });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(store.setVolume(0.35)).toEqual({ volume: 0.35, muted: false });
    expect(store.setMuted(true)).toEqual({ volume: 0.35, muted: true });
    expect(storage.values.get(BATTLE_SFX_SETTINGS_STORAGE_KEY)).toBe(
      JSON.stringify({ volume: 0.35, muted: true }),
    );
    expect(new BattleSfxSettingsStore({ storage }).value).toEqual({
      volume: 0.35,
      muted: true,
    });
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    store.setMuted(false);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('clamps slider values and rejects non-finite input', () => {
    const store = new BattleSfxSettingsStore({ storage: null });

    expect(store.setVolume(-1).volume).toBe(0);
    expect(store.setVolume(2).volume).toBe(1);
    expect(() => store.setVolume(Number.NaN)).toThrow(RangeError);
  });

  it('falls back silently on malformed or unavailable browser storage while remaining usable', () => {
    const malformed = new MemoryStorage();
    malformed.values.set(BATTLE_SFX_SETTINGS_STORAGE_KEY, '{"volume":"loud"}');
    const errors: unknown[] = [];
    const throwingStorage: BattleSfxSettingsStorage = {
      getItem: () => {
        throw new Error('storage blocked');
      },
      setItem: () => {
        throw new Error('storage full');
      },
    };

    expect(new BattleSfxSettingsStore({ storage: malformed }).value).toEqual(
      DEFAULT_BATTLE_SFX_SETTINGS,
    );
    const store = new BattleSfxSettingsStore({
      storage: throwingStorage,
      onStorageError: (error) => errors.push(error),
    });

    expect(store.value).toEqual(DEFAULT_BATTLE_SFX_SETTINGS);
    expect(store.setMuted(true)).toEqual({ volume: 0.8, muted: true });
    expect(errors).toHaveLength(2);
  });
});
