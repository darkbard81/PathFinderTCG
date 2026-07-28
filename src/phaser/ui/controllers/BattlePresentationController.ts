import type { StableId } from '../../../game/data/contracts.js';
import type { BattleState, ResolutionStep } from '../../../game/simulation/battle/types.js';
import {
  BATTLE_PRESENTATION_TIMEOUTS_MS,
  createBattlePresentationPlan,
  isBattlePlaybackSpeed,
  type BattlePlaybackSpeed,
  type BattlePresentationCue,
  type BattlePresentationPlan,
} from '../../adapters/battlePresentationCueAdapter.js';
import type { ActionResolution } from '../../../game/simulation/battle/types.js';

export type BattlePresentationDiagnosticCode =
  | 'CUE_ERROR'
  | 'CUE_TIMEOUT'
  | 'ACTION_TIMEOUT'
  | 'DRIVER_ERROR'
  | 'MISSING_ASSET'
  | 'AUDIO_BLOCKED';

export interface BattlePresentationDiagnostic {
  readonly code: BattlePresentationDiagnosticCode;
  readonly message: string;
  readonly stepId?: StableId;
  readonly cueId?: string;
  readonly assetKey?: string;
  readonly error?: unknown;
}

export interface BattleCuePlayback {
  readonly finished: Promise<void>;
  cancel(): void;
}

export interface BattleCuePlaybackContext {
  readonly speed: BattlePlaybackSpeed;
  readonly step: ResolutionStep;
}

export interface BattleStateApplyContext {
  readonly stepId: StableId;
  readonly isFastForward: boolean;
}

export interface BattlePresentationDriver {
  retainCardView(cardId: StableId, stepId: StableId): void;
  playCue(cue: BattlePresentationCue, context: BattleCuePlaybackContext): BattleCuePlayback;
  applyState(state: BattleState, context: BattleStateApplyContext): void;
  releaseStep(stepId: StableId): void;
  cancelActive(): void;
  stopTransientSounds(): void;
  destroy(): void;
}

export interface BattleInteractionGate {
  setUserInputLocked(locked: boolean): void;
  setAiActionLocked(locked: boolean): void;
}

export type BattlePresentationCompletionStatus =
  'COMPLETED' | 'SKIPPED' | 'TIMED_OUT' | 'CANCELLED';

export interface BattlePresentationResult {
  readonly status: BattlePresentationCompletionStatus;
  readonly speed: BattlePlaybackSpeed;
  readonly appliedStepIds: readonly StableId[];
  readonly finalState: BattleState;
}

export interface BattlePresentationControllerOptions {
  readonly interactionGate?: BattleInteractionGate;
  readonly onDiagnostic?: (diagnostic: BattlePresentationDiagnostic) => void;
  readonly cueTimeoutMs?: number;
  readonly actionTimeoutMs?: number;
}

interface ActivePresentationRun {
  readonly speed: BattlePlaybackSpeed;
  readonly appliedStepIds: StableId[];
  readonly activePlaybacks: Set<BattleCuePlayback>;
  readonly timers: Set<ReturnType<typeof setTimeout>>;
  readonly cancellation: Promise<void>;
  resolveCancellation(): void;
  skipRequested: boolean;
  actionTimedOut: boolean;
  cancelled: boolean;
}

type PlaybackWaitOutcome = 'COMPLETED' | 'ERRORED' | 'TIMED_OUT' | 'CANCELLED';

export class BattlePresentationBusyError extends Error {
  constructor() {
    super('전투 Action 연출이 끝나기 전에는 다음 Action을 표시할 수 없습니다.');
    this.name = 'BattlePresentationBusyError';
  }
}

export class BattlePresentationDestroyedError extends Error {
  constructor() {
    super('정리된 BattlePresentationController는 다시 사용할 수 없습니다.');
    this.name = 'BattlePresentationDestroyedError';
  }
}

export class InvalidBattlePresentationResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBattlePresentationResolutionError';
  }
}

function stateFingerprint(state: BattleState): string {
  return JSON.stringify(state);
}

