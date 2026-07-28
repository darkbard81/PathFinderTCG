import {
  BATTLE_SFX_ASSET_KEYS,
  type BattleSfxAssetKey,
} from '../../game/assets/battleSfxAssets.js';
import type { BattleFieldPosition, StableId } from '../../game/data/contracts.js';
import type {
  ActionResolution,
  BattleEvent,
  BattleState,
  ResolutionStep,
} from '../../game/simulation/battle/types.js';

export const BATTLE_PLAYBACK_SPEEDS = [1, 2, 4] as const;
export type BattlePlaybackSpeed = (typeof BATTLE_PLAYBACK_SPEEDS)[number];

export function isBattlePlaybackSpeed(value: number): value is BattlePlaybackSpeed {
  return BATTLE_PLAYBACK_SPEEDS.some((speed) => speed === value);
}

export const BATTLE_PRESENTATION_DURATIONS_MS = Object.freeze({
  attackApproach: 160,
  attackImpact: 120,
  attackReturn: 160,
  damage: 180,
  death: 360,
  heal: 300,
  draw: 220,
  move: 260,
  place: 300,
  discard: 220,
  stat: 200,
  status: 240,
} as const);

export const BATTLE_PRESENTATION_TIMEOUTS_MS = Object.freeze({
  cue: 1_500,
  action: 15_000,
} as const);

export const BATTLE_PRESENTATION_EASING = Object.freeze({
  move: 'Cubic.Out',
  approach: 'Cubic.Out',
  return: 'Cubic.InOut',
  scaleAlpha: 'Quad.Out',
  shake: 'Sine.InOut',
} as const);

export const BATTLE_CARD_ANIMATION_KEYS = Object.freeze({
  hit: 'animation.battle.card.hit',
  death: 'animation.battle.card.death',
  place: 'animation.battle.card.place',
  statusAdd: 'animation.battle.card.status.add',
  statusRemove: 'animation.battle.card.status.remove',
} as const);

export type BattleCardAnimationKey =
  (typeof BATTLE_CARD_ANIMATION_KEYS)[keyof typeof BATTLE_CARD_ANIMATION_KEYS];

interface PresentationCueBase {
  readonly id: string;
  readonly stepId: StableId;
  readonly durationMs: number;
}

export interface AnimationPresentationCue extends PresentationCueBase {
  readonly type: 'ANIMATION';
  readonly blocking: true;
  readonly animationKey: BattleCardAnimationKey;
  readonly targetCardId: StableId;
}

export type BattleTweenKind =
  | 'ATTACK_APPROACH'
  | 'ATTACK_RETURN'
  | 'DAMAGE_SHAKE'
  | 'DEATH_FADE'
  | 'HEAL_PULSE'
  | 'DRAW_CARD'
  | 'MOVE_CARD'
  | 'PLACE_CARD'
  | 'DISCARD_CARD'
  | 'STAT_PULSE'
  | 'STATUS_PULSE';

export interface TweenPresentationCue extends PresentationCueBase {
  readonly type: 'TWEEN';
  readonly blocking: true;
  readonly tween: BattleTweenKind;
  readonly targetCardId: StableId;
  readonly relatedCardId?: StableId;
  readonly from?: BattleFieldPosition;
  readonly to?: BattleFieldPosition;
  readonly amount?: number;
  readonly easing: string;
}

export interface SoundPresentationCue extends PresentationCueBase {
  readonly type: 'SOUND';
  readonly blocking: false;
  readonly assetKey: BattleSfxAssetKey;
}

export type BattleVisualFxKind =
  'ATTACK_IMPACT' | 'DAMAGE_POPUP' | 'HEAL_POPUP' | 'STATUS_HIGHLIGHT';

export interface VisualFxPresentationCue extends PresentationCueBase {
  readonly type: 'VISUAL_FX';
  readonly blocking: true;
  readonly visualFx: BattleVisualFxKind;
  readonly targetCardId: StableId;
  readonly amount?: number;
  readonly text?: string;
  readonly easing: string;
}

