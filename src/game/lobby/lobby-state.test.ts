import { describe, expect, it } from 'vitest';
import { DEFAULT_LOBBY_BACKGROUND_ID, LOBBY_BACKGROUNDS } from './backgrounds';
import {
  createDefaultLobbyState,
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