export function assertBattlePresentationResolution(resolution: ActionResolution): void {
  const firstStep = resolution.steps[0];
  const lastStep = resolution.steps.at(-1);

  if (
    firstStep !== undefined &&
    stateFingerprint(firstStep.beforeState) !== stateFingerprint(resolution.beforeState)
  ) {
    throw new InvalidBattlePresentationResolutionError(
      '첫 ResolutionStep.beforeState가 ActionResolution.beforeState와 다릅니다.',
    );
  }

  for (let index = 1; index < resolution.steps.length; index += 1) {
    const previous = resolution.steps[index - 1];
    const current = resolution.steps[index];

    if (
      previous === undefined ||
      current === undefined ||
      stateFingerprint(previous.afterState) !== stateFingerprint(current.beforeState)
    ) {
      throw new InvalidBattlePresentationResolutionError(
        `ResolutionStep 상태가 ${index - 1}→${index} 경계에서 이어지지 않습니다.`,
      );
    }
  }

  const terminalState = lastStep?.afterState ?? resolution.beforeState;

  if (stateFingerprint(terminalState) !== stateFingerprint(resolution.finalState)) {
    throw new InvalidBattlePresentationResolutionError(
      '마지막 화면 상태가 ActionResolution.finalState와 다릅니다.',
    );
  }
}

function createActiveRun(speed: BattlePlaybackSpeed): ActivePresentationRun {
  let resolveCancellation = (): void => undefined;
  const cancellation = new Promise<void>((resolve) => {
    resolveCancellation = resolve;
  });

  return {
    speed,
    appliedStepIds: [],
    activePlaybacks: new Set(),
    timers: new Set(),
    cancellation,
    resolveCancellation,
    skipRequested: false,
    actionTimedOut: false,
    cancelled: false,
  };
}

export class BattlePresentationController {
  private readonly driver: BattlePresentationDriver;
  private readonly interactionGate?: BattleInteractionGate;
  private readonly onDiagnostic?: (diagnostic: BattlePresentationDiagnostic) => void;
  private readonly cueTimeoutMs: number;
  private readonly actionTimeoutMs: number;
  private playbackSpeed: BattlePlaybackSpeed = 1;
  private activeRun: ActivePresentationRun | null = null;
  private destroyed = false;
  private lastPresentedState: BattleState | null = null;
  private interactionsLocked = false;

  constructor(driver: BattlePresentationDriver, options: BattlePresentationControllerOptions = {}) {
    this.driver = driver;
    this.interactionGate = options.interactionGate;
    this.onDiagnostic = options.onDiagnostic;
    this.cueTimeoutMs = options.cueTimeoutMs ?? BATTLE_PRESENTATION_TIMEOUTS_MS.cue;
    this.actionTimeoutMs = options.actionTimeoutMs ?? BATTLE_PRESENTATION_TIMEOUTS_MS.action;

    if (this.cueTimeoutMs <= 0 || this.actionTimeoutMs <= 0) {
      throw new RangeError('전투 연출 timeout은 0보다 커야 합니다.');
    }
  }

  get speed(): BattlePlaybackSpeed {
    return this.playbackSpeed;
  }

  get isPresenting(): boolean {
    return this.activeRun !== null;
  }

  get isUserInputLocked(): boolean {
    return this.activeRun !== null;
  }

  get isAiActionLocked(): boolean {
    return this.activeRun !== null;
  }

  get presentedState(): BattleState | null {
    return this.lastPresentedState;
  }

  setPlaybackSpeed(speed: number): void {
    if (!isBattlePlaybackSpeed(speed)) {
      throw new RangeError(`지원하지 않는 전투 연출 속도입니다: ${speed}`);
    }

    this.playbackSpeed = speed;
  }

  requestSkip(): boolean {
    const run = this.activeRun;

    if (run === null || run.cancelled || run.skipRequested) {
      return false;
    }

    run.skipRequested = true;
    this.cancelRunPlayback(run);
    return true;
  }

  async presentAction(resolution: ActionResolution): Promise<BattlePresentationResult> {
    if (this.destroyed) {
      throw new BattlePresentationDestroyedError();
    }

    if (this.activeRun !== null) {
      throw new BattlePresentationBusyError();
    }

    assertBattlePresentationResolution(resolution);
    const plan = createBattlePresentationPlan(resolution);
    const run = createActiveRun(this.playbackSpeed);
    this.activeRun = run;
    this.setInteractionLocked(true);
    this.startActionTimeout(run);

    let status: BattlePresentationCompletionStatus;

    try {
      status = await this.runPlan(plan, run);
    } finally {
      this.clearRunTimers(run);
      run.activePlaybacks.clear();

      if (this.activeRun === run) {
        this.activeRun = null;
      }

      this.setInteractionLocked(false);
    }

    return Object.freeze({
      status,
      speed: run.speed,
      appliedStepIds: Object.freeze([...run.appliedStepIds]),
      finalState: resolution.finalState,
    });
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    const run = this.activeRun;

    if (run !== null) {
      run.cancelled = true;
      this.cancelRunPlayback(run);
      this.clearRunTimers(run);
    }

    this.safeDriverCall('Battle presentation driver 정리에 실패했습니다.', () =>
      this.driver.destroy(),
    );
    this.setInteractionLocked(false);
  }

