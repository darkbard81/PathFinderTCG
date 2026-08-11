/**
 * 카드 상세를 여는 제스처다. 전장·덱 구성·장비·성장이 같은 것을 쓴다.
 *
 * 클릭을 쓸 수 없다. 전장에서는 카드 몸통이 드래그 소스이고, 덱 구성에서는 클릭이
 * 곧바로 덱과 수집품 사이 이동을 실행한다. hover도 쓸 수 없다. iPad에는 hover가 없다.
 *
 * 그래서 길게 누르기와 우클릭 둘만 받는다. 우클릭은 드래그가 button 0만 보므로
 * 애초에 겹치지 않고, 길게 누르기는 움직이는 순간 취소해 드래그에 자리를 내준다.
 */

/** 이 시간을 손가락을 멈춘 채 버티면 상세로 본다. */
const LONG_PRESS_MS = 400;

/** 이만큼 움직이면 상세가 아니라 드래그로 본다. 드래그 임계값과 맞춘다. */
const MOVE_TOLERANCE = 6;

/**
 * 길게 누르기가 성사된 뒤 이어 오는 click을 눌러 두는 시간이다.
 * 손을 떼면 브라우저가 click을 마저 보내는데, 그대로 두면 상세를 여는 동시에
 * 카드가 덱에서 빠지거나 공격이 걸린다.
 */
const CLICK_SUPPRESS_MS = 600;

export type CardInspectOptions = {
  /** 지금 상세를 열 수 있는지다. busy 같은 상태에서 막을 때 쓴다. */
  enabled?: () => boolean;
};

/**
 * 요소에 상세 열기 제스처를 건다.
 * 같은 요소에 이미 걸린 드래그나 클릭 처리를 건드리지 않고 위에 얹는다.
 */
export function attachCardInspect(
  element: HTMLElement,
  onInspect: () => void,
  options: CardInspectOptions = {},
): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let suppressClickUntil = 0;

  // 캡처 단계에서 먼저 잡아야 요소 자신의 click 처리보다 앞선다.
  element.addEventListener(
    'click',
    (event) => {
      if (performance.now() >= suppressClickUntil) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  element.addEventListener('contextmenu', (event) => {
    if (options.enabled?.() === false) {
      return;
    }

    // 기본 메뉴가 뜨면 상세가 그 아래 가린다.
    event.preventDefault();
    onInspect();
  });

  element.addEventListener('pointerdown', (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0 || options.enabled?.() === false) {
      return;
    }

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    timer = setTimeout(() => {
      timer = null;
      suppressClickUntil = performance.now() + CLICK_SUPPRESS_MS;

      // 같은 요소에 걸린 드래그를 되돌린다. 손을 뗄 때 카드가 딸려 놓이지 않게 한다.
      element.dispatchEvent(new PointerEvent('pointercancel', { pointerId: event.pointerId }));
      onInspect();
    }, LONG_PRESS_MS);
  });

  element.addEventListener('pointermove', (event: PointerEvent) => {
    if (event.pointerId !== pointerId || timer === null) {
      return;
    }

    if (Math.hypot(event.clientX - startX, event.clientY - startY) >= MOVE_TOLERANCE) {
      cancel();
    }
  });

  for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
    element.addEventListener(type, (event: PointerEvent) => {
      if (event.pointerId === pointerId) {
        cancel();
      }
    });
  }

  function cancel(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pointerId = null;
  }
}
