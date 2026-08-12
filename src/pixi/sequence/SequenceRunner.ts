import { resolveEasing } from './easing';
import type {
  SequencePlayOptions,
  SequenceStep,
  SequenceTarget,
  SequenceTicker,
  SequenceTickerFrame,
  SequenceVideoPlayer,
} from './sequence-types';

const DEFAULT_SHAKE = {
  durationMs: 180,
  intensity: 8,
  repeat: 3,
} as const;
const DEFAULT_VIDEO_TIMEOUT_MS = 1600;
const DEFAULT_PLAYBACK_RATE = 1;

type TimedSequenceStepGroup = {
  timer: number;
  steps: SequenceStep[];
};

export type SequenceRunnerOptions = {
  ticker: SequenceTicker;
  /** 화면이 살아 있는지 확인한다. false가 되면 진행 중인 시퀀스를 중단한다. */
  isActive?: () => boolean;
  /** video action 재생기다. 주입하지 않으면 video step은 건너뛴다. */
  playVideo?: SequenceVideoPlayer;
};

/**
 * Ticker 위에서 연출 step을 시간표대로 재생하는 범용 헬퍼다.
 *
 * 전투 규칙이나 저장 상태를 알지 않고, 화면이 전달한 대상과 좌표 기반 step만 재생한다.
 * step은 timer·duration·mode·playback·action으로 시간표를 표현한다.
 */
export class SequenceRunner {
  private readonly frameCallbacks = new Set<(ticker: SequenceTickerFrame) => void>();
  private readonly pendingResolvers = new Set<() => void>();
  private playbackRate = DEFAULT_PLAYBACK_RATE;
  private destroyed = false;

  public constructor(private readonly options: SequenceRunnerOptions) {}

  /** step을 누적한 뒤 재생할 수 있는 빌더를 만든다. */
  public createSequence(): AnimationSequence {
    return new AnimationSequence(this);
  }

  public getPlaybackRate(): number {
    return this.playbackRate;
  }

  /**
   * 연출 전역 재생속도를 정한다. `1`이 기본이고 0보다 큰 유한한 숫자만 받는다.
   * 값은 진행 중인 Ticker 기반 대기와 흔들림에도 다음 프레임부터 적용된다.
   */
  public setPlaybackRate(rate: number): void {
    if (!isPositiveFiniteNumber(rate)) {
      throw new RangeError('Sequence playback rate must be a positive finite number.');
    }

    this.playbackRate = rate;
  }

  /**
   * 전달된 step들을 timer 기준으로 묶어 재생한다.
   *
   * 같은 timer의 step은 기본적으로 동시에 시작한다.
   * `playback: 'sequential'` step은 같은 timer 그룹 안에서도 앞뒤 step과 순차 실행한다.
   * blocking step은 다음 timer 그룹 진행을 막고, detached step은 막지 않되 끝에서 함께 정리한다.
   */
  public async play(
    steps: readonly SequenceStep[],
    options: SequencePlayOptions = {},
  ): Promise<void> {
    if (this.destroyed) {
      return;
    }

    const groups = groupStepsByTimer(steps);
    const detached: Array<Promise<void>> = [];

    // 그룹 timer는 시퀀스 시작 기준 절대 시각이다.
    // 지연이 Ticker로 흐르므로 경과 시간도 같은 시계에서 재야 어긋나지 않는다.
    let elapsed = 0;
    const clock = (ticker: SequenceTickerFrame): void => {
      elapsed += ticker.deltaMS * this.playbackRate;
    };
    this.frameCallbacks.add(clock);
    this.options.ticker.add(clock);

    if (options.lockInput) {
      options.onLockChange?.(true);
    }

    try {
      for (const group of groups) {
        if (!this.canRun()) {
          break;
        }

        await this.delay(Math.max(0, group.timer - elapsed));

        if (!this.canRun()) {
          break;
        }

        await this.runStepGroup(group.steps, detached);
      }

      await Promise.allSettled(detached);
    } finally {
      this.options.ticker.remove(clock);
      this.frameCallbacks.delete(clock);

      if (options.lockInput) {
        options.onLockChange?.(false);
      }
    }
  }

  /** 진행 중인 대기와 연출을 모두 풀고 Ticker 콜백을 정리한다. */
  public destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    for (const callback of [...this.frameCallbacks]) {
      this.options.ticker.remove(callback);
    }
    this.frameCallbacks.clear();

