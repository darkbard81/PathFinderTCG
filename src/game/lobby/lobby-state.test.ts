import { describe, expect, it } from 'vitest';
import { DEFAULT_LOBBY_BACKGROUND_ID, LOBBY_BACKGROUNDS } from './backgrounds';
import {
  createDefaultLobbyState,
  DEFAULT_LOBBY_BGM_PLAY_MODE,
  LOBBY_BGM_TRACK_LIMIT,
  DEFAULT_LOBBY_STANDING_MEDIA_TYPE,
  DEFAULT_LOBBY_STANDING_POSITION_X,
  DEFAULT_LOBBY_STANDING_POSITION_Y,
  DEFAULT_LOBBY_STANDING_SCALE,
  normalizeLobbyState,
} from './lobby-state';

describe('createDefaultLobbyState', () => {
  it('처음부터 보유하는 배경만 담고 기본 배경을 고른다', () => {
    const state = createDefaultLobbyState();

    expect(state.ownedBackgroundIds).toEqual(
      LOBBY_BACKGROUNDS.filter((background) => background.ownedFromStart).map(
        (background) => background.id,
      ),
    );
    expect(state.selectedBackgroundId).toBe(DEFAULT_LOBBY_BACKGROUND_ID);
    expect(state).toMatchObject({
      standingVisible: true,
      standingMediaType: DEFAULT_LOBBY_STANDING_MEDIA_TYPE,
      standingPositionX: DEFAULT_LOBBY_STANDING_POSITION_X,
      standingPositionY: DEFAULT_LOBBY_STANDING_POSITION_Y,
      standingScale: DEFAULT_LOBBY_STANDING_SCALE,
    });
  });

  it('호출마다 새 배열을 준다', () => {
    expect(createDefaultLobbyState().ownedBackgroundIds).not.toBe(
      createDefaultLobbyState().ownedBackgroundIds,
    );
  });
});

describe('normalizeLobbyState', () => {
  it('필드가 없던 schemaVersion 4 이하 저장본에 기본값을 준다', () => {
    expect(normalizeLobbyState(undefined)).toEqual(createDefaultLobbyState());
  });

  it('schemaVersion 6 이하의 standing 설정 누락을 기본값으로 채운다', () => {
    expect(
      normalizeLobbyState({
        ownedBackgroundIds: [DEFAULT_LOBBY_BACKGROUND_ID],
        selectedBackgroundId: DEFAULT_LOBBY_BACKGROUND_ID,
      }),
    ).toMatchObject({
      standingVisible: true,
      standingMediaType: DEFAULT_LOBBY_STANDING_MEDIA_TYPE,
      standingPositionX: DEFAULT_LOBBY_STANDING_POSITION_X,
      standingPositionY: DEFAULT_LOBBY_STANDING_POSITION_Y,
      standingScale: DEFAULT_LOBBY_STANDING_SCALE,
    });
  });

  it('저장된 standing 표시, 미디어 형식, 가로·세로 위치, 크기를 보존한다', () => {
    expect(
      normalizeLobbyState({
        ownedBackgroundIds: [DEFAULT_LOBBY_BACKGROUND_ID],
        selectedBackgroundId: DEFAULT_LOBBY_BACKGROUND_ID,
        standingVisible: false,
        standingMediaType: 'image',
        standingPositionX: 64,
        standingPositionY: 18,
        standingScale: 125,
      }),
    ).toMatchObject({
      standingVisible: false,
      standingMediaType: 'image',
      standingPositionX: 64,
      standingPositionY: 18,
      standingScale: 125,
    });
  });

  it('확장된 standing 가로·세로 위치와 크기의 경계값을 허용한다', () => {
    const base = {
      ownedBackgroundIds: [DEFAULT_LOBBY_BACKGROUND_ID],
      selectedBackgroundId: DEFAULT_LOBBY_BACKGROUND_ID,
    };

    expect(
      normalizeLobbyState({
        ...base,
        standingPositionX: 0,
        standingPositionY: -100,
        standingScale: 25,
      }),
    ).toMatchObject({ standingPositionX: 0, standingPositionY: -100, standingScale: 25 });
    expect(
      normalizeLobbyState({
        ...base,
        standingPositionX: 100,
        standingPositionY: 100,
        standingScale: 200,
      }),
    ).toMatchObject({ standingPositionX: 100, standingPositionY: 100, standingScale: 200 });
  });

  it('카탈로그에 없는 배경 id는 버린다', () => {
    const state = normalizeLobbyState({
      ownedBackgroundIds: [DEFAULT_LOBBY_BACKGROUND_ID, 'background_removed'],
      selectedBackgroundId: DEFAULT_LOBBY_BACKGROUND_ID,
    });

    expect(state.ownedBackgroundIds).not.toContain('background_removed');
  });

  it('보유하지 않은 배경을 고르고 있으면 기본 배경으로 되돌린다', () => {
    const state = normalizeLobbyState({
      ownedBackgroundIds: [DEFAULT_LOBBY_BACKGROUND_ID],
      selectedBackgroundId: 'background_removed',
    });

    expect(state.selectedBackgroundId).toBe(DEFAULT_LOBBY_BACKGROUND_ID);
  });

  it('처음부터 보유하는 배경은 저장본에 없어도 되살린다', () => {
    const state = normalizeLobbyState({
      ownedBackgroundIds: [],
      selectedBackgroundId: DEFAULT_LOBBY_BACKGROUND_ID,
    });

    expect(state.ownedBackgroundIds).toContain(DEFAULT_LOBBY_BACKGROUND_ID);
  });

  it('구조가 어긋나면 예외를 던진다', () => {
    expect(() => normalizeLobbyState({ ownedBackgroundIds: 'x' })).toThrow('lobby');
    expect(() => normalizeLobbyState({ ownedBackgroundIds: [], selectedBackgroundId: 1 })).toThrow(
      'lobby',
    );
    expect(() =>
      normalizeLobbyState({
        ownedBackgroundIds: [],
        selectedBackgroundId: DEFAULT_LOBBY_BACKGROUND_ID,
        standingPositionX: 101,
      }),
    ).toThrow('standingPositionX');
    expect(() =>
      normalizeLobbyState({
        ownedBackgroundIds: [],
        selectedBackgroundId: DEFAULT_LOBBY_BACKGROUND_ID,
        standingPositionY: -101,
      }),
    ).toThrow('standingPositionY');
    expect(() =>
      normalizeLobbyState({
        ownedBackgroundIds: [],
        selectedBackgroundId: DEFAULT_LOBBY_BACKGROUND_ID,
        standingScale: 201,
      }),
    ).toThrow('standingScale');
    expect(() =>
      normalizeLobbyState({
        ownedBackgroundIds: [],
        selectedBackgroundId: DEFAULT_LOBBY_BACKGROUND_ID,
        standingMediaType: 'audio',
      }),
    ).toThrow('standingMediaType');
  });
});

