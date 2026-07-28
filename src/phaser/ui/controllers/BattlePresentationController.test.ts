import { afterEach, describe, expect, it, vi } from 'vitest';

import { BattleSession } from '../../../game/simulation/battle/BattleSession.js';
import {
  createPhaseFiveBattleFixture,
  editBattleState,
  findBattleCardId,
  moveBattleCardForTest,
} from '../../../game/simulation/battle/battleTestFixtures.js';
import type {
  ActionResolution,
  BattleEvent,
  BattleState,
  ResolutionStep,
} from '../../../game/simulation/battle/types.js';
import type { BattlePresentationCue } from '../../adapters/battlePresentationCueAdapter.js';
import {
  BattlePresentationBusyError,
  BattlePresentationController,
  BattlePresentationDestroyedError,
  InvalidBattlePresentationResolutionError,
  type BattleCuePlayback,
  type BattleCuePlaybackContext,
  type BattleInteractionGate,
  type BattlePresentationDiagnostic,
  type BattlePresentationDriver,
  type BattleStateApplyContext,
} from './BattlePresentationController.js';

class DeferredPlayback implements BattleCuePlayback {
  readonly finished: Promise<void>;
  cancelCount = 0;
  private resolveFinished = (): void => undefined;
  private settled = false;

  constructor() {
    this.finished = new Promise<void>((resolve) => {
      this.resolveFinished = resolve;
    });
  }

  complete(): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    this.resolveFinished();
  }

  cancel(): void {
    this.cancelCount += 1;
    this.complete();
  }
}

class FakeBattlePresentationDriver implements BattlePresentationDriver {
  readonly events: string[] = [];
  readonly contexts: BattleCuePlaybackContext[] = [];
  readonly appliedStates: BattleState[] = [];
  readonly applyContexts: BattleStateApplyContext[] = [];
  readonly pending = new Set<DeferredPlayback>();
  autoComplete = true;
  throwOnCue = false;
  holdWhen: (cue: BattlePresentationCue) => boolean = () => !this.autoComplete;
  cancelActiveCount = 0;
  stopSoundCount = 0;
  destroyCount = 0;

  retainCardView(cardId: string, stepId: string): void {
    this.events.push(`retain:${stepId}:${cardId}`);
  }

  playCue(cue: BattlePresentationCue, context: BattleCuePlaybackContext): BattleCuePlayback {
    this.events.push(`cue:${cue.stepId}:${cue.id}`);
    this.contexts.push(context);

    if (this.throwOnCue) {
      throw new Error(`test cue error: ${cue.id}`);
    }

    if (!cue.blocking || !this.holdWhen(cue)) {
      return {
        finished: Promise.resolve(),
        cancel: () => undefined,
      };
    }

    const playback = new DeferredPlayback();
    this.pending.add(playback);
    void playback.finished.finally(() => {
      this.pending.delete(playback);
    });
    return playback;
  }

  applyState(state: BattleState, context: BattleStateApplyContext): void {
    this.events.push(`apply:${context.stepId}:${context.isFastForward}`);
    this.appliedStates.push(state);
    this.applyContexts.push(context);
  }

  releaseStep(stepId: string): void {
    this.events.push(`release:${stepId}`);
  }

  cancelActive(): void {
    this.cancelActiveCount += 1;

    for (const playback of [...this.pending]) {
      playback.cancel();
    }
  }

  stopTransientSounds(): void {
    this.stopSoundCount += 1;
  }

  destroy(): void {
    this.destroyCount += 1;
    this.cancelActive();
    this.stopTransientSounds();
  }

  completeAll(): void {
    for (const playback of [...this.pending]) {
      playback.complete();
    }
  }
}

class FakeInteractionGate implements BattleInteractionGate {
  readonly userLocks: boolean[] = [];
  readonly aiLocks: boolean[] = [];

  setUserInputLocked(locked: boolean): void {
    this.userLocks.push(locked);
  }

  setAiActionLocked(locked: boolean): void {
    this.aiLocks.push(locked);
  }
}

function createStateSequence(length: number): readonly BattleState[] {
  const fixture = createPhaseFiveBattleFixture();
  const initial = fixture.session.getState();

  return Object.freeze(
    Array.from({ length }, (_, index) =>
      editBattleState(initial, (mutable) => {
        mutable.actionCount = index;
      }),
    ),
  );
}

