import { describe, expect, it, vi } from 'vitest';
import {
  UNLOCK_GESTURE_EVENTS,
  unlockSoundOnGesture,
  type UnlockGestureTarget,
} from './unlock-on-gesture';

/** addEventListener를 그대로 흉내 내되 어떤 이벤트를 듣고 있는지 볼 수 있게 한다. */
function createTarget() {
  const listeners = new Map<string, Set<() => void>>();

  const target: UnlockGestureTarget = {
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
  };

  return {
    target,
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    dispatch: (type: string) => {
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener();
      }
    },
  };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('unlockSoundOnGesture', () => {
  it('입력 종류마다 듣는다', () => {
    const fake = createTarget();
    unlockSoundOnGesture({ target: fake.target, unlock: () => Promise.resolve(true) });

    expect(fake.listenerCount()).toBe(UNLOCK_GESTURE_EVENTS.length);
  });

  it('풀리면 스스로 떨어진다', async () => {
    const fake = createTarget();
    const unlock = vi.fn(() => Promise.resolve(true));
    unlockSoundOnGesture({ target: fake.target, unlock });

    fake.dispatch('pointerdown');
    await flush();

    expect(unlock).toHaveBeenCalledTimes(1);
    expect(fake.listenerCount()).toBe(0);
  });

  it('거절되면 다음 입력에서 다시 시도한다', async () => {
    const fake = createTarget();
    const unlock = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    unlockSoundOnGesture({ target: fake.target, unlock });

    fake.dispatch('pointerdown');
    await flush();
    expect(fake.listenerCount()).toBe(UNLOCK_GESTURE_EVENTS.length);

    fake.dispatch('keydown');
    await flush();
    expect(fake.listenerCount()).toBe(UNLOCK_GESTURE_EVENTS.length);

    fake.dispatch('touchend');
    await flush();

    expect(unlock).toHaveBeenCalledTimes(3);
    expect(fake.listenerCount()).toBe(0);
  });

  it('던져도 듣기를 멈추지 않는다', async () => {
    const fake = createTarget();
    const unlock = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValue(true);
    unlockSoundOnGesture({ target: fake.target, unlock });

    fake.dispatch('pointerdown');
    await flush();
    expect(fake.listenerCount()).toBe(UNLOCK_GESTURE_EVENTS.length);

    fake.dispatch('pointerdown');
    await flush();
    expect(fake.listenerCount()).toBe(0);
  });

  it('앞선 시도가 끝나지 않아도 다음 입력에서 다시 시도한다', async () => {
    /*
     * `AudioContext.resume()`은 컨텍스트를 끝내 시작할 수 없으면 약속을 결정하지 않고
     * 매달아 둔다. "시도 중이면 건너뛴다"로 막으면 그 순간 빗장이 영영 내려가
     * 어디를 눌러도 소리가 나지 않는다.
     */
    const fake = createTarget();
    const unlock = vi
      .fn()
      .mockReturnValueOnce(new Promise<boolean>(() => undefined))
      .mockResolvedValue(true);
    unlockSoundOnGesture({ target: fake.target, unlock });

    fake.dispatch('pointerdown');
    await flush();
    expect(fake.listenerCount()).toBe(UNLOCK_GESTURE_EVENTS.length);

    fake.dispatch('pointerdown');
    await flush();

    expect(unlock).toHaveBeenCalledTimes(2);
    expect(fake.listenerCount()).toBe(0);
  });

  it('풀린 뒤에는 더 시도하지 않는다', async () => {
    const fake = createTarget();
    const unlock = vi.fn(() => Promise.resolve(true));
    unlockSoundOnGesture({ target: fake.target, unlock });

    fake.dispatch('pointerdown');
    await flush();
    fake.dispatch('pointerdown');
    await flush();

    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('돌려준 함수로 떼면 더 시도하지 않는다', async () => {
    const fake = createTarget();
    const unlock = vi.fn(() => Promise.resolve(true));
    const detach = unlockSoundOnGesture({ target: fake.target, unlock });

    detach();
    fake.dispatch('pointerdown');
    await flush();

    expect(unlock).not.toHaveBeenCalled();
    expect(fake.listenerCount()).toBe(0);
  });
});