describe('로비 BGM 플레이리스트', () => {
  const base = {
    ownedBackgroundIds: [DEFAULT_LOBBY_BACKGROUND_ID],
    selectedBackgroundId: DEFAULT_LOBBY_BACKGROUND_ID,
  };

  it('schemaVersion 9 이하의 누락을 빈 목록과 순차 재생으로 채운다', () => {
    // 비어 있으면 로비 전용 곡이 없다는 뜻이고 Main BGM이 그대로 흐른다.
    expect(normalizeLobbyState(base)).toMatchObject({
      bgmTrackIds: [],
      bgmPlayMode: DEFAULT_LOBBY_BGM_PLAY_MODE,
    });
  });

  it('적은 순서를 그대로 재생 순서로 지킨다', () => {
    expect(
      normalizeLobbyState({ ...base, bgmTrackIds: ['neon-velocity', 'intro', 'comic'] })
        .bgmTrackIds,
    ).toEqual(['neon-velocity', 'intro', 'comic']);
  });

  it('같은 곡이 두 번 담기면 앞의 것만 남긴다', () => {
    // 두 번 있으면 다음 곡이 어디인지 정해지지 않고 셔플에서도 그 곡만 자주 나온다.
    expect(
      normalizeLobbyState({ ...base, bgmTrackIds: ['intro', 'comic', 'intro'] }).bgmTrackIds,
    ).toEqual(['intro', 'comic']);
  });

  it('없는 곡 id도 그대로 둔다', () => {
    // 곡 목록은 런타임 자산이라 저장 스키마가 알 수 없다. 거르는 일은 재생기가 맡는다.
    expect(normalizeLobbyState({ ...base, bgmTrackIds: ['사라진곡'] }).bgmTrackIds).toEqual([
      '사라진곡',
    ]);
  });

  it('셔플을 저장하고 되읽는다', () => {
    expect(normalizeLobbyState({ ...base, bgmPlayMode: 'shuffle' }).bgmPlayMode).toBe('shuffle');
  });

  it('구조가 어긋난 값을 거부한다', () => {
    expect(() => normalizeLobbyState({ ...base, bgmTrackIds: 'intro' })).toThrow('bgmTrackIds');
    expect(() => normalizeLobbyState({ ...base, bgmTrackIds: [1] })).toThrow('bgmTrackIds');
    expect(() => normalizeLobbyState({ ...base, bgmPlayMode: 'auto-reverse' })).toThrow(
      'bgmPlayMode',
    );
    expect(() =>
      normalizeLobbyState({
        ...base,
        bgmTrackIds: Array.from({ length: LOBBY_BGM_TRACK_LIMIT + 1 }, (_, index) => `t${index}`),
      }),
    ).toThrow('exceed');
  });
});
