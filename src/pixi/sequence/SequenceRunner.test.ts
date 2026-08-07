import { describe, expect, it, vi } from 'vitest';
import { SequenceRunner } from './SequenceRunner';
import type { SequenceTarget, SequenceTickerFrame, SequenceVideoHandle } from './sequence-types';

/** 대기 중인 마이크로태스크를 모두 비운다. 실제 타이머를 쓰지는 않는다. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 프레임을 손으로 돌리는 Ticker 대역이다. 실제 시간에 의존하지 않는다. */
function createFakeTicker() {
  const callbacks = new Set<(ticker: SequenceTickerFrame) => void>();

  return {
    add(fn: (ticker: SequenceTickerFrame) => void) {
      callbacks.add(fn);
      return this;
    },
    remove(fn: (ticker: SequenceTickerFrame) => void) {
      callbacks.delete(fn);
      return this;
    },
    /**
     * deltaMS만큼 프레임을 진행시킨다.
     * play()는 await에서 양보한 뒤에야 다음 delay 콜백을 등록하므로,
     * 프레임을 쏘기 전에 먼저 마이크로태스크를 비워야 등록을 놓치지 않는다.
     */
    async advance(deltaMS: number, frames = 1): Promise<void> {
      for (let index = 0; index < frames; index += 1) {
        await flushMicrotasks();
        for (const callback of [...callbacks]) {
          callback({ deltaMS });
        }
        await flushMicrotasks();
      }
    },
    get size(): number {
      return callbacks.size;
    },
  };
}

function createTarget(x = 0, y = 0): SequenceTarget & { destroyed: boolean; parent: unknown } {
  return { x, y, destroyed: false, parent: {} };
}

