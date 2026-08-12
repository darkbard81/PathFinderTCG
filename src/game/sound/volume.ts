/**
 * 채널 볼륨 상태와 게인 변환이다.
 *
 * 볼륨은 저장 슬롯이 아니라 기기에 저장한다. 스피커냐 헤드폰이냐는 기기 특성이라
 * 슬롯을 따라다니면 안 된다. 그래서 `SaveSlotState`가 아니라 localStorage에 둔다.
 */

export const VOLUME_CHANNELS = ['master', 'bgm', 'sfx', 'voice'] as const;
export type VolumeChannel = (typeof VOLUME_CHANNELS)[number];

/** 슬라이더가 쓰는 정수 범위다. 게인은 재생할 때 곡선을 씌워 만든다. */
export const VOLUME_LEVEL_RANGE = { min: 0, max: 100 } as const;

/** localStorage 키다. 저장 슬롯과 무관하므로 계정이나 슬롯을 섞지 않는다. */
export const VOLUME_STORAGE_KEY = 'pf-sound-volume';

export const VOLUME_SCHEMA_VERSION = 1 as const;

/**
 * 채널 기본 볼륨이다.
 *
 * bgm만 낮게 시작한다. 트랙별 보정 게인이 모든 소리를 같은 기준(-16 LUFS)으로 맞춰
 * 두었으므로, 그대로 두면 음악이 대사와 같은 크기로 나와 대사를 덮는다.
 * 음악은 다른 소리 밑에 깔리는 것이 제자리다.
 */
export const DEFAULT_VOLUME_LEVELS: Record<VolumeChannel, number> = {
  master: 100,
  bgm: 60,
  sfx: 100,
  voice: 100,
};

export type ChannelVolume = {
  /** 0~100 정수다. */
  level: number;
  /**
   * 음소거는 level과 따로 둔다.
   * level을 0으로 덮으면 음소거를 풀 때 원래 값을 잃는다.
   */
  muted: boolean;
};

export type SoundVolumeState = Record<VolumeChannel, ChannelVolume>;

export function createDefaultVolumeState(): SoundVolumeState {
  return {
    master: { level: DEFAULT_VOLUME_LEVELS.master, muted: false },
    bgm: { level: DEFAULT_VOLUME_LEVELS.bgm, muted: false },
    sfx: { level: DEFAULT_VOLUME_LEVELS.sfx, muted: false },
    voice: { level: DEFAULT_VOLUME_LEVELS.voice, muted: false },
  };
}

/**
 * 슬라이더 값을 게인으로 바꾼다.
 *
 * 제곱 곡선을 쓴다. 게인에 선형으로 걸면 50%가 절반으로 들리지 않는다. 청감은
 * 로그에 가까워서, 선형 슬라이더는 위쪽 절반에서 거의 변화가 없고 아래쪽에서
 * 급격히 줄어드는 것처럼 느껴진다. 제곱이면 50%가 약 -12dB로 자연스럽게 떨어진다.
 */
export function levelToGain(level: number): number {
  const clamped = clampLevel(level);
  const ratio = clamped / VOLUME_LEVEL_RANGE.max;
  return ratio * ratio;
}

/** 채널이 실제로 낼 게인이다. 음소거면 곡선과 무관하게 0이다. */
export function resolveChannelGain(state: SoundVolumeState, channel: VolumeChannel): number {
  const channelVolume = state[channel];
  return channelVolume.muted ? 0 : levelToGain(channelVolume.level);
}

/**
 * 플레이리스트의 보정 게인(dB)을 선형 게인으로 바꾼다.
 * 트랙마다 다른 녹음 크기를 기준 라우드니스에 맞추는 값이다.
 */
export function decibelToGain(decibel: number): number {
  return 10 ** (decibel / 20);
}

/** 슬라이더가 범위를 벗어난 값을 넘겨도 안전하게 자른다. */
export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return VOLUME_LEVEL_RANGE.min;
  }

  return Math.min(VOLUME_LEVEL_RANGE.max, Math.max(VOLUME_LEVEL_RANGE.min, Math.round(level)));
}

/**
 * localStorage에서 읽은 값을 현재 구조로 정규화한다.
 *
 * 사용자가 직접 고칠 수 있는 저장소라 무엇이 들어 있어도 이상하지 않다.
 * 저장 데이터와 달리 여기서는 던지지 않는다. 볼륨 하나 때문에 게임이 안 열리는 편이
 * 더 나쁘다. 알아볼 수 없는 값은 기본값으로 되돌린다.
 */
export function normalizeVolumeState(value: unknown): SoundVolumeState {
  const state = createDefaultVolumeState();
  if (!isRecord(value) || value.schemaVersion !== VOLUME_SCHEMA_VERSION) {
    return state;
  }

  const channels = value.channels;
  if (!isRecord(channels)) {
    return state;
  }

  for (const channel of VOLUME_CHANNELS) {
    const stored = channels[channel];
    if (!isRecord(stored)) {
      continue;
    }

    if (typeof stored.level === 'number' && Number.isFinite(stored.level)) {
      state[channel].level = clampLevel(stored.level);
    }
    if (typeof stored.muted === 'boolean') {
      state[channel].muted = stored.muted;
    }
  }

  return state;
}

/** localStorage에 넣을 모양으로 바꾼다. */
export function serializeVolumeState(state: SoundVolumeState): string {
  return JSON.stringify({ schemaVersion: VOLUME_SCHEMA_VERSION, channels: state });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
