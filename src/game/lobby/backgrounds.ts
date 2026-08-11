/** 로비 배경 하나의 정의다. */
export type LobbyBackgroundDefinition = {
  id: string;
  name: string;
  /** assetBaseUrl 아래의 상대 경로다. */
  path: string;
  /** 새 저장 슬롯이 처음부터 갖고 시작하는 배경인지 여부다. */
  ownedFromStart: boolean;
};

/**
 * 고를 수 있는 로비 배경 목록이다.
 *
 * 배경은 나중에 상점에서 사는 물건이 된다. 지금은 재화도 상점도 없어서
 * 처음부터 보유한 것만 두고, 저장 데이터에는 보유 목록과 선택만 남긴다.
 * 상점이 생기면 여기에 ownedFromStart가 false인 항목을 더하면 된다.
 */
export const LOBBY_BACKGROUNDS: readonly LobbyBackgroundDefinition[] = [
  {
    id: 'background_01',
    name: '초원의 성채',
    path: 'ui/background/background_01.png',
    ownedFromStart: true,
  },
  {
    id: 'background_02',
    name: '고대 유적의 문',
    path: 'ui/background/background_02.png',
    // 상점이 없어 아직은 둘 다 처음부터 갖는다. 상점이 생기면 이쪽을 false로 돌린다.
    ownedFromStart: true,
  },
];

export const DEFAULT_LOBBY_BACKGROUND_ID = 'background_01';

const BACKGROUND_BY_ID = new Map(
  LOBBY_BACKGROUNDS.map((background) => [background.id, background]),
);

export function findLobbyBackground(backgroundId: string): LobbyBackgroundDefinition | null {
  return BACKGROUND_BY_ID.get(backgroundId) ?? null;
}

export function isKnownLobbyBackgroundId(backgroundId: string): boolean {
  return BACKGROUND_BY_ID.has(backgroundId);
}

/** 새 저장 슬롯이 처음부터 보유하는 배경 id 목록이다. */
export function listStarterLobbyBackgroundIds(): string[] {
  return LOBBY_BACKGROUNDS.filter((background) => background.ownedFromStart).map(
    (background) => background.id,
  );
}
