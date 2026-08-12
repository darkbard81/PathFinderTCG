import {
  DEFAULT_LOBBY_BACKGROUND_ID,
  isKnownLobbyBackgroundId,
  listStarterLobbyBackgroundIds,
} from './backgrounds';

export const DEFAULT_LOBBY_STANDING_VISIBLE = true;
export const DEFAULT_LOBBY_STANDING_POSITION_X = 56;
export const DEFAULT_LOBBY_STANDING_POSITION_Y = 0;
export const DEFAULT_LOBBY_STANDING_SCALE = 100;
export const LOBBY_STANDING_MEDIA_TYPES = ['auto', 'video', 'image'] as const;
export type LobbyStandingMediaType = (typeof LOBBY_STANDING_MEDIA_TYPES)[number];
export const DEFAULT_LOBBY_STANDING_MEDIA_TYPE: LobbyStandingMediaType = 'auto';
export const LOBBY_STANDING_POSITION_X_RANGE = { min: 0, max: 100 } as const;
export const LOBBY_STANDING_POSITION_Y_RANGE = { min: -100, max: 100 } as const;
export const LOBBY_STANDING_SCALE_RANGE = { min: 25, max: 200 } as const;

/** 저장 슬롯이 들고 다니는 로비 꾸미기 상태다. */
export type LobbyState = {
  /** 보유한 배경 id 목록이다. */
  ownedBackgroundIds: string[];
  /** 지금 쓰는 배경 id다. 보유 목록 안에 있어야 한다. */
  selectedBackgroundId: string;
  /** 리더 standing을 로비에 표시할지다. */
  standingVisible: boolean;
  /** 리더 standing에 쓸 동영상·이미지 선택 방식이다. */
  standingMediaType: LobbyStandingMediaType;
  /** 리더 standing 중심의 가로 위치다. 로비 너비에 대한 백분율이다. */
  standingPositionX: number;
  /** 리더 standing의 바닥 기준 세로 이동량이다. 양수면 위로 올라간다. */
  standingPositionY: number;
  /** 원본 높이 대비 standing 크기 백분율이다. */
  standingScale: number;
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
    standingVisible: DEFAULT_LOBBY_STANDING_VISIBLE,
    standingMediaType: DEFAULT_LOBBY_STANDING_MEDIA_TYPE,
    standingPositionX: DEFAULT_LOBBY_STANDING_POSITION_X,
    standingPositionY: DEFAULT_LOBBY_STANDING_POSITION_Y,
    standingScale: DEFAULT_LOBBY_STANDING_SCALE,
  };
}

/**
 * 저장 파일에서 읽은 로비 상태를 현재 런타임 타입으로 정규화한다.
 *
 * schemaVersion 4 이하에는 로비가 없고, 6 이하에는 standing 설정,
 * 7에는 세로 위치, 8에는 미디어 선택 방식이 없으므로 누락한 필드는 기본값을 준다.
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

  const standingVisible = readBooleanOrDefault(
    value.standingVisible,
    DEFAULT_LOBBY_STANDING_VISIBLE,
    'lobby.standingVisible',
  );
  const standingMediaType =
    value.standingMediaType === undefined
      ? DEFAULT_LOBBY_STANDING_MEDIA_TYPE
      : readLobbyStandingMediaType(value.standingMediaType);
  const standingPositionX = readNumberInRangeOrDefault(
    value.standingPositionX,
    DEFAULT_LOBBY_STANDING_POSITION_X,
    LOBBY_STANDING_POSITION_X_RANGE,
    'lobby.standingPositionX',
  );
  const standingPositionY = readNumberInRangeOrDefault(
    value.standingPositionY,
    DEFAULT_LOBBY_STANDING_POSITION_Y,
    LOBBY_STANDING_POSITION_Y_RANGE,
    'lobby.standingPositionY',
  );
  const standingScale = readNumberInRangeOrDefault(
    value.standingScale,
    DEFAULT_LOBBY_STANDING_SCALE,
    LOBBY_STANDING_SCALE_RANGE,
    'lobby.standingScale',
  );

  const starters = listStarterLobbyBackgroundIds();
  const ownedBackgroundIds = [
    ...new Set([...starters, ...value.ownedBackgroundIds.filter(isKnownLobbyBackgroundId)]),
  ];
  const selectedBackgroundId = ownedBackgroundIds.includes(value.selectedBackgroundId)
    ? value.selectedBackgroundId
    : DEFAULT_LOBBY_BACKGROUND_ID;

  return {
    ownedBackgroundIds,
    selectedBackgroundId,
    standingVisible,
    standingMediaType,
    standingPositionX,
    standingPositionY,
    standingScale,
  };
}

/** 외부 입력이 지원하는 standing 미디어 선택인지 확인한다. */
export function isLobbyStandingMediaType(value: unknown): value is LobbyStandingMediaType {
  return LOBBY_STANDING_MEDIA_TYPES.some((mediaType) => mediaType === value);
}

function readLobbyStandingMediaType(value: unknown): LobbyStandingMediaType {
  if (!isLobbyStandingMediaType(value)) {
    throw new Error(`lobby.standingMediaType must be ${LOBBY_STANDING_MEDIA_TYPES.join(', ')}`);
  }
  return value;
}

function readBooleanOrDefault(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function readNumberInRangeOrDefault(
  value: unknown,
  fallback: number,
  range: { min: number; max: number },
  field: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  if (value < range.min || value > range.max) {
    throw new Error(`${field} must be between ${range.min} and ${range.max}`);
  }
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}
