import { describe, expect, it, vi } from 'vitest';
import { createDefaultVolumeState, VOLUME_STORAGE_KEY } from './volume';
import { loadVolumeState, saveVolumeState, type VolumeStorage } from './volume-storage';

function createStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const storage: VolumeStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };

  return { storage, map };
}

describe('볼륨 저장', () => {
  it('저장한 값을 그대로 되읽는다', () => {
    const { storage } = createStorage();
    const state = createDefaultVolumeState();
    state.bgm = { level: 35, muted: true };
    state.voice = { level: 90, muted: false };

    saveVolumeState(state, storage);

    expect(loadVolumeState(storage)).toEqual(state);
  });

  it('정해진 키 하나만 쓴다', () => {
    const { storage, map } = createStorage();

    saveVolumeState(createDefaultVolumeState(), storage);

    expect([...map.keys()]).toEqual([VOLUME_STORAGE_KEY]);
  });

  it('저장된 것이 없으면 기본값이다', () => {
    expect(loadVolumeState(createStorage().storage)).toEqual(createDefaultVolumeState());
  });

  it('깨진 값은 기본값으로 되돌린다', () => {
    for (const raw of ['{', 'null', '[]', '{"schemaVersion":99}']) {
      const { storage } = createStorage({ [VOLUME_STORAGE_KEY]: raw });

      expect(loadVolumeState(storage)).toEqual(createDefaultVolumeState());
    }
  });

  it('저장소가 던져도 기본값으로 진행한다', () => {
    // 사파리 비공개 모드는 접근만 해도 던진다. 볼륨 때문에 게임이 막히면 안 된다.
    const storage: VolumeStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    expect(loadVolumeState(storage)).toEqual(createDefaultVolumeState());
    expect(() => saveVolumeState(createDefaultVolumeState(), storage)).not.toThrow();
  });

  it('저장은 실패해도 던지지 않는다', () => {
    const setItem = vi.fn(() => {
      throw new Error('quota');
    });

    expect(() =>
      saveVolumeState(createDefaultVolumeState(), { getItem: () => null, setItem }),
    ).not.toThrow();
    expect(setItem).toHaveBeenCalled();
  });
});