function createResolution(eventGroups: readonly (readonly BattleEvent[])[]): ActionResolution {
  const states = createStateSequence(eventGroups.length + 1);
  const beforeState = states[0];
  const finalState = states.at(-1);

  if (beforeState === undefined || finalState === undefined) {
    throw new Error('controller 테스트 상태를 만들지 못했습니다.');
  }

  const steps: ResolutionStep[] = eventGroups.map((events, index) => {
    const before = states[index];
    const after = states[index + 1];

    if (before === undefined || after === undefined) {
      throw new Error('controller 테스트 step 상태가 없습니다.');
    }

    return {
      id: `controller-step-${index}`,
      effectId: `controller-effect-${index}`,
      beforeState: before,
      afterState: after,
      events,
    };
  });

  return {
    action: { type: 'END_TURN' },
    beforeState,
    finalState,
    steps,
  };
}

function moveEvent(cardId = 'moving-card'): BattleEvent {
  return {
    type: 'MOVE',
    triggerType: 'CARD_MOVED',
    subject: { type: 'CARD', cardId },
    source: { type: 'CARD', cardId },
    playerId: 'PLAYER',
    cardId,
    from: 'BACK_CENTER',
    to: 'FRONT_CENTER',
  };
}

function healEvent(cardId = 'healed-card'): BattleEvent {
  return {
    type: 'HEAL',
    triggerType: null,
    subject: { type: 'CARD', cardId },
    source: { type: 'CARD', cardId: 'source-card' },
    targetCardId: cardId,
    amount: 2,
  };
}

function statEvent(cardId = 'stat-card'): BattleEvent {
  return {
    type: 'STAT_MODIFIED',
    triggerType: null,
    subject: { type: 'CARD', cardId },
    source: { type: 'CARD', cardId: 'source-card' },
    targetCardId: cardId,
    stat: 'ATTACK',
    amount: 1,
  };
}