export type BattlePresentationCue =
  AnimationPresentationCue | TweenPresentationCue | SoundPresentationCue | VisualFxPresentationCue;

export type BattleCueBatchReason =
  'EVENT' | 'ATTACK_IMPACT' | 'ATTACK_RETURN' | 'SIMULTANEOUS_DAMAGE' | 'SIMULTANEOUS_DESTROY';

export interface BattlePresentationCueBatch {
  readonly id: string;
  readonly reason: BattleCueBatchReason;
  /**
   * 한 batch 안의 cue는 함께 시작한다. batch 자체는 배열 순서대로 해결한다.
   * 복수 규칙 대상을 같은 batch에 넣는 것은 동시 DAMAGE/DESTROY뿐이다.
   */
  readonly cues: readonly BattlePresentationCue[];
}

export interface BattlePresentationStepPlan {
  readonly step: ResolutionStep;
  readonly leavingFieldCardIds: readonly StableId[];
  readonly cueBatches: readonly BattlePresentationCueBatch[];
}

export interface BattlePresentationPlan {
  readonly actionResolution: ActionResolution;
  readonly steps: readonly BattlePresentationStepPlan[];
}

interface CueBuilderContext {
  readonly step: ResolutionStep;
  readonly eventIndex: number;
}

function cueId(context: CueBuilderContext, suffix: string): string {
  return `${context.step.id}:event-${String(context.eventIndex).padStart(2, '0')}:${suffix}`;
}

function createSoundCue(
  context: CueBuilderContext,
  suffix: string,
  assetKey: BattleSfxAssetKey,
): SoundPresentationCue {
  return Object.freeze({
    id: cueId(context, `sound-${suffix}`),
    stepId: context.step.id,
    type: 'SOUND',
    blocking: false,
    durationMs: 0,
    assetKey,
  });
}

function createAnimationCue(
  context: CueBuilderContext,
  suffix: string,
  targetCardId: StableId,
  animationKey: BattleCardAnimationKey,
  durationMs: number,
): AnimationPresentationCue {
  return Object.freeze({
    id: cueId(context, `animation-${suffix}`),
    stepId: context.step.id,
    type: 'ANIMATION',
    blocking: true,
    durationMs,
    targetCardId,
    animationKey,
  });
}

function createTweenCue(
  context: CueBuilderContext,
  suffix: string,
  input: Omit<TweenPresentationCue, keyof PresentationCueBase | 'type' | 'blocking'>,
  durationMs: number,
): TweenPresentationCue {
  return Object.freeze({
    id: cueId(context, `tween-${suffix}`),
    stepId: context.step.id,
    type: 'TWEEN',
    blocking: true,
    durationMs,
    ...input,
  });
}

function createVisualFxCue(
  context: CueBuilderContext,
  suffix: string,
  input: Omit<VisualFxPresentationCue, keyof PresentationCueBase | 'type' | 'blocking'>,
  durationMs: number,
): VisualFxPresentationCue {
  return Object.freeze({
    id: cueId(context, `fx-${suffix}`),
    stepId: context.step.id,
    type: 'VISUAL_FX',
    blocking: true,
    durationMs,
    ...input,
  });
}

function createBatch(
  step: ResolutionStep,
  suffix: string,
  reason: BattleCueBatchReason,
  cues: readonly BattlePresentationCue[],
): BattlePresentationCueBatch {
  return Object.freeze({
    id: `${step.id}:batch-${suffix}`,
    reason,
    cues: Object.freeze([...cues]),
  });
}

function fieldCardIds(state: BattleState): readonly StableId[] {
  return Object.freeze(
    (['PLAYER', 'ENEMY'] as const).flatMap((playerId) =>
      Object.values(state.players[playerId].field).filter(
        (cardId): cardId is StableId => cardId !== null,
      ),
    ),
  );
}