describe('SequenceRunner 스케줄링', () => {
  it('timer가 이른 그룹부터 순서대로 실행한다', async () => {
    const ticker = createFakeTicker();
    const runner = new SequenceRunner({ ticker });
    const order: string[] = [];

    const playing = runner.play([
      { timer: 200, action: 'custom', run: () => void order.push('late') },
      { timer: 0, action: 'custom', run: () => void order.push('early') },
      { timer: 100, action: 'custom', run: () => void order.push('middle') },
    ]);

    await ticker.advance(0);
    expect(order).toEqual(['early']);

    await ticker.advance(100);
    expect(order).toEqual(['early', 'middle']);

    await ticker.advance(100);
    await playing;
    expect(order).toEqual(['early', 'middle', 'late']);
  });

  it('같은 timer의 step은 동시에 시작한다', async () => {
    const ticker = createFakeTicker();
    const runner = new SequenceRunner({ ticker });
    const order: string[] = [];

    const playing = runner.play([
      { timer: 0, action: 'custom', run: () => void order.push('a') },
      { timer: 0, action: 'custom', run: () => void order.push('b') },
    ]);

    await ticker.advance(0);
    await playing;
    expect(order).toEqual(['a', 'b']);
  });

  it('sequential step은 같은 그룹 안에서도 앞 배치가 끝난 뒤 실행한다', async () => {
    const ticker = createFakeTicker();
    const runner = new SequenceRunner({ ticker });
    const order: string[] = [];

    const playing = runner.play([
      { timer: 0, action: 'wait', duration: 100 },
      {
        timer: 0,
        action: 'custom',
        playback: 'sequential',
        run: () => void order.push('after-wait'),
      },
    ]);

    await ticker.advance(0);
    expect(order).toEqual([]);

    await ticker.advance(100);
    await playing;
    expect(order).toEqual(['after-wait']);
  });

  it('blocking step은 다음 그룹 진행을 막는다', async () => {
    const ticker = createFakeTicker();
    const runner = new SequenceRunner({ ticker });
    const order: string[] = [];

    const playing = runner.play([
      { timer: 0, action: 'wait', duration: 500, mode: 'blocking' },
      { timer: 10, action: 'custom', run: () => void order.push('next-group') },
    ]);

    await ticker.advance(100);
    expect(order).toEqual([]);

    await ticker.advance(400);
    await playing;
    expect(order).toEqual(['next-group']);
  });

  it('detached step은 다음 그룹을 막지 않지만 끝에서 함께 정리한다', async () => {
    const ticker = createFakeTicker();
    const runner = new SequenceRunner({ ticker });
    const order: string[] = [];

    const playing = runner.play([
      { timer: 0, action: 'wait', duration: 500, mode: 'detached' },
      { timer: 10, action: 'custom', run: () => void order.push('next-group') },
    ]);

    await ticker.advance(10);
    expect(order).toEqual(['next-group']);

    let settled = false;
    void playing.then(() => {
      settled = true;
    });

    await ticker.advance(100);
    expect(settled).toBe(false);

    await ticker.advance(400);
    await playing;
    expect(settled).toBe(true);
  });

  it('재생속도를 올리면 대기 시간이 그만큼 줄어든다', async () => {
    const ticker = createFakeTicker();
    const runner = new SequenceRunner({ ticker });
    const order: string[] = [];
    runner.setPlaybackRate(2);

    const playing = runner.play([
      { timer: 200, action: 'custom', run: () => void order.push('done') },
    ]);

    await ticker.advance(100);
    await playing;
    expect(order).toEqual(['done']);
  });

  it('재생속도는 0보다 큰 유한한 숫자만 받는다', () => {
    const runner = new SequenceRunner({ ticker: createFakeTicker() });

    expect(() => runner.setPlaybackRate(0)).toThrow(RangeError);
    expect(() => runner.setPlaybackRate(-1)).toThrow(RangeError);
    expect(() => runner.setPlaybackRate(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(runner.getPlaybackRate()).toBe(1);
  });

  it('lockInput이면 시작과 끝에 잠금 상태를 알린다', async () => {
    const ticker = createFakeTicker();
    const runner = new SequenceRunner({ ticker });
    const onLockChange = vi.fn();

    const playing = runner.play([{ timer: 0, action: 'wait', duration: 50 }], {
      lockInput: true,
      onLockChange,
    });

    expect(onLockChange).toHaveBeenCalledWith(true);

    await ticker.advance(50);
    await playing;
    expect(onLockChange).toHaveBeenLastCalledWith(false);
  });
});

describe('SequenceRunner shake', () => {
  it('대상을 흔든 뒤 원래 좌표로 되돌린다', async () => {
    const ticker = createFakeTicker();
    const runner = new SequenceRunner({ ticker });
    const target = createTarget(100, 50);

    const playing = runner.play([
      { timer: 0, action: 'shake', target, duration: 180, intensity: 8, repeat: 3 },
    ]);

    await ticker.advance(60);
    expect(target.x === 100 && target.y === 50).toBe(false);

    await ticker.advance(120);
    await playing;
    expect(target.x).toBe(100);
    expect(target.y).toBe(50);
  });

  it('강도나 반복이 0이면 대상을 건드리지 않는다', async () => {
    const ticker = createFakeTicker();
    const runner = new SequenceRunner({ ticker });
    const target = createTarget(10, 20);

    await runner.play([{ timer: 0, action: 'shake', target, intensity: 0 }]);

    expect(target.x).toBe(10);
    expect(target.y).toBe(20);
  });

  it('대상이 파괴되면 흔들기를 멈춘다', async () => {
    const ticker = createFakeTicker();
    const runner = new SequenceRunner({ ticker });
    const target = createTarget(5, 5);

    const playing = runner.play([{ timer: 0, action: 'shake', target, duration: 500 }]);
    await ticker.advance(50);

    target.destroyed = true;
    await ticker.advance(50);
    await playing;

    expect(ticker.size).toBe(0);
  });
});

describe('SequenceRunner video', () => {
  it('재생기가 없으면 video step을 건너뛴다', async () => {
    const ticker = createFakeTicker();
    const runner = new SequenceRunner({ ticker });

    await expect(
      runner.play([{ timer: 0, action: 'video', assetId: 'motion.slash' }]),
    ).resolves.toBeUndefined();
  });

  it('자연 종료되면 재생기를 정리한다', async () => {
    const ticker = createFakeTicker();
    const stop = vi.fn();
    let finish = (): void => undefined;
    const playVideo = vi.fn((): SequenceVideoHandle => ({
      done: new Promise<void>((resolve) => {
        finish = resolve;
      }),
      stop,
    }));
    const runner = new SequenceRunner({ ticker, playVideo });

    const playing = runner.play([
      { timer: 0, action: 'video', assetId: 'motion.slash', duration: 1000 },
    ]);
    await ticker.advance(0);

    expect(playVideo).toHaveBeenCalledTimes(1);
    finish();
    await ticker.advance(0);
    await playing;

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('시간이 지나면 끝나지 않은 비디오를 중단한다', async () => {
    const ticker = createFakeTicker();
    const stop = vi.fn();
    const playVideo = vi.fn((): SequenceVideoHandle => ({
      done: new Promise<void>(() => undefined),
      stop,
    }));
    const runner = new SequenceRunner({ ticker, playVideo });

    const playing = runner.play([
      { timer: 0, action: 'video', assetId: 'motion.slash', duration: 200 },
    ]);

    await ticker.advance(200);
    await playing;

    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('SequenceRunner 중단', () => {
  it('isActive가 false가 되면 남은 그룹을 실행하지 않는다', async () => {
    const ticker = createFakeTicker();
    let active = true;
    const runner = new SequenceRunner({ ticker, isActive: () => active });
    const order: string[] = [];

    const playing = runner.play([
      { timer: 0, action: 'custom', run: () => void order.push('first') },
      { timer: 100, action: 'custom', run: () => void order.push('second') },
    ]);

    await ticker.advance(0);
    active = false;
    await ticker.advance(100);
    await playing;

    expect(order).toEqual(['first']);
  });

  it('destroy는 대기 중인 재생을 풀고 Ticker 콜백을 남기지 않는다', async () => {
    const ticker = createFakeTicker();
    const runner = new SequenceRunner({ ticker });

    const playing = runner.play([{ timer: 1000, action: 'wait', duration: 1000 }]);
    await ticker.advance(0);
    expect(ticker.size).toBeGreaterThan(0);

    runner.destroy();
    await playing;

    expect(ticker.size).toBe(0);
  });

  it('destroy 이후의 play는 아무것도 하지 않는다', async () => {
    const runner = new SequenceRunner({ ticker: createFakeTicker() });
    const run = vi.fn();

    runner.destroy();
    await runner.play([{ timer: 0, action: 'custom', run }]);

    expect(run).not.toHaveBeenCalled();
  });
});

describe('AnimationSequence', () => {
  it('add로 쌓은 step을 play로 재생한다', async () => {
    const ticker = createFakeTicker();
    const runner = new SequenceRunner({ ticker });
    const order: string[] = [];

    const sequence = runner
      .createSequence()
      .add({ timer: 0, action: 'custom', run: () => void order.push('a') })
      .add({ timer: 0, action: 'custom', run: () => void order.push('b') });

    const playing = sequence.play();
    await ticker.advance(0);
    await playing;

    expect(order).toEqual(['a', 'b']);
  });
});
