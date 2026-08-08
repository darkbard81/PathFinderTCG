import type { BattleSlotId, BattlefieldZone } from '../../game/battle/types';

/**
 * 화면 위에서 왼쪽부터 오른쪽 순서다.
 * battle-engine의 슬롯 좌표가 FR=0, FC=1, FL=2 이므로 그 x 순서를 그대로 쓴다.
 * 이래야 후위 열이 같은 x의 전위 열 바로 뒤에 놓여 인접 판정이 눈에 보이는 대로 맞는다.
 */
const FRONT_ZONES: readonly BattlefieldZone[] = ['FR', 'FC', 'FL'];
const BACK_ZONES: readonly BattlefieldZone[] = ['BR', 'BC', 'BL'];

/** 보드는 위에서 아래로 적 후위 → 적 전위 → 내 전위 → 내 후위 순서다. 전위끼리 구분선을 사이에 두고 마주 본다. */
export type BattleRowId = 'enemyBack' | 'enemyFront' | 'playerFront' | 'playerBack';

export const BATTLE_ROW_IDS: readonly BattleRowId[] = [
  'enemyBack',
  'enemyFront',
  'playerFront',
  'playerBack',
];

/** 행 하나가 담는 전장 슬롯 3개를 화면 왼쪽부터 순서대로 돌려준다. */
export function listRowSlotIds(row: BattleRowId): BattleSlotId[] {
  const side = row.startsWith('enemy') ? 'enemy' : 'player';
  const zones = row.endsWith('Back') ? BACK_ZONES : FRONT_ZONES;

  return zones.map((zone) => `${side}:${zone}` as BattleSlotId);
}

export type BattleBoardMetrics = {
  cardWidth: number;
  cardHeight: number;
  gap: number;
  dividerHeight: number;
  paddingY: number;
  railWidth: number;
  /** 레일과 화면 가장자리 사이 여백이다. 레일이 실제로 놓이는 x 좌표도 이 값이다. */
  railMargin: number;
  /** 레일과 보드 사이 간격이다. 이만큼을 예산에서 먼저 빼야 레일이 더미 열을 덮지 않는다. */
  railGap: number;
  /** 접힌 손패가 보드 아래에서 내미는 높이다. 카드 위쪽 코스트·지배력 수정구슬이 걸치도록 잡는다. */
  handPeekHeight: number;
  boardWidth: number;
};

const ROW_COUNT = 4;
/** 좌우로 추방·묘지 더미 열 1, 슬롯 3열, 덱 더미 열 1을 합친 값이다. */
const COLUMN_COUNT = 5;
const GAP = 8;
const DIVIDER_HEIGHT = 10;
const PADDING_Y = 10;
const RAIL_MARGIN = 12;
const RAIL_GAP = 12;
const MIN_RAIL_WIDTH = 168;
const MAX_RAIL_WIDTH = 264;
const MIN_CARD_WIDTH = 80;
const MAX_CARD_WIDTH = 160;
/**
 * 카드 높이 대비 엿보기 높이 비율이다.
 * 수정구슬 중심이 카드 높이의 8.854% 지점이라 그 위아래로 글자가 다 들어가도록 넉넉히 잡았다.
 */
const HAND_PEEK_RATIO = 0.26;

/**
 * 논리 뷰포트에서 전장 보드 한 벌의 실제 픽셀 크기를 계산한다.
 *
 * 가로는 `여백 + 레일 + 간격 + 보드 + 간격 + 레일 + 여백`으로 정확히 나눠 갖는다.
 * 그래서 카드 크기를 정할 때 최소 레일 폭과 두 간격을 먼저 예산에서 빼고,
 * 남은 폭을 나중에 레일에 돌려준다. 이 순서를 지켜야 레일이 더미 열 위로 넘어오지 않는다.
 * 세로는 4행과 엿보기 손패가 예산을 나눠 쓰며, 보통 이쪽이 카드 크기를 먼저 결정한다.
 */
export function resolveBattleBoardMetrics(viewport: {
  width: number;
  height: number;
}): BattleBoardMetrics {
  const verticalBudget = viewport.height - PADDING_Y * 2 - DIVIDER_HEIGHT - GAP * (ROW_COUNT - 2);
  // 엿보기 높이가 카드 높이에 비례하므로 행 수에 비율을 더해 한 번에 푼다.
  const heightBoundCardWidth = ((verticalBudget / (ROW_COUNT + HAND_PEEK_RATIO)) * 2) / 3;

  const sideReserve = RAIL_MARGIN + RAIL_GAP + MIN_RAIL_WIDTH;
  const boardBudget = viewport.width - sideReserve * 2 - GAP * (COLUMN_COUNT - 1);
  const widthBoundCardWidth = boardBudget / COLUMN_COUNT;

  // 카드 폭을 내림으로 확정해야 보드 폭이 예산을 넘지 않는다. 높이는 거기서 2:3으로 되돌린다.
  const cardWidth = clamp(
    Math.floor(Math.min(heightBoundCardWidth, widthBoundCardWidth)),
    MIN_CARD_WIDTH,
    MAX_CARD_WIDTH,
  );
  const cardHeight = Math.round((cardWidth * 3) / 2);
  const boardWidth = cardWidth * COLUMN_COUNT + GAP * (COLUMN_COUNT - 1);

  return {
    cardWidth,
    cardHeight,
    gap: GAP,
    dividerHeight: DIVIDER_HEIGHT,
    paddingY: PADDING_Y,
    railWidth: clamp(
      Math.floor((viewport.width - boardWidth) / 2) - RAIL_MARGIN - RAIL_GAP,
      0,
      MAX_RAIL_WIDTH,
    ),
    railMargin: RAIL_MARGIN,
    railGap: RAIL_GAP,
    handPeekHeight: Math.round(cardHeight * HAND_PEEK_RATIO),
    boardWidth,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
