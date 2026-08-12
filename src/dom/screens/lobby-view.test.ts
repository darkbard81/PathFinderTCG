import { describe, expect, it } from 'vitest';
import { createDefaultLobbyState } from '../../game/lobby/lobby-state';
import {
  buildStandingStyleVariables,
  filterUsableStandingSources,
  formatResourceAmount,
  readStandingMediaType,
  resolveStandingPlaybackTime,
  supportsAlphaWebm,
} from './lobby-view';

const AGENTS = {
  steamOsChrome: {
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    maxTouchPoints: 0,
  },
  macChrome: {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    maxTouchPoints: 0,
  },
  windowsEdge: {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    maxTouchPoints: 0,
  },
  firefox: {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
    maxTouchPoints: 0,
  },
  androidChrome: {
    userAgent:
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    maxTouchPoints: 5,
  },
  macSafari: {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
    maxTouchPoints: 0,
  },
  iphoneSafari: {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
  },
  iphoneChrome: {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
  },
  ipadOsDisguised: {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
    maxTouchPoints: 5,
  },
} as const;

describe('supportsAlphaWebm', () => {
  it('WebKit이 아닌 브라우저는 webm을 쓴다', () => {
    expect(supportsAlphaWebm(AGENTS.steamOsChrome)).toBe(true);
    expect(supportsAlphaWebm(AGENTS.macChrome)).toBe(true);
    expect(supportsAlphaWebm(AGENTS.windowsEdge)).toBe(true);
    expect(supportsAlphaWebm(AGENTS.firefox)).toBe(true);
    expect(supportsAlphaWebm(AGENTS.androidChrome)).toBe(true);
  });

  it('Safari와 iOS는 webm을 쓰지 않는다', () => {
    expect(supportsAlphaWebm(AGENTS.macSafari)).toBe(false);
    expect(supportsAlphaWebm(AGENTS.iphoneSafari)).toBe(false);
  });

  it('iOS는 브라우저 이름과 무관하게 걸러낸다', () => {
    // iOS의 Chrome도 WebKit이라 알파 webm을 못 그린다.
    expect(supportsAlphaWebm(AGENTS.iphoneChrome)).toBe(false);
  });

  it('데스크톱으로 위장한 iPadOS를 터치 지원으로 갈라낸다', () => {
    expect(supportsAlphaWebm(AGENTS.ipadOsDisguised)).toBe(false);
    // 같은 UA라도 터치가 없으면 진짜 맥이다. 그래도 Safari라 걸러진다.
    expect(supportsAlphaWebm({ ...AGENTS.ipadOsDisguised, maxTouchPoints: 0 })).toBe(false);
  });
});

describe('filterUsableStandingSources', () => {
  const sources = ['a/leader.webm', 'a/leader.mov', 'a/leader.webp'];

  it('쓸 수 있는 곳에서는 순서를 그대로 둔다', () => {
    expect(filterUsableStandingSources(sources, AGENTS.steamOsChrome)).toEqual(sources);
  });

  it('Safari에서는 webm만 빼고 mov가 먼저 온다', () => {
    expect(filterUsableStandingSources(sources, AGENTS.iphoneSafari)).toEqual([
      'a/leader.mov',
      'a/leader.webp',
    ]);
  });

  it('동영상과 이미지 선택에 맞는 후보만 남긴다', () => {
    expect(filterUsableStandingSources(sources, AGENTS.steamOsChrome, 'video')).toEqual([
      'a/leader.webm',
      'a/leader.mov',
    ]);
    expect(filterUsableStandingSources(sources, AGENTS.steamOsChrome, 'image')).toEqual([
      'a/leader.webp',
    ]);
  });

  it('Safari의 동영상 선택에서도 지원하지 않는 webm을 제외한다', () => {
    expect(filterUsableStandingSources(sources, AGENTS.macSafari, 'video')).toEqual([
      'a/leader.mov',
    ]);
  });
});

describe('readStandingMediaType', () => {
  it('select가 돌려준 동영상과 이미지 값을 그대로 옮긴다', () => {
    expect(readStandingMediaType('video')).toBe('video');
    expect(readStandingMediaType('image')).toBe('image');
    expect(readStandingMediaType('auto')).toBe('auto');
  });

  it('모르는 값은 자동으로 접는다', () => {
    expect(readStandingMediaType('')).toBe('auto');
    expect(readStandingMediaType('audio')).toBe('auto');
  });
});

describe('buildStandingStyleVariables', () => {
  it('기본 설정은 저장 데이터로 올라오기 전 하드코딩과 같은 배치를 낸다', () => {
    expect(buildStandingStyleVariables(createDefaultLobbyState())).toEqual({
      '--pf-lobby-standing-position-x': '56%',
      '--pf-lobby-standing-position-y': '0%',
      '--pf-lobby-standing-height': '100%',
    });
  });

  it('음수 세로 위치도 부호를 살려 백분율로 낸다', () => {
    expect(
      buildStandingStyleVariables({
        ...createDefaultLobbyState(),
        standingPositionX: 20,
        standingPositionY: -100,
        standingScale: 25,
      }),
    ).toEqual({
      '--pf-lobby-standing-position-x': '20%',
      '--pf-lobby-standing-position-y': '-100%',
      '--pf-lobby-standing-height': '25%',
    });
  });
});

describe('resolveStandingPlaybackTime', () => {
  it('같은 영상이면 마지막 재생 위치를 복원한다', () => {
    expect(
      resolveStandingPlaybackTime('cards/leader.webm', {
        source: 'cards/leader.webm',
        currentTime: 12.5,
      }),
    ).toBe(12.5);
  });

  it('영상이 다르거나 위치가 유효하지 않으면 처음부터 재생한다', () => {
    expect(
      resolveStandingPlaybackTime('cards/other.webm', {
        source: 'cards/leader.webm',
        currentTime: 12.5,
      }),
    ).toBe(0);
    expect(
      resolveStandingPlaybackTime('cards/leader.webm', {
        source: 'cards/leader.webm',
        currentTime: Number.NaN,
      }),
    ).toBe(0);
  });
});

describe('resource amount formatting', () => {
  it('groups thousands with commas', () => {
    expect(formatResourceAmount(125_680)).toBe('125,680');
    expect(formatResourceAmount(8_420)).toBe('8,420');
    expect(formatResourceAmount(1_000_000)).toBe('1,000,000');
  });

  it('leaves short amounts alone', () => {
    expect(formatResourceAmount(0)).toBe('0');
    expect(formatResourceAmount(12)).toBe('12');
    expect(formatResourceAmount(999)).toBe('999');
  });

  it('puts the first separator at the fourth digit', () => {
    expect(formatResourceAmount(1_000)).toBe('1,000');
    expect(formatResourceAmount(10_000)).toBe('10,000');
  });
});