  private async runPlan(
    plan: BattlePresentationPlan,
    run: ActivePresentationRun,
  ): Promise<BattlePresentationCompletionStatus> {
    for (let index = 0; index < plan.steps.length; index += 1) {
      const stepPlan = plan.steps[index];

      if (stepPlan === undefined) {
        continue;
      }

      if (run.cancelled) {
        return 'CANCELLED';
      }

      if (run.skipRequested) {
        this.fastForward(plan, index, run);
        return run.actionTimedOut ? 'TIMED_OUT' : 'SKIPPED';
      }

      for (const cardId of stepPlan.leavingFieldCardIds) {
        this.safeDriverCall(
          `${stepPlan.step.id}에서 제거 예정 카드 view 보존에 실패했습니다.`,
          () => this.driver.retainCardView(cardId, stepPlan.step.id),
          stepPlan.step.id,
        );
      }

      try {
        for (const batch of stepPlan.cueBatches) {
          await this.playBatch(batch.cues, stepPlan.step, run);

          if (run.cancelled || run.skipRequested) {
            break;
          }
        }

        if (run.cancelled) {
          return 'CANCELLED';
        }

        this.applyStepState(stepPlan.step, run.skipRequested, run);
      } finally {
        this.safeDriverCall(`${stepPlan.step.id} 임시 view 정리에 실패했습니다.`, () =>
          this.driver.releaseStep(stepPlan.step.id),
        );
      }

      if (run.skipRequested) {
        this.fastForward(plan, index + 1, run);
        return run.actionTimedOut ? 'TIMED_OUT' : 'SKIPPED';
      }
    }

    return 'COMPLETED';
  }

  private fastForward(
    plan: BattlePresentationPlan,
    startIndex: number,
    run: ActivePresentationRun,
  ): void {
    this.safeDriverCall('Skip 중 임시 Sound 정리에 실패했습니다.', () =>
      this.driver.stopTransientSounds(),
    );

    for (let index = startIndex; index < plan.steps.length; index += 1) {
      const stepPlan = plan.steps[index];

      if (stepPlan === undefined) {
        continue;
      }

      this.applyStepState(stepPlan.step, true, run);
      this.safeDriverCall(`${stepPlan.step.id} Skip 정리에 실패했습니다.`, () =>
        this.driver.releaseStep(stepPlan.step.id),
      );
    }
  }

  private applyStepState(
    step: ResolutionStep,
    isFastForward: boolean,
    run: ActivePresentationRun,
  ): void {
    if (run.appliedStepIds.includes(step.id)) {
      return;
    }

    this.safeDriverCall(`${step.id} afterState 화면 반영에 실패했습니다.`, () =>
      this.driver.applyState(step.afterState, {
        stepId: step.id,
        isFastForward,
      }),
    );
    this.lastPresentedState = step.afterState;
    run.appliedStepIds.push(step.id);
  }

  private async playBatch(
    cues: readonly BattlePresentationCue[],
    step: ResolutionStep,
    run: ActivePresentationRun,
  ): Promise<void> {
    const waits: Promise<void>[] = [];

    for (const cue of cues) {
      if (run.skipRequested || run.cancelled) {
        break;
      }

      let playback: BattleCuePlayback;

      try {
        playback = this.driver.playCue(cue, { speed: run.speed, step });
      } catch (error: unknown) {
        this.report({
          code: 'CUE_ERROR',
          message: `cue 재생을 시작하지 못했습니다: ${cue.id}`,
          stepId: step.id,
          cueId: cue.id,
          error,
        });
        continue;
      }

      run.activePlaybacks.add(playback);

      if (cue.blocking) {
        waits.push(this.waitForBlockingCue(playback, cue, run));
      } else {
        void playback.finished
          .catch((error: unknown) => {
            this.report({
              code: 'CUE_ERROR',
              message: `비차단 Sound cue 재생에 실패했습니다: ${cue.id}`,
              stepId: step.id,
              cueId: cue.id,
              error,
            });
          })
          .finally(() => {
            run.activePlaybacks.delete(playback);
          });
      }
    }

    await Promise.all(waits);
  }

