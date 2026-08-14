import type { ViewportSize } from './viewport';
import {
  ORIENTATION_SETTLE_DELAYS_MS,
  observeViewport,
  type ViewportHost,
} from './viewport-observer';

type FakeHost = ViewportHost & {
  emit(type: string): void;
  emitVisual(type: string): void;
  listenerCount(): number;
  scrollToCalls: number;
};

function createFakeHost(): FakeHost {
  const listeners = new Map<string, Set<() => void>>();
  const visualListeners = new Map<string, Set<() => void>>();

  const add = (map: Map<string, Set<() => void>>) => (type: string, listener: () => void) => {
    const set = map.get(type) ?? new Set<() => void>();
    set.add(listener);
    map.set(type, set);
  };
  const remove = (map: Map<string, Set<() => void>>) => (type: string, listener: () => void) => {
    map.get(type)?.delete(listener);
  };
  const emit = (map: Map<string, Set<() => void>>) => (type: string) => {
    for (const listener of [...(map.get(type) ?? [])]) {
      listener();
    }
  };
  const countOf = (map: Map<string, Set<() => void>>): number =>
    [...map.values()].reduce((total, set) => total + set.size, 0);

  return {
    addEventListener: add(listeners),
    removeEventListener: remove(listeners),
    visualViewport: {
      addEventListener: add(visualListeners),
      removeEventListener: remove(visualListeners),
    },
    scrollX: 0,
    scrollY: 0,
    scrollTo(x, y) {
      this.scrollToCalls += 1;
      this.scrollX = x;
      this.scrollY = y;
    },
    scrollToCalls: 0,
    emit: emit(listeners),
    emitVisual: emit(visualListeners),
    listenerCount: () => countOf(listeners) + countOf(visualListeners),
  };
}

describe('observeViewport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('크기가 바뀐 resize만 알린다', () => {
    const host = createFakeHost();
    const sizes: ViewportSize[] = [{ width: 800, height: 600 }];
    const onChange = vi.fn();

    observeViewport({ host, measure: () => sizes[sizes.length - 1]!, onChange });

    host.emit('resize');
    expect(onChange).not.toHaveBeenCalled();

    sizes.push({ width: 600, height: 800 });
    host.emit('resize');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ width: 600, height: 800 });

    host.emit('resize');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('회전 뒤 늦게 앉는 크기를 다시 재서 알린다', () => {
    const host = createFakeHost();
    let size: ViewportSize = { width: 390, height: 794 };
    const onChange = vi.fn();

    observeViewport({ host, measure: () => size, onChange });

    host.emit('orientationchange');
    vi.advanceTimersByTime(ORIENTATION_SETTLE_DELAYS_MS[0]!);
    expect(onChange).not.toHaveBeenCalled();

    size = { width: 844, height: 390 };
    vi.advanceTimersByTime(ORIENTATION_SETTLE_DELAYS_MS[ORIENTATION_SETTLE_DELAYS_MS.length - 1]!);

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ width: 844, height: 390 });
  });

  it('크기를 다시 재기 전에 남은 스크롤을 되돌린다', () => {
    const host = createFakeHost();
    const onChange = vi.fn();

    observeViewport({ host, measure: () => ({ width: 844, height: 390 }), onChange });

    host.scrollY = 47;
    host.emit('resize');

    expect(host.scrollToCalls).toBe(1);
    expect(host.scrollY).toBe(0);
  });

  it('visualViewport 크기 변화도 듣는다', () => {
    const host = createFakeHost();
    let size: ViewportSize = { width: 844, height: 390 };
    const onChange = vi.fn();

    observeViewport({ host, measure: () => size, onChange });

    size = { width: 844, height: 340 };
    host.emitVisual('resize');

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ width: 844, height: 340 });
  });

  it('정리 함수는 구독과 예약된 재측정을 모두 없앤다', () => {
    const host = createFakeHost();
    let size: ViewportSize = { width: 390, height: 794 };
    const onChange = vi.fn();

    const stop = observeViewport({ host, measure: () => size, onChange });

    host.emit('orientationchange');
    stop();
    size = { width: 844, height: 390 };
    vi.runAllTimers();
    host.emit('resize');
    host.emitVisual('resize');

    expect(onChange).not.toHaveBeenCalled();
    expect(host.listenerCount()).toBe(0);
  });

  it('visualViewport가 없어도 동작한다', () => {
    const host = createFakeHost();
    host.visualViewport = null;
    let size: ViewportSize = { width: 390, height: 794 };
    const onChange = vi.fn();

    const stop = observeViewport({ host, measure: () => size, onChange });

    size = { width: 844, height: 390 };
    host.emit('resize');
    stop();

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ width: 844, height: 390 });
  });
});
