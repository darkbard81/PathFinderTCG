/** 카드와 패널 사이, 그리고 화면 가장자리와의 최소 간격이다. */
const EDGE_GAP = 8;

export type PlacementRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PlacementSize = {
  width: number;
  height: number;
};

export type Placement = {
  left: number;
  top: number;
};

/**
 * 떠 있는 상세 패널을 카드 옆에 놓을 자리를 정한다.
 *
 * 카드 오른쪽을 먼저 본다. 오른쪽이 모자라면 왼쪽으로 뒤집고, 양쪽 다 모자라면
 * 화면 안으로 밀어 넣는다. 뒤집기만 하고 밀어 넣지 않으면 좁은 화면에서 패널이
 * 화면 밖으로 나가 읽을 수 없게 된다.
 *
 * 좌표는 모두 논리 좌표다. 호출자가 zoom을 되돌린 값을 넘긴다.
 */
export function resolveDetailPlacement(
  anchor: PlacementRect,
  panel: PlacementSize,
  screen: PlacementSize,
): Placement {
  const rightOf = anchor.left + anchor.width + EDGE_GAP;
  const leftOf = anchor.left - EDGE_GAP - panel.width;
  const fitsRight = rightOf + panel.width <= screen.width - EDGE_GAP;
  const useRight = fitsRight || leftOf < EDGE_GAP;

  return {
    left: clamp(useRight ? rightOf : leftOf, screen.width, panel.width),
    // 카드 윗변에 맞춘다. 아래로 넘치면 위로 끌어올린다.
    top: clamp(anchor.top, screen.height, panel.height),
  };
}

/**
 * 패널이 화면 안에 있도록 값을 가둔다.
 * 패널이 화면보다 크면 가둘 수 없으므로 시작 간격에 붙여 앞쪽부터 보이게 한다.
 */
function clamp(value: number, screenLength: number, panelLength: number): number {
  const max = screenLength - panelLength - EDGE_GAP;

  return max <= EDGE_GAP ? EDGE_GAP : Math.min(Math.max(value, EDGE_GAP), max);
}