  private async waitForBlockingCue(
    playback: BattleCuePlayback,
    cue: BattlePresentationCue,
    run: ActivePresentationRun,
  ): Promise<void> {
    const scaledTimeout = this.cueTimeoutMs / run.speed;
    let resolveTimeout = (): void => undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      resolveTimeout = resolve;
    });
    const timer = setTimeout(resolveTimeout, scaledTimeout);
    run.timers.add(timer);

    const playbackOutcome = playback.finished.then<PlaybackWaitOutcome, PlaybackWaitOutcome>(
      () => 'COMPLETED',
      (error: unknown) => {
        this.report({
          code: 'CUE_ERROR',
          message: `차단 cue 재생에 실패했습니다: ${cue.id}`,
          stepId: cue.stepId,
          cueId: cue.id,
          error,
        });
        return 'ERRORED';
      },
    );
    const timeoutOutcome = timeoutPromise.then<PlaybackWaitOutcome>(() => 'TIMED_OUT');
    const cancellationOutcome = run.cancellation.then<PlaybackWaitOutcome>(() => 'CANCELLED');
    const outcome = await Promise.race([playbackOutcome, timeoutOutcome, cancellationOutcome]);

    clearTimeout(timer);
    run.timers.delete(timer);
    run.activePlaybacks.delete(playback);

    if (outcome === 'TIMED_OUT') {
      playback.cancel();
      this.report({
        code: 'CUE_TIMEOUT',
        message: `cue timeout 뒤 완료 처리했습니다: ${cue.id}`,
        stepId: cue.stepId,
        cueId: cue.id,
      });
    }
  }

  private startActionTimeout(run: ActivePresentationRun): void {
    const timer = setTimeout(() => {
      run.timers.delete(timer);

      if (this.activeRun !== run || run.cancelled || run.skipRequested) {
        return;
      }

      run.actionTimedOut = true;
      run.skipRequested = true;
      this.report({
        code: 'ACTION_TIMEOUT',
        message: 'Action 전체 안전 timeout 뒤 남은 연출을 Skip 처리했습니다.',
      });
      this.cancelRunPlayback(run);
    }, this.actionTimeoutMs / run.speed);
    run.timers.add(timer);
  }

  private cancelRunPlayback(run: ActivePresentationRun): void {
    for (const playback of run.activePlaybacks) {
      try {
        playback.cancel();
      } catch (error: unknown) {
        this.report({
          code: 'DRIVER_ERROR',
          message: '진행 중인 cue 취소에 실패했습니다.',
          error,
        });
      }
    }

    this.safeDriverCall('진행 중인 Tween·Animation 정리에 실패했습니다.', () =>
      this.driver.cancelActive(),
    );
    this.safeDriverCall('진행 중인 임시 Sound 정리에 실패했습니다.', () =>
      this.driver.stopTransientSounds(),
    );
    run.resolveCancellation();
  }

  private clearRunTimers(run: ActivePresentationRun): void {
    for (const timer of run.timers) {
      clearTimeout(timer);
    }

    run.timers.clear();
  }

  private setInteractionLocked(locked: boolean): void {
    if (this.interactionsLocked === locked) {
      return;
    }

    this.interactionsLocked = locked;

    if (this.interactionGate === undefined) {
      return;
    }

    try {
      this.interactionGate.setUserInputLocked(locked);
      this.interactionGate.setAiActionLocked(locked);
    } catch (error: unknown) {
      this.report({
        code: 'DRIVER_ERROR',
        message: `전투 입력 잠금 상태(${locked ? 'locked' : 'unlocked'}) 반영에 실패했습니다.`,
        error,
      });
    }
  }

  private safeDriverCall(message: string, action: () => void, stepId?: StableId): void {
    try {
      action();
    } catch (error: unknown) {
      this.report({
        code: 'DRIVER_ERROR',
        message,
        stepId,
        error,
      });
    }
  }

  private report(diagnostic: BattlePresentationDiagnostic): void {
    this.onDiagnostic?.(Object.freeze({ ...diagnostic }));
  }
}
