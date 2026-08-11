import { describe, expect, it } from 'vitest';
import { DEFAULT_LOBBY_BACKGROUND_ID, LOBBY_BACKGROUNDS } from './backgrounds';
import { createDefaultLobbyState, normalizeLobbyState } from './lobby-state';

describe('createDefaultLobbyState', () => {
  it('처음부터 보유하는 배경만 담고 기본 배경을 고른다', () => {
    const state = createDefaultLobbyState();

    expect(state.ownedBackgroundIds).toEqual(
      LOBBY_BACKGROUNDS.filter((background) => background.ownedFromStart).map(
        (background) => background.id,
      ),
    );
    expect(state.selectedBackgroundId).toBe(DEFAULT_LOBBY_BACKGROUND_ID);
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
  });
});