    for (const resolve of [...this.pendingResolvers]) {
      resolve();
    }
    this.pendingResolvers.clear();
  }

  private runStep(step: SequenceStep): Promise<void> {
    if (!this.canRun()) {
      return Promise.resolve();
    }

    if (step.action === 'wait') {
      return this.delay(step.duration ?? 0);
    }

    if (step.action === 'video') {
      return this.playVideo(step);
    }

    if (step.action === 'custom') {
      return Promise.resolve(step.run?.());
    }

    return this.playShake(step);
  }

  private runStepBatch(
    steps: readonly SequenceStep[],
    detached: Array<Promise<void>>,
  ): Promise<void> {
    const blocking: Array<Promise<void>> = [];
    for (const step of steps) {
      const runningStep = this.runStep(step);
      if ((step.mode ?? 'blocking') === 'detached') {
        detached.push(runningStep);
      } else {
        blocking.push(runningStep);
      }
    }

    return Promise.all(blocking).then(() => undefined);
  }

  private async runStepGroup(
    steps: readonly SequenceStep[],
    detached: Array<Promise<void>>,
  ): Promise<void> {
    let parallelBatch: SequenceStep[] = [];

    for (const step of steps) {
      if (step.playback !== 'sequential') {
        parallelBatch.push(step);
        continue;
      }

      if (parallelBatch.length > 0) {
        await this.runStepBatch(parallelBatch, detached);
        parallelBatch = [];
      }
      await this.runStepBatch([step], detached);
    }

    if (parallelBatch.length > 0) {
      await this.runStepBatch(parallelBatch, detached);
    }
  }

  /** Ticker의 누적 deltaMS로 지연을 만든다. 렌더 루프가 멈추면 연출도 함께 멈춘다. */
  private delay(durationMs: number): Promise<void> {
    if (durationMs <= 0 || !this.canRun()) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let remaining = durationMs;
      let settled = false;

      const settle = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        this.options.ticker.remove(onFrame);
        this.frameCallbacks.delete(onFrame);
        this.pendingResolvers.delete(settle);
        resolve();
      };

      const onFrame = (ticker: SequenceTickerFrame): void => {
        if (!this.canRun()) {
          settle();
          return;
        }

        remaining -= ticker.deltaMS * this.playbackRate;
        if (remaining <= 0) {
          settle();
        }
      };

      this.pendingResolvers.add(settle);
      this.frameCallbacks.add(onFrame);
      this.options.ticker.add(onFrame);
    });
  }

  /** 사인/코사인 흔들림이다. 끝나면 대상을 원래 좌표로 되돌린다. */
  private playShake(step: SequenceStep): Promise<void> {
    const target = step.target;
    if (!target || !this.canUseTarget(target)) {
      return Promise.resolve();
    }

    const duration = Math.max(0, step.duration ?? DEFAULT_SHAKE.durationMs);
    const intensity = Math.max(0, step.intensity ?? DEFAULT_SHAKE.intensity);
    const repeat = Math.max(0, step.repeat ?? DEFAULT_SHAKE.repeat);
    if (duration === 0 || intensity === 0 || repeat === 0) {
      return Promise.resolve();
    }

    const originalX = target.x;
    const originalY = target.y;
    const ease = resolveEasing(step.ease);

    return new Promise<void>((resolve) => {
      let elapsed = 0;
      let settled = false;

      const settle = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        this.options.ticker.remove(onFrame);
        this.frameCallbacks.delete(onFrame);
        this.pendingResolvers.delete(settle);

        if (this.canResetTarget(target)) {
          target.x = originalX;
          target.y = originalY;
        }

        resolve();
      };

      const onFrame = (ticker: SequenceTickerFrame): void => {
        if (!this.canUseTarget(target)) {
          settle();
          return;
        }

        elapsed += ticker.deltaMS * this.playbackRate;
        const progress = ease(Math.min(1, elapsed / duration));
        target.x = originalX + Math.sin(progress * Math.PI * repeat * 2) * intensity;
        target.y = originalY + Math.cos(progress * Math.PI * repeat * 4) * 0.35 * intensity;

        if (elapsed >= duration) {
          settle();
        }
      };

      this.pendingResolvers.add(settle);
      this.frameCallbacks.add(onFrame);
      this.options.ticker.add(onFrame);
    });
  }

  /**
   * 주입된 재생기로 비디오를 틀고, 자연 종료와 시간 초과 중 먼저 오는 쪽에서 끝낸다.
   * 타이밍은 이 클래스가, 실제 렌더링은 재생기가 맡는다.
   */
  private playVideo(step: SequenceStep): Promise<void> {
    const play = this.options.playVideo;
    const assetId = step.assetId;
    if (!play || !assetId) {
      return Promise.resolve();
    }

    const handle = play({
      assetId,
      x: step.x ?? 0,
      y: step.y ?? 0,
      ...(isPositiveFiniteNumber(step.width) ? { width: step.width } : {}),
      ...(isPositiveFiniteNumber(step.height) ? { height: step.height } : {}),
      playbackRate: this.playbackRate,
    });

    const timeoutMs = Math.max(0, step.duration ?? DEFAULT_VIDEO_TIMEOUT_MS);

    return Promise.race([handle.done, this.delay(timeoutMs)]).then(
      () => handle.stop(),
      () => handle.stop(),
    );
  }

  private canRun(): boolean {
    return !this.destroyed && (this.options.isActive?.() ?? true);
  }

  private canUseTarget(target: SequenceTarget): boolean {
    return this.canRun() && this.canResetTarget(target);
  }

  private canResetTarget(target: SequenceTarget): boolean {
    return !target.destroyed && target.parent != null;
  }
}

/** 순차/동시 연출 step을 모아 SequenceRunner로 재생하는 빌더다. */
export class AnimationSequence {
  private readonly steps: SequenceStep[] = [];

  public constructor(private readonly runner: SequenceRunner) {}

  /** 재생할 step을 추가하고 같은 시퀀스 인스턴스를 반환한다. */
  public add(step: SequenceStep): this {
    this.steps.push(step);
    return this;
  }

  /** 지금까지 추가한 step을 재생한다. */
  public play(options: SequencePlayOptions = {}): Promise<void> {
    return this.runner.play(this.steps, options);
  }
}

/** 시퀀스 step을 절대 timer 값 기준으로 묶고 오름차순 정렬한다. */
function groupStepsByTimer(steps: readonly SequenceStep[]): TimedSequenceStepGroup[] {
  const groups = new Map<number, SequenceStep[]>();
  for (const step of steps) {
    const timer = Math.max(0, step.timer);
    const group = groups.get(timer);
    if (group) {
      group.push(step);
      continue;
    }

    groups.set(timer, [step]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([timer, group]) => ({ timer, steps: group }));
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