export function getLeavingFieldCardIds(step: ResolutionStep): readonly StableId[] {
  const afterIds = new Set(fieldCardIds(step.afterState));
  return Object.freeze(fieldCardIds(step.beforeState).filter((cardId) => !afterIds.has(cardId)));
}

function createDamageBatch(
  step: ResolutionStep,
  damageEntries: readonly {
    readonly event: Extract<BattleEvent, { readonly type: 'DAMAGE' }>;
    readonly eventIndex: number;
  }[],
): BattlePresentationCueBatch {
  const cues = damageEntries.flatMap(({ event, eventIndex }) => {
    const context = { step, eventIndex };

    return [
      createSoundCue(context, `damage-${event.targetCardId}`, BATTLE_SFX_ASSET_KEYS.damage),
      createAnimationCue(
        context,
        `hit-${event.targetCardId}`,
        event.targetCardId,
        BATTLE_CARD_ANIMATION_KEYS.hit,
        BATTLE_PRESENTATION_DURATIONS_MS.damage,
      ),
      createTweenCue(
        context,
        `damage-${event.targetCardId}`,
        {
          tween: 'DAMAGE_SHAKE',
          targetCardId: event.targetCardId,
          amount: event.amount,
          easing: BATTLE_PRESENTATION_EASING.shake,
        },
        BATTLE_PRESENTATION_DURATIONS_MS.damage,
      ),
      createVisualFxCue(
        context,
        `damage-${event.targetCardId}`,
        {
          visualFx: 'DAMAGE_POPUP',
          targetCardId: event.targetCardId,
          amount: event.amount,
          text: `-${event.amount}`,
          easing: BATTLE_PRESENTATION_EASING.scaleAlpha,
        },
        BATTLE_PRESENTATION_DURATIONS_MS.damage,
      ),
    ];
  });

  return createBatch(
    step,
    'damage',
    damageEntries.length > 1 ? 'SIMULTANEOUS_DAMAGE' : 'EVENT',
    cues,
  );
}

function createDestroyBatch(
  step: ResolutionStep,
  destroyEntries: readonly {
    readonly event: Extract<BattleEvent, { readonly type: 'DESTROY' }>;
    readonly eventIndex: number;
  }[],
): BattlePresentationCueBatch {
  const cues = destroyEntries.flatMap(({ event, eventIndex }) => {
    const context = { step, eventIndex };

    return [
      createSoundCue(context, `destroy-${event.cardId}`, BATTLE_SFX_ASSET_KEYS.destroy),
      createAnimationCue(
        context,
        `death-${event.cardId}`,
        event.cardId,
        BATTLE_CARD_ANIMATION_KEYS.death,
        BATTLE_PRESENTATION_DURATIONS_MS.death,
      ),
      createTweenCue(
        context,
        `death-${event.cardId}`,
        {
          tween: 'DEATH_FADE',
          targetCardId: event.cardId,
          easing: BATTLE_PRESENTATION_EASING.scaleAlpha,
        },
        BATTLE_PRESENTATION_DURATIONS_MS.death,
      ),
    ];
  });

  return createBatch(
    step,
    'destroy',
    destroyEntries.length > 1 ? 'SIMULTANEOUS_DESTROY' : 'EVENT',
    cues,
  );
}

