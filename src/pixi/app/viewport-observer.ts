import type { ViewportSize } from './viewport';

/**
 * 회전 뒤 크기를 다시 재는 시점들이다(ms).
 *
 * iOS는 `orientationchange`와 그 직후 `resize`에서 아직 예전 방향의 크기와
 * 안전영역을 준다. 한 번만 재면 그 잘못된 값으로 굳으므로 값이 앉을 때까지
 * 몇 번 더 잰다. 마지막 시점은 느린 기기에서도 옳은 값이 마지막에 남도록
 * 넉넉히 뒤에 둔다.
 */
export const ORIENTATION_SETTLE_DELAYS_MS: readonly number[] = [0, 120, 320, 640];

/** `addEventListener` 쌍만 요구하는 최소 이벤트 대상이다. `window`와 `visualViewport`가 모두 만족한다. */
export type ViewportEventSource = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

export type ViewportHost = ViewportEventSource & {
  visualViewport: ViewportEventSource | null;
  scrollX: number;
  scrollY: number;
  scrollTo(x: number, y: number): void;
};

export type ViewportObserverOptions = {
  host: ViewportHost;
  measure: () => ViewportSize;
  onChange: (size: ViewportSize) => void;
};

/**
 * 보이는 영역이 바뀔 때마다 다시 재서 알린다. 정리 함수를 돌려준다.
 *
 * `window`의 `resize`만 듣는 것으로는 iOS 회전을 못 따라간다. 그 시점의 크기가
 * 아직 예전 방향이라, 회전 뒤 화면이 상태표시줄 높이만큼 내려간 채로 남는다.
 * 그래서 `visualViewport`까지 같이 듣고, 회전 뒤에는 값이 앉을 때까지 다시 잰다.
 *
 * 잰 값이 직전과 같으면 알리지 않는다. `scroll`처럼 자주 오는 이벤트가
 * 화면 재배치를 유발하지 않게 한다.
 *
 * 크기를 다시 재기 전에 스크롤을 0으로 되돌린다. 회전 뒤 iOS가 남겨 두는
 * 오프셋이 그대로면 잰 크기가 맞아도 화면은 그만큼 내려간 채로 보인다.
 */
export function observeViewport({ host, measure, onChange }: ViewportObserverOptions): () => void {
  let lastSize = measure();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const notifyIfChanged = (): void => {
    const size = measure();

    if (size.width === lastSize.width && size.height === lastSize.height) {
      return;
    }

    lastSize = size;
    onChange(size);
  };

  const resetScrollAndNotify = (): void => {
    if (host.scrollX !== 0 || host.scrollY !== 0) {
      host.scrollTo(0, 0);
    }

    notifyIfChanged();
  };

  const settleAfterRotation = (): void => {
    for (const delay of ORIENTATION_SETTLE_DELAYS_MS) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        resetScrollAndNotify();
      }, delay);

      timers.add(timer);
    }
  };

  const visualViewport = host.visualViewport;

  host.addEventListener('resize', resetScrollAndNotify);
  host.addEventListener('orientationchange', settleAfterRotation);
  visualViewport?.addEventListener('resize', resetScrollAndNotify);
  visualViewport?.addEventListener('scroll', notifyIfChanged);

  return () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }

    timers.clear();
    host.removeEventListener('resize', resetScrollAndNotify);
    host.removeEventListener('orientationchange', settleAfterRotation);
    visualViewport?.removeEventListener('resize', resetScrollAndNotify);
    visualViewport?.removeEventListener('scroll', notifyIfChanged);
  };
}
