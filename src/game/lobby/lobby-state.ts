import {
  DEFAULT_LOBBY_BACKGROUND_ID,
  isKnownLobbyBackgroundId,
  listStarterLobbyBackgroundIds,
} from './backgrounds';

/** 저장 슬롯이 들고 다니는 로비 꾸미기 상태다. */
export type LobbyState = {
  /** 보유한 배경 id 목록이다. */
  ownedBackgroundIds: string[];
  /** 지금 쓰는 배경 id다. 보유 목록 안에 있어야 한다. */
  selectedBackgroundId: string;
};

type JsonRecord = Record<string, unknown>;

/**
 * 새 저장 슬롯과 기존 저장 슬롯 보정에 사용할 기본 로비 상태를 만든다.
 * 배열을 매번 새로 만들어 호출자가 독립적으로 수정할 수 있게 한다.
 */
export function createDefaultLobbyState(): LobbyState {
  return {
    ownedBackgroundIds: listStarterLobbyBackgroundIds(),
    selectedBackgroundId: DEFAULT_LOBBY_BACKGROUND_ID,
  };
}

/**
 * 저장 파일에서 읽은 로비 상태를 현재 런타임 타입으로 정규화한다.
 *
 * schemaVersion 4 이하에는 이 필드가 없으므로 없으면 기본값을 준다.
 * 카탈로그에서 사라진 배경 id는 조용히 버린다. 배경 목록은 빌드마다 바뀔 수
 * 있는데, 옛 저장 파일 하나 때문에 로비를 못 여는 편이 더 나쁘다.
 */
export function normalizeLobbyState(value: unknown): LobbyState {
  if (value === undefined) {
    return createDefaultLobbyState();
  }

  if (!isRecord(value)) {
    throw new Error('lobby must be a lobby state');
  }

  if (
    !Array.isArray(value.ownedBackgroundIds) ||
    !value.ownedBackgroundIds.every((backgroundId) => typeof backgroundId === 'string')
  ) {
    throw new Error('lobby.ownedBackgroundIds must be a string array');
  }

  if (typeof value.selectedBackgroundId !== 'string') {
    throw new Error('lobby.selectedBackgroundId must be a string');
  }

  const starters = listStarterLobbyBackgroundIds();
  const ownedBackgroundIds = [
    ...new Set([...starters, ...value.ownedBackgroundIds.filter(isKnownLobbyBackgroundId)]),
  ];
  const selectedBackgroundId = ownedBackgroundIds.includes(value.selectedBackgroundId)
    ? value.selectedBackgroundId
    : DEFAULT_LOBBY_BACKGROUND_ID;

  return { ownedBackgroundIds, selectedBackgroundId };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}