function createEventBatches(
  step: ResolutionStep,
  event: BattleEvent,
  eventIndex: number,
): readonly BattlePresentationCueBatch[] {
  const context = { step, eventIndex };

  switch (event.type) {
    case 'ATTACK_DECLARED':
      return Object.freeze([
        createBatch(step, `attack-approach-${eventIndex}`, 'EVENT', [
          createSoundCue(context, 'attack', BATTLE_SFX_ASSET_KEYS.attack),
          createTweenCue(
            context,
            'attack-approach',
            {
              tween: 'ATTACK_APPROACH',
              targetCardId: event.attackerCardId,
              relatedCardId: event.targetCardId,
              easing: BATTLE_PRESENTATION_EASING.approach,
            },
            BATTLE_PRESENTATION_DURATIONS_MS.attackApproach,
          ),
        ]),
      ]);
    case 'HEAL':
      return Object.freeze([
        createBatch(step, `heal-${eventIndex}`, 'EVENT', [
          createSoundCue(context, 'heal', BATTLE_SFX_ASSET_KEYS.heal),
          createTweenCue(
            context,
            'heal',
            {
              tween: 'HEAL_PULSE',
              targetCardId: event.targetCardId,
              amount: event.amount,
              easing: BATTLE_PRESENTATION_EASING.scaleAlpha,
            },
            BATTLE_PRESENTATION_DURATIONS_MS.heal,
          ),
          createVisualFxCue(
            context,
            'heal',
            {
              visualFx: 'HEAL_POPUP',
              targetCardId: event.targetCardId,
              amount: event.amount,
              text: `+${event.amount}`,
              easing: BATTLE_PRESENTATION_EASING.scaleAlpha,
            },
            BATTLE_PRESENTATION_DURATIONS_MS.heal,
          ),
        ]),
      ]);
    case 'DRAW':
      return Object.freeze(
        event.cardIds.map((cardId, cardIndex) =>
          createBatch(step, `draw-${eventIndex}-${cardIndex}`, 'EVENT', [
            createSoundCue(context, `draw-${cardIndex}`, BATTLE_SFX_ASSET_KEYS.draw),
            createTweenCue(
              context,
              `draw-${cardIndex}`,
              {
                tween: 'DRAW_CARD',
                targetCardId: cardId,
                easing: BATTLE_PRESENTATION_EASING.scaleAlpha,
              },
              BATTLE_PRESENTATION_DURATIONS_MS.draw,
            ),
          ]),
        ),
      );
    case 'MOVE':
      return Object.freeze([
        createBatch(step, `move-${eventIndex}`, 'EVENT', [
          createSoundCue(context, 'move', BATTLE_SFX_ASSET_KEYS.move),
          createTweenCue(
            context,
            'move',
            {
              tween: 'MOVE_CARD',
              targetCardId: event.cardId,
              from: event.from,
              to: event.to,
              easing: BATTLE_PRESENTATION_EASING.move,
            },
            BATTLE_PRESENTATION_DURATIONS_MS.move,
          ),
        ]),
      ]);
    case 'PLACE':
      return Object.freeze([
        createBatch(step, `place-${eventIndex}`, 'EVENT', [
          createSoundCue(context, 'place', BATTLE_SFX_ASSET_KEYS.place),
          createAnimationCue(
            context,
            'place',
            event.cardId,
            BATTLE_CARD_ANIMATION_KEYS.place,
            BATTLE_PRESENTATION_DURATIONS_MS.place,
          ),
          createTweenCue(
            context,
            'place',
            {
              tween: 'PLACE_CARD',
              targetCardId: event.cardId,
              to: event.to,
              easing: BATTLE_PRESENTATION_EASING.scaleAlpha,
            },
            BATTLE_PRESENTATION_DURATIONS_MS.place,
          ),
        ]),
      ]);
    case 'DISCARD':
      return Object.freeze(
        event.cardIds.map((cardId, cardIndex) =>
          createBatch(step, `discard-${eventIndex}-${cardIndex}`, 'EVENT', [
            createSoundCue(context, `discard-${cardIndex}`, BATTLE_SFX_ASSET_KEYS.discard),
            createTweenCue(
              context,
              `discard-${cardIndex}`,
              {
                tween: 'DISCARD_CARD',
                targetCardId: cardId,
                easing: BATTLE_PRESENTATION_EASING.scaleAlpha,
              },
              BATTLE_PRESENTATION_DURATIONS_MS.discard,
            ),
          ]),
        ),
      );
    case 'STAT_MODIFIED':
      return Object.freeze([
        createBatch(step, `stat-${eventIndex}`, 'EVENT', [
          createSoundCue(context, 'stat', BATTLE_SFX_ASSET_KEYS.stat),
          createTweenCue(
            context,
            'stat',
            {
              tween: 'STAT_PULSE',
              targetCardId: event.targetCardId,
              amount: event.amount,
              easing: BATTLE_PRESENTATION_EASING.scaleAlpha,
            },
            BATTLE_PRESENTATION_DURATIONS_MS.stat,
          ),
        ]),
      ]);
    case 'STATUS_ADDED':
      return Object.freeze([
        createBatch(step, `status-add-${eventIndex}`, 'EVENT', [
          createSoundCue(context, 'status-add', BATTLE_SFX_ASSET_KEYS.statusAdd),
          createAnimationCue(
            context,
            'status-add',
            event.targetCardId,
            BATTLE_CARD_ANIMATION_KEYS.statusAdd,
            BATTLE_PRESENTATION_DURATIONS_MS.status,
          ),
          createTweenCue(
            context,
            'status-add',
            {
              tween: 'STATUS_PULSE',
              targetCardId: event.targetCardId,
              easing: BATTLE_PRESENTATION_EASING.scaleAlpha,
            },
            BATTLE_PRESENTATION_DURATIONS_MS.status,
          ),
          createVisualFxCue(
            context,
            'status-add',
            {
              visualFx: 'STATUS_HIGHLIGHT',
              targetCardId: event.targetCardId,
              text: event.statusId,
              easing: BATTLE_PRESENTATION_EASING.scaleAlpha,
            },
            BATTLE_PRESENTATION_DURATIONS_MS.status,
          ),
        ]),
      ]);
    case 'STATUS_REMOVED':
      return Object.freeze([
        createBatch(step, `status-remove-${eventIndex}`, 'EVENT', [
          createSoundCue(context, 'status-remove', BATTLE_SFX_ASSET_KEYS.statusRemove),
          createAnimationCue(
            context,
            'status-remove',
            event.targetCardId,
            BATTLE_CARD_ANIMATION_KEYS.statusRemove,
            BATTLE_PRESENTATION_DURATIONS_MS.status,
          ),
          createTweenCue(
            context,
            'status-remove',
            {
              tween: 'STATUS_PULSE',
              targetCardId: event.targetCardId,
              easing: BATTLE_PRESENTATION_EASING.scaleAlpha,
            },
            BATTLE_PRESENTATION_DURATIONS_MS.status,
          ),
          createVisualFxCue(
            context,
            'status-remove',
            {
              visualFx: 'STATUS_HIGHLIGHT',
              targetCardId: event.targetCardId,
              text: event.statusId,
              easing: BATTLE_PRESENTATION_EASING.scaleAlpha,
            },
            BATTLE_PRESENTATION_DURATIONS_MS.status,
          ),
        ]),
      ]);
    case 'ACTION_STARTED':
    case 'ACTION_CANCELLED':
    case 'DAMAGE':
    case 'DESTROY':
    case 'EXILE':
    case 'DEPLOYMENT_READY':
    case 'TURN_STARTED':
    case 'TURN_ENDED':
    case 'EFFECT_FAILED':
    case 'BATTLE_ENDED':
      return Object.freeze([]);
  }
}