async function flushMicrotasks(count = 12): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Phase 6 BattlePresentationController', () => {
  it('locks user input and AI until blocking cues finish, then applies afterState exactly once', async () => {
    const driver = new FakeBattlePresentationDriver();
    driver.autoComplete = false;
    const gate = new FakeInteractionGate();
    const controller = new BattlePresentationController(driver, {
      interactionGate: gate,
    });
    const resolution = createResolution([[moveEvent()]]);
    const resultPromise = controller.presentAction(resolution);

    expect(controller.isUserInputLocked).toBe(true);
    expect(controller.isAiActionLocked).toBe(true);
    expect(gate.userLocks).toEqual([true]);
    expect(gate.aiLocks).toEqual([true]);
    expect(driver.appliedStates).toEqual([]);

    driver.completeAll();
    const result = await resultPromise;

    expect(result.status).toBe('COMPLETED');
    expect(result.appliedStepIds).toEqual(['controller-step-0']);
    expect(driver.appliedStates).toEqual([resolution.finalState]);
    expect(controller.presentedState).toEqual(resolution.finalState);
    expect(gate.userLocks).toEqual([true, false]);
    expect(gate.aiLocks).toEqual([true, false]);
  });

  it('rejects a second user or AI presentation while an Action barrier is active', async () => {
    const driver = new FakeBattlePresentationDriver();
    driver.autoComplete = false;
    const controller = new BattlePresentationController(driver);
    const resolution = createResolution([[moveEvent()]]);
    const first = controller.presentAction(resolution);

    await expect(controller.presentAction(resolution)).rejects.toBeInstanceOf(
      BattlePresentationBusyError,
    );
    driver.completeAll();
    await first;
  });

  it('preserves step and Trigger cue order before applying each matching state', async () => {
    const driver = new FakeBattlePresentationDriver();
    const controller = new BattlePresentationController(driver);
    const resolution = createResolution([[healEvent()], [statEvent()], [moveEvent()]]);
    const result = await controller.presentAction(resolution);
    const applyIndices = result.appliedStepIds.map((stepId) =>
      driver.events.indexOf(`apply:${stepId}:false`),
    );
    const firstCueIndices = result.appliedStepIds.map((stepId) =>
      driver.events.findIndex((entry) => entry.startsWith(`cue:${stepId}:`)),
    );

    expect(result.status).toBe('COMPLETED');
    expect(result.appliedStepIds).toEqual([
      'controller-step-0',
      'controller-step-1',
      'controller-step-2',
    ]);
    expect(firstCueIndices[0]).toBeLessThan(applyIndices[0] ?? -1);
    expect(applyIndices[0]).toBeLessThan(firstCueIndices[1] ?? -1);
    expect(firstCueIndices[1]).toBeLessThan(applyIndices[1] ?? -1);
    expect(applyIndices[1]).toBeLessThan(firstCueIndices[2] ?? -1);
  });

  it('captures 1x, 2x, or 4x at Action start and defers mid-play changes to the next Action', async () => {
    const driver = new FakeBattlePresentationDriver();
    driver.autoComplete = false;
    const controller = new BattlePresentationController(driver);
    const resolution = createResolution([[moveEvent()]]);
    controller.setPlaybackSpeed(2);
    const first = controller.presentAction(resolution);

    controller.setPlaybackSpeed(4);
    expect(driver.contexts.every(({ speed }) => speed === 2)).toBe(true);
    driver.completeAll();
    expect((await first).speed).toBe(2);

    const contextCount = driver.contexts.length;
    const second = controller.presentAction(resolution);
    expect(driver.contexts.slice(contextCount).every(({ speed }) => speed === 4)).toBe(true);
    driver.completeAll();
    expect((await second).speed).toBe(4);
    expect(() => controller.setPlaybackSpeed(3)).toThrow(RangeError);
  });

  it.each([1, 2, 4] as const)(
    'produces the same final presented state at %ix speed',
    async (speed) => {
      const driver = new FakeBattlePresentationDriver();
      const controller = new BattlePresentationController(driver);
      const resolution = createResolution([[healEvent()], [statEvent()], [moveEvent()]]);
      controller.setPlaybackSpeed(speed);
      const result = await controller.presentAction(resolution);

      expect(result.status).toBe('COMPLETED');
      expect(result.finalState).toEqual(resolution.finalState);
      expect(controller.presentedState).toEqual(resolution.finalState);
    },
  );

  it('skips the whole remaining Action, cancels active media, and applies every afterState once', async () => {
    const driver = new FakeBattlePresentationDriver();
    driver.autoComplete = false;
    const controller = new BattlePresentationController(driver);
    const resolution = createResolution([[moveEvent('a')], [moveEvent('b')], [moveEvent('c')]]);
    const resultPromise = controller.presentAction(resolution);
    const cueCountBeforeSkip = driver.contexts.length;

    expect(controller.requestSkip()).toBe(true);
    expect(controller.requestSkip()).toBe(false);
    const result = await resultPromise;

    expect(result.status).toBe('SKIPPED');
    expect(driver.contexts).toHaveLength(cueCountBeforeSkip);
    expect(result.appliedStepIds).toEqual([
      'controller-step-0',
      'controller-step-1',
      'controller-step-2',
    ]);
    expect(new Set(result.appliedStepIds).size).toBe(result.appliedStepIds.length);
    expect(driver.applyContexts.every(({ isFastForward }) => isFastForward)).toBe(true);
    expect(driver.cancelActiveCount).toBeGreaterThanOrEqual(1);
    expect(driver.stopSoundCount).toBeGreaterThanOrEqual(1);
    expect(controller.presentedState).toEqual(resolution.finalState);
  });

  it('continues after a cue timeout and reports the failed cue without rolling state back', async () => {
    vi.useFakeTimers();
    const driver = new FakeBattlePresentationDriver();
    driver.autoComplete = false;
    const diagnostics: BattlePresentationDiagnostic[] = [];
    const controller = new BattlePresentationController(driver, {
      cueTimeoutMs: 100,
      actionTimeoutMs: 1_000,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const resolution = createResolution([[moveEvent()]]);
    const resultPromise = controller.presentAction(resolution);

    await vi.advanceTimersByTimeAsync(101);
    const result = await resultPromise;

    expect(result.status).toBe('COMPLETED');
    expect(diagnostics.map(({ code }) => code)).toContain('CUE_TIMEOUT');
    expect(controller.presentedState).toEqual(resolution.finalState);
  });

  it('turns the Action safety timeout into a full fast-forward instead of a deadlock', async () => {
    vi.useFakeTimers();
    const driver = new FakeBattlePresentationDriver();
    driver.autoComplete = false;
    const diagnostics: BattlePresentationDiagnostic[] = [];
    const controller = new BattlePresentationController(driver, {
      cueTimeoutMs: 1_000,
      actionTimeoutMs: 100,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const resolution = createResolution([[moveEvent('a')], [moveEvent('b')]]);
    const resultPromise = controller.presentAction(resolution);

    await vi.advanceTimersByTimeAsync(101);
    const result = await resultPromise;

    expect(result.status).toBe('TIMED_OUT');
    expect(diagnostics.map(({ code }) => code)).toContain('ACTION_TIMEOUT');
    expect(result.appliedStepIds).toEqual(['controller-step-0', 'controller-step-1']);
    expect(controller.presentedState).toEqual(resolution.finalState);
  });

  it('continues when a cue player throws and still reaches the authoritative final state', async () => {
    const driver = new FakeBattlePresentationDriver();
    driver.throwOnCue = true;
    const diagnostics: BattlePresentationDiagnostic[] = [];
    const controller = new BattlePresentationController(driver, {
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const resolution = createResolution([[healEvent()], [moveEvent()]]);
    const result = await controller.presentAction(resolution);

    expect(result.status).toBe('COMPLETED');
    expect(diagnostics.some(({ code }) => code === 'CUE_ERROR')).toBe(true);
    expect(controller.presentedState).toEqual(resolution.finalState);
  });

  it('retains simultaneous lethal card views before death cues and releases them after one state apply', async () => {
    const fixture = createPhaseFiveBattleFixture();
    const attackerId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-amber-duelist',
    );
    const defenderId = findBattleCardId(
      fixture.session.getState(),
      'ENEMY',
      'enemy-crimson-duelist',
    );
    const combatState = editBattleState(fixture.session.getState(), (mutable) => {
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, defenderId, 'FIELD', 'FRONT_CENTER');
    });
    const resolution = BattleSession.fromState(combatState, fixture.cardDefinitions).resolveAction({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: defenderId,
    });
    const driver = new FakeBattlePresentationDriver();
    driver.holdWhen = (cue) =>
      (cue.type === 'ANIMATION' && cue.animationKey.endsWith('.death')) ||
      (cue.type === 'TWEEN' && cue.tween === 'DEATH_FADE');
    const controller = new BattlePresentationController(driver);
    const resultPromise = controller.presentAction(resolution);
    await flushMicrotasks(30);
    const destroyStep = resolution.steps.find(({ effectId }) => effectId === 'state:destroy');

    if (destroyStep === undefined) {
      throw new Error('동시 파괴 step을 찾지 못했습니다.');
    }

    const retainIndices = [attackerId, defenderId].map((cardId) =>
      driver.events.indexOf(`retain:${destroyStep.id}:${cardId}`),
    );
    const deathCueIndex = driver.events.findIndex(
      (event) => event.startsWith(`cue:${destroyStep.id}:`) && event.includes('animation-death'),
    );
    const applyEntry = `apply:${destroyStep.id}:false`;

    expect(retainIndices.every((index) => index >= 0 && index < deathCueIndex)).toBe(true);
    expect(driver.events).not.toContain(applyEntry);

    driver.completeAll();
    await resultPromise;
    const applyIndex = driver.events.indexOf(applyEntry);
    const releaseIndex = driver.events.indexOf(`release:${destroyStep.id}`);

    expect(applyIndex).toBeGreaterThan(deathCueIndex);
    expect(releaseIndex).toBeGreaterThan(applyIndex);
    expect(driver.events.filter((event) => event === applyEntry)).toHaveLength(1);
  });

  it('cancels pending work on Scene shutdown without applying stale snapshots or duplicate unlocks', async () => {
    const driver = new FakeBattlePresentationDriver();
    driver.autoComplete = false;
    const gate = new FakeInteractionGate();
    const controller = new BattlePresentationController(driver, {
      interactionGate: gate,
    });
    const resolution = createResolution([[moveEvent()]]);
    const resultPromise = controller.presentAction(resolution);

    controller.destroy();
    const result = await resultPromise;

    expect(result.status).toBe('CANCELLED');
    expect(driver.appliedStates).toEqual([]);
    expect(driver.destroyCount).toBe(1);
    expect(gate.userLocks).toEqual([true, false]);
    expect(gate.aiLocks).toEqual([true, false]);
    controller.destroy();
    expect(driver.destroyCount).toBe(1);
    await expect(controller.presentAction(resolution)).rejects.toBeInstanceOf(
      BattlePresentationDestroyedError,
    );
  });

  it('rejects a discontinuous snapshot chain before locking or playing cues', async () => {
    const driver = new FakeBattlePresentationDriver();
    const gate = new FakeInteractionGate();
    const controller = new BattlePresentationController(driver, {
      interactionGate: gate,
    });
    const resolution = createResolution([[moveEvent()], [statEvent()]]);
    const firstStep = resolution.steps[0];
    const secondStep = resolution.steps[1];

    if (firstStep === undefined || secondStep === undefined) {
      throw new Error('불연속 snapshot 테스트 step을 찾지 못했습니다.');
    }

    const invalid: ActionResolution = {
      ...resolution,
      steps: [
        firstStep,
        {
          ...secondStep,
          beforeState: resolution.beforeState,
        },
      ],
    };

    await expect(controller.presentAction(invalid)).rejects.toBeInstanceOf(
      InvalidBattlePresentationResolutionError,
    );
    expect(gate.userLocks).toEqual([]);
    expect(driver.events).toEqual([]);
  });
});
