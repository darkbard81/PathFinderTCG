import {
  createDefaultVolumeState,
  normalizeVolumeState,
  serializeVolumeState,
  VOLUME_STORAGE_KEY,
  type SoundVolumeState,
} from './volume';

/**
 * 볼륨을 기기에 저장한다.
 *
 * 저장 슬롯이 아니라 localStorage에 둔다. 스피커냐 헤드폰이냐는 기기 특성이라
 * 슬롯을 따라다니면 안 되고, 덕분에 `SaveSlotState`의 schemaVersion을 올릴 일도 없다.
 *
 * 어느 함수도 던지지 않는다. localStorage는 사파리 비공개 모드나 저장 용량이 찬 경우
 * 접근만 해도 던지는데, 볼륨을 못 읽었다고 게임이 안 열리는 편이 훨씬 나쁘다.
 */

/** 이 모듈이 쓰는 부분만 추린 저장소다. 테스트가 대역을 넣는다. */
export type VolumeStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/** 저장된 볼륨을 읽는다. 없거나 알아볼 수 없으면 기본값이다. */
export function loadVolumeState(storage?: VolumeStorage): SoundVolumeState {
  const target = resolveStorage(storage);
  if (!target) {
    return createDefaultVolumeState();
  }

  try {
    const raw = target.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) {
      return createDefaultVolumeState();
    }

    return normalizeVolumeState(JSON.parse(raw));
  } catch {
    // 저장소가 막혔거나 JSON이 깨졌다. 둘 다 기본값으로 시작하면 된다.
    return createDefaultVolumeState();
  }
}

/** 볼륨을 저장한다. 실패해도 조용히 넘어간다. */
export function saveVolumeState(state: SoundVolumeState, storage?: VolumeStorage): void {
  const target = resolveStorage(storage);
  if (!target) {
    return;
  }

  try {
    target.setItem(VOLUME_STORAGE_KEY, serializeVolumeState(state));
  } catch {
    // 용량이 찼거나 저장이 막혔다. 이번 판에는 소리가 그대로 나므로 넘어간다.
  }
}

function resolveStorage(storage?: VolumeStorage): VolumeStorage | null {
  if (storage) {
    return storage;
  }

  try {
    // 접근 자체가 던지는 환경이 있다. 읽는 것부터 감싼다.
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