function createImpactBatch(
  step: ResolutionStep,
  attackerCardId: StableId,
  targetCardId: StableId,
): BattlePresentationCueBatch {
  const context = { step, eventIndex: 0 };

  return createBatch(step, 'attack-impact', 'ATTACK_IMPACT', [
    createSoundCue(context, 'impact', BATTLE_SFX_ASSET_KEYS.impact),
    createVisualFxCue(
      context,
      'attack-impact',
      {
        visualFx: 'ATTACK_IMPACT',
        targetCardId,
        text: attackerCardId,
        easing: BATTLE_PRESENTATION_EASING.scaleAlpha,
      },
      BATTLE_PRESENTATION_DURATIONS_MS.attackImpact,
    ),
  ]);
}

function createReturnBatch(
  step: ResolutionStep,
  attackerCardId: StableId,
): BattlePresentationCueBatch {
  return createBatch(step, 'attack-return', 'ATTACK_RETURN', [
    createTweenCue(
      { step, eventIndex: step.events.length },
      'attack-return',
      {
        tween: 'ATTACK_RETURN',
        targetCardId: attackerCardId,
        easing: BATTLE_PRESENTATION_EASING.return,
      },
      BATTLE_PRESENTATION_DURATIONS_MS.attackReturn,
    ),
  ]);
}

