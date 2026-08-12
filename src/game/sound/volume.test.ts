import { describe, expect, it } from 'vitest';
import {
  clampLevel,
  createDefaultVolumeState,
  decibelToGain,
  levelToGain,
  normalizeVolumeState,
  resolveChannelGain,
  serializeVolumeState,
  VOLUME_SCHEMA_VERSION,
} from './volume';

describe('levelToGain', () => {
  it('양 끝은 그대로 0과 1이다', () => {
    expect(levelToGain(0)).toBe(0);
    expect(levelToGain(100)).toBe(1);
  });

  it('절반은 선형이 아니라 제곱 곡선을 따른다', () => {
    // 선형이면 0.5다. 그러면 절반으로 들리지 않는다.
    expect(levelToGain(50)).toBeCloseTo(0.25, 5);
    // 약 -12dB다.
    expect(20 * Math.log10(levelToGain(50))).toBeCloseTo(-12.04, 1);
  });

  it('범위 밖 값은 잘라 낸다', () => {
    expect(levelToGain(-30)).toBe(0);
    expect(levelToGain(400)).toBe(1);
    expect(levelToGain(Number.NaN)).toBe(0);
  });
});

describe('decibelToGain', () => {
  it('0dB는 그대로, -6dB는 약 절반이다', () => {
    expect(decibelToGain(0)).toBe(1);
    expect(decibelToGain(-6)).toBeCloseTo(0.501, 3);
    expect(decibelToGain(-20)).toBeCloseTo(0.1, 5);
  });

  it('양수 게인은 1을 넘긴다. <audio>.volume으로는 못 하는 일이다', () => {
    expect(decibelToGain(6)).toBeGreaterThan(1);
  });
});

describe('resolveChannelGain', () => {
  it('음소거면 level과 무관하게 0이다', () => {
    const state = createDefaultVolumeState();
    state.bgm = { level: 100, muted: true };

    expect(resolveChannelGain(state, 'bgm')).toBe(0);
  });

  it('음소거가 아니면 곡선을 씌운 값이다', () => {
    const state = createDefaultVolumeState();
    state.sfx = { level: 50, muted: false };

    expect(resolveChannelGain(state, 'sfx')).toBeCloseTo(0.25, 5);
  });
});

describe('normalizeVolumeState', () => {
  it('저장한 값을 되읽는다', () => {
    const state = createDefaultVolumeState();
    state.bgm = { level: 35, muted: true };

    expect(normalizeVolumeState(JSON.parse(serializeVolumeState(state)))).toEqual(state);
  });

  it('알아볼 수 없는 값은 기본값으로 되돌린다', () => {
    for (const value of [null, undefined, 'nope', [], {}, { schemaVersion: 99 }]) {
      expect(normalizeVolumeState(value)).toEqual(createDefaultVolumeState());
    }
  });

  it('일부 채널만 저장돼 있어도 나머지는 기본값으로 채운다', () => {
    const normalized = normalizeVolumeState({
      schemaVersion: VOLUME_SCHEMA_VERSION,
      channels: { bgm: { level: 10 } },
    });

    expect(normalized.bgm).toEqual({ level: 10, muted: false });
    expect(normalized.master).toEqual(createDefaultVolumeState().master);
  });

  it('범위를 벗어나거나 형이 틀린 값을 안전하게 다룬다', () => {
    const normalized = normalizeVolumeState({
      schemaVersion: VOLUME_SCHEMA_VERSION,
      channels: {
        bgm: { level: 999, muted: 'yes' },
        sfx: { level: -20 },
        voice: { level: '80' },
      },
    });

    expect(normalized.bgm).toEqual({ level: 100, muted: false });
    expect(normalized.sfx).toEqual({ level: 0, muted: false });
    expect(normalized.voice.level).toBe(createDefaultVolumeState().voice.level);
  });
});

describe('clampLevel', () => {
  it('정수로 자른다', () => {
    expect(clampLevel(63.4)).toBe(63);
    expect(clampLevel(63.6)).toBe(64);
  });
});

describe('createDefaultVolumeState', () => {
  it('음악만 낮게 시작한다. 대사를 덮지 않게 한다', () => {
    const state = createDefaultVolumeState();

    expect(state.bgm.level).toBeLessThan(state.voice.level);
    expect(state.master.level).toBe(100);
    expect(Object.values(state).every((channel) => !channel.muted)).toBe(true);
  });

  it('호출마다 새 객체를 준다', () => {
    const first = createDefaultVolumeState();
    first.bgm.level = 1;

    expect(createDefaultVolumeState().bgm.level).not.toBe(1);
  });
});
