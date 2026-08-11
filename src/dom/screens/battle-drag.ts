import type { BattleSlotId } from '../../game/battle/types';

/** 이만큼 움직이기 전에는 드래그로 보지 않는다. 손이 떨려도 클릭이 드래그로 바뀌지 않게 한다. */
const DRAG_THRESHOLD = 6;

export type SlotBounds = {
  slotId: BattleSlotId;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type LogicalPoint = { x: number; y: number };

/**
 * 화면 좌표가 어느 칸 위인지 찾는다.
 * 칸 사각형은 드래그를 시작할 때 한 번만 재고 그 뒤로는 다시 재지 않는다.
 * 드래그 중에는 보드가 다시 그려지지 않으므로 스냅숏이 계속 유효하다.
 */
export function findSlotAtPoint(
  bounds: readonly SlotBounds[],
  clientX: number,
  clientY: number,
): BattleSlotId | null {
  return (
    bounds.find(
      (slot) =>
        clientX >= slot.left &&
        clientX < slot.right &&
        clientY >= slot.top &&
        clientY < slot.bottom,
    )?.slotId ?? null
  );
}

/**
 * 화면 좌표를 오버레이 논리 좌표로 되돌린다.
 * 오버레이 루트는 CSS `zoom`으로 줄어 있어서, 실측 폭과 논리 폭의 비가 그 배율이다.
 */
export function toLogicalPoint(
  rootBounds: { left: number; top: number; width: number },
  logicalWidth: number,
  clientX: number,
  clientY: number,
): LogicalPoint {
  // 논리 폭이 0이면 배율을 낼 수 없다. 배율 1로 두면 최소한 좌표가 뒤집히지는 않는다.
  const scale = logicalWidth > 0 ? rootBounds.width / logicalWidth : 1;
  const safeScale = scale > 0 ? scale : 1;

  return {
    x: (clientX - rootBounds.left) / safeScale,
    y: (clientY - rootBounds.top) / safeScale,
  };
}

/** 눌렀다 뗀 것이 드래그였는지 판정한다. 임계값 안이면 그냥 클릭이다. */
export function isDragDistance(deltaX: number, deltaY: number): boolean {
  return Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD;
}

export type BattleDragContext = {
  /** 드래그 고스트를 담고 배율 기준이 되는 화면 루트다. */
  root: HTMLElement;
  slots: ReadonlyMap<BattleSlotId, HTMLElement>;
};

export type BattleDragHandlers = {
  /** 드래그를 시작할 때 놓을 수 있는 칸을 물어본다. 빈 배열이면 드래그를 시작하지 않는다. */
  begin: () => BattleSlotId[];
  drop: (slotId: BattleSlotId) => void;
};

/**
 * 카드 하나에 포인터 드래그를 붙인다.
 *
 * 드래그 중에는 화면을 다시 그리지 않는다.
 * 다시 그리면 잡고 있던 엘리먼트가 교체되면서 포인터 캡처가 끊기기 때문이다.
 * 그래서 합법 칸 강조는 render를 거치지 않고 여기서 class만 켜고 끈다.
 */
export function attachBattleCardDrag(
  card: HTMLElement,
  context: BattleDragContext,
  handlers: BattleDragHandlers,
): void {
  card.style.touchAction = 'none';

  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let ghost: HTMLElement | null = null;
  let bounds: SlotBounds[] = [];
  let hovered: BattleSlotId | null = null;

  card.addEventListener('pointerdown', (event: PointerEvent) => {
    if (pointerId !== null || !event.isPrimary || event.button !== 0) {
      return;
    }

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    card.setPointerCapture(event.pointerId);
  });

  card.addEventListener('pointermove', (event: PointerEvent) => {
    if (event.pointerId !== pointerId) {
      return;
    }

    if (!dragging) {
      if (!isDragDistance(event.clientX - startX, event.clientY - startY)) {
        return;
      }

      if (!startDrag()) {
        return;
      }
    }

    moveGhost(event.clientX, event.clientY);
    setHovered(findSlotAtPoint(bounds, event.clientX, event.clientY));
  });

  card.addEventListener('pointerup', (event: PointerEvent) => {
    if (event.pointerId !== pointerId) {
      return;
    }

    const dropSlotId = dragging ? hovered : null;
    finish();

    if (dropSlotId) {
      handlers.drop(dropSlotId);
    }
  });

  card.addEventListener('pointercancel', (event: PointerEvent) => {
    if (event.pointerId === pointerId) {
      finish();
    }
  });

  function startDrag(): boolean {
    const legalSlotIds = handlers.begin();
    if (legalSlotIds.length === 0) {
      // 놓을 곳이 없으면 아예 집히지 않게 한다. 끌고 다니다 실패하는 것보다 낫다.
      finish();
      return false;
    }

    dragging = true;
    bounds = legalSlotIds.flatMap((slotId): SlotBounds[] => {
      const element = context.slots.get(slotId);
      if (!element) {
        return [];
      }

      element.classList.add('is-legal');
      const rect = element.getBoundingClientRect();
      return [{ slotId, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }];
    });

    ghost = card.cloneNode(true) as HTMLElement;
    ghost.classList.add('pf-battlefield__drag-ghost');
    ghost.removeAttribute('disabled');
    context.root.append(ghost);

    card.classList.add('is-dragging');
    context.root.classList.add('is-dragging');
    return true;
  }

  function moveGhost(clientX: number, clientY: number): void {
    if (!ghost) {
      return;
    }

    const rootBounds = context.root.getBoundingClientRect();
    const point = toLogicalPoint(rootBounds, context.root.offsetWidth, clientX, clientY);
    ghost.style.left = `${point.x}px`;
    ghost.style.top = `${point.y}px`;
  }

  function setHovered(slotId: BattleSlotId | null): void {
    if (hovered === slotId) {
      return;
    }

    if (hovered) {
      context.slots.get(hovered)?.classList.remove('is-drop-target');
    }

    hovered = slotId;

    if (hovered) {
      context.slots.get(hovered)?.classList.add('is-drop-target');
    }
  }

  function finish(): void {
    if (pointerId !== null && card.hasPointerCapture(pointerId)) {
      card.releasePointerCapture(pointerId);
    }

    setHovered(null);
    for (const slot of bounds) {
      context.slots.get(slot.slotId)?.classList.remove('is-legal');
    }

    ghost?.remove();
    ghost = null;
    bounds = [];
    dragging = false;
    pointerId = null;
    card.classList.remove('is-dragging');
    context.root.classList.remove('is-dragging');
  }
}