function buildBaseStepBatches(step: ResolutionStep): BattlePresentationCueBatch[] {
  const damageEntries = step.events.flatMap((event, eventIndex) =>
    event.type === 'DAMAGE' ? [{ event, eventIndex }] : [],
  );
  const destroyEntries = step.events.flatMap((event, eventIndex) =>
    event.type === 'DESTROY' ? [{ event, eventIndex }] : [],
  );

  if (damageEntries.length > 0) {
    return [createDamageBatch(step, damageEntries)];
  }

  if (destroyEntries.length > 0) {
    return [createDestroyBatch(step, destroyEntries)];
  }

  return step.events.flatMap((event, eventIndex) => createEventBatches(step, event, eventIndex));
}

function cardRemainsOnField(state: BattleState, cardId: StableId): boolean {
  return fieldCardIds(state).includes(cardId);
}

export function createBattlePresentationPlan(
  actionResolution: ActionResolution,
): BattlePresentationPlan {
  const stepBatches = actionResolution.steps.map((step) => buildBaseStepBatches(step));

  if (actionResolution.action.type === 'ATTACK') {
    const attackerCardId = actionResolution.action.cardId;
    const targetCardId = actionResolution.action.targetCardId;
    const combatIndex = actionResolution.steps.findIndex(
      (step) => step.effectId === 'action:ATTACK:combat',
    );

    if (combatIndex >= 0) {
      const combatStep = actionResolution.steps[combatIndex];

      if (combatStep !== undefined) {
        stepBatches[combatIndex]?.unshift(
          createImpactBatch(combatStep, attackerCardId, targetCardId),
        );
        const nextStep = actionResolution.steps[combatIndex + 1];
        const nextIsDestroy = nextStep?.effectId === 'state:destroy';
        const returnIndex = nextIsDestroy ? combatIndex + 1 : combatIndex;
        const returnStep = actionResolution.steps[returnIndex];

        if (returnStep !== undefined && cardRemainsOnField(returnStep.afterState, attackerCardId)) {
          stepBatches[returnIndex]?.push(createReturnBatch(returnStep, attackerCardId));
        }
      }
    } else {
      const cancellationIndex = actionResolution.steps.findIndex((step) =>
        step.events.some((event) => event.type === 'ACTION_CANCELLED'),
      );
      const cancellationStep = actionResolution.steps[cancellationIndex];

      if (
        cancellationIndex >= 0 &&
        cancellationStep !== undefined &&
        cardRemainsOnField(cancellationStep.afterState, attackerCardId)
      ) {
        stepBatches[cancellationIndex]?.push(createReturnBatch(cancellationStep, attackerCardId));
      } else if (cardRemainsOnField(actionResolution.finalState, attackerCardId)) {
        const terminalIndex = actionResolution.steps.length - 1;
        const terminalStep = actionResolution.steps[terminalIndex];

        if (terminalStep !== undefined) {
          stepBatches[terminalIndex]?.push(createReturnBatch(terminalStep, attackerCardId));
        }
      }
    }
  }

  return Object.freeze({
    actionResolution,
    steps: Object.freeze(
      actionResolution.steps.map((step, index) =>
        Object.freeze({
          step,
          leavingFieldCardIds: getLeavingFieldCardIds(step),
          cueBatches: Object.freeze([...(stepBatches[index] ?? [])]),
        }),
      ),
    ),
  });
}
