import { describe, expect, it } from 'vitest';

import { BATTLE_SFX_ASSET_KEYS } from '../../game/assets/battleSfxAssets.js';
import { BattleSession } from '../../game/simulation/battle/BattleSession.js';
import {
  createPhaseFiveBattleFixture,
  editBattleState,
  findBattleCardId,
  moveBattleCardForTest,
} from '../../game/simulation/battle/battleTestFixtures.js';
import type {
  ActionResolution,
  BattleEvent,
  BattleState,
  ResolutionStep,
} from '../../game/simulation/battle/types.js';
import {
  BATTLE_CARD_ANIMATION_KEYS,
  BATTLE_PLAYBACK_SPEEDS,
  BATTLE_PRESENTATION_DURATIONS_MS,
  BATTLE_PRESENTATION_EASING,
  BATTLE_PRESENTATION_TIMEOUTS_MS,
  createBattlePresentationPlan,
  type BattlePresentationCue,
} from './battlePresentationCueAdapter.js';

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
    throw new Error('프레젠테이션 테스트 상태를 만들지 못했습니다.');
  }

  const steps: ResolutionStep[] = eventGroups.map((events, index) => {
    const before = states[index];
    const after = states[index + 1];

    if (before === undefined || after === undefined) {
      throw new Error('프레젠테이션 테스트 step 상태가 없습니다.');
    }

    return {
      id: `presentation-step-${index}`,
      effectId: `presentation-effect-${index}`,
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

function cueKinds(cues: readonly BattlePresentationCue[]): readonly string[] {
  return cues.map((cue) =>
    cue.type === 'SOUND'
      ? `${cue.type}:${cue.assetKey}`
      : cue.type === 'TWEEN'
        ? `${cue.type}:${cue.tween}`
        : cue.type === 'ANIMATION'
          ? `${cue.type}:${cue.animationKey}`
          : `${cue.type}:${cue.visualFx}`,
  );
}

describe('Phase 6 battle presentation cue adapter', () => {
  it('uses the exact approved speed, timing, easing, timeout, animation, and SFX contracts', () => {
    expect(BATTLE_PLAYBACK_SPEEDS).toEqual([1, 2, 4]);
    expect(BATTLE_PRESENTATION_DURATIONS_MS).toEqual({
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
    });
    expect(BATTLE_PRESENTATION_EASING).toEqual({
      move: 'Cubic.Out',
      approach: 'Cubic.Out',
      return: 'Cubic.InOut',
      scaleAlpha: 'Quad.Out',
      shake: 'Sine.InOut',
    });
    expect(BATTLE_PRESENTATION_TIMEOUTS_MS).toEqual({
      cue: 1_500,
      action: 15_000,
    });
    expect(BATTLE_CARD_ANIMATION_KEYS).toEqual({
      hit: 'animation.battle.card.hit',
      death: 'animation.battle.card.death',
      place: 'animation.battle.card.place',
      statusAdd: 'animation.battle.card.status.add',
      statusRemove: 'animation.battle.card.status.remove',
    });
    expect(Object.values(BATTLE_SFX_ASSET_KEYS)).toEqual([
      'sfx.battle.attack',
      'sfx.battle.impact',
      'sfx.battle.damage',
      'sfx.battle.destroy',
      'sfx.battle.heal',
      'sfx.battle.draw',
      'sfx.battle.move',
      'sfx.battle.place',
      'sfx.battle.discard',
      'sfx.battle.stat',
      'sfx.battle.status.add',
      'sfx.battle.status.remove',
    ]);
  });

  it('maps all ten Effect result kinds to ordered animation, tween, sound, and visual FX cues', () => {
    const source = { type: 'CARD' as const, cardId: 'source-card' };
    const target = { type: 'CARD' as const, cardId: 'target-card' };
    const resolution = createResolution([
      [
        {
          type: 'DAMAGE',
          triggerType: 'DAMAGE_RECEIVED',
          subject: target,
          source,
          targetCardId: target.cardId,
          amount: 3,
        },
      ],
      [
        {
          type: 'HEAL',
          triggerType: null,
          subject: target,
          source,
          targetCardId: target.cardId,
          amount: 2,
        },
      ],
      [
        {
          type: 'DRAW',
          triggerType: 'CARD_DRAWN',
          subject: { type: 'PLAYER', playerId: 'PLAYER' },
          source,
          playerId: 'PLAYER',
          cardIds: ['draw-a', 'draw-b'],
        },
      ],
      [
        {
          type: 'MOVE',
          triggerType: 'CARD_MOVED',
          subject: target,
          source,
          playerId: 'PLAYER',
          cardId: target.cardId,
          from: 'BACK_CENTER',
          to: 'FRONT_CENTER',
        },
      ],
      [
        {
          type: 'PLACE',
          triggerType: 'CARD_PLACED',
          subject: target,
          source: target,
          playerId: 'PLAYER',
          cardId: target.cardId,
          to: 'FRONT_LEFT',
        },
      ],
      [
        {
          type: 'DESTROY',
          triggerType: 'CARD_DESTROYED',
          subject: target,
          source,
          cardId: target.cardId,
        },
      ],
      [
        {
          type: 'DISCARD',
          triggerType: 'CARD_DISCARDED',
          subject: { type: 'PLAYER', playerId: 'PLAYER' },
          source,
          playerId: 'PLAYER',
          cardIds: ['discard-a', 'discard-b'],
        },
      ],
      [
        {
          type: 'STAT_MODIFIED',
          triggerType: null,
          subject: target,
          source,
          targetCardId: target.cardId,
          stat: 'ATTACK',
          amount: 1,
        },
      ],
      [
        {
          type: 'STATUS_ADDED',
          triggerType: 'STATUS_ADDED',
          subject: target,
          source,
          targetCardId: target.cardId,
          statusId: 'EXILED',
        },
      ],
      [
        {
          type: 'STATUS_REMOVED',
          triggerType: 'STATUS_REMOVED',
          subject: target,
          source,
          targetCardId: target.cardId,
          statusId: 'EXILED',
        },
      ],
    ]);
    const plan = createBattlePresentationPlan(resolution);
    const flattened = plan.steps.map((step) =>
      step.cueBatches.map((batch) => cueKinds(batch.cues)),
    );

    expect(flattened[0]?.[0]).toEqual([
      'SOUND:sfx.battle.damage',
      'ANIMATION:animation.battle.card.hit',
      'TWEEN:DAMAGE_SHAKE',
      'VISUAL_FX:DAMAGE_POPUP',
    ]);
    expect(flattened[1]?.[0]).toEqual([
      'SOUND:sfx.battle.heal',
      'TWEEN:HEAL_PULSE',
      'VISUAL_FX:HEAL_POPUP',
    ]);
    expect(flattened[2]).toHaveLength(2);
    expect(flattened[2]?.[0]).toEqual(['SOUND:sfx.battle.draw', 'TWEEN:DRAW_CARD']);
    expect(flattened[3]?.[0]).toEqual(['SOUND:sfx.battle.move', 'TWEEN:MOVE_CARD']);
    expect(flattened[4]?.[0]).toEqual([
      'SOUND:sfx.battle.place',
      'ANIMATION:animation.battle.card.place',
      'TWEEN:PLACE_CARD',
    ]);
    expect(flattened[5]?.[0]).toEqual([
      'SOUND:sfx.battle.destroy',
      'ANIMATION:animation.battle.card.death',
      'TWEEN:DEATH_FADE',
    ]);
    expect(flattened[6]).toHaveLength(2);
    expect(flattened[6]?.[0]).toEqual(['SOUND:sfx.battle.discard', 'TWEEN:DISCARD_CARD']);
    expect(flattened[7]?.[0]).toEqual(['SOUND:sfx.battle.stat', 'TWEEN:STAT_PULSE']);
    expect(flattened[8]?.[0]).toEqual([
      'SOUND:sfx.battle.status.add',
      'ANIMATION:animation.battle.card.status.add',
      'TWEEN:STATUS_PULSE',
      'VISUAL_FX:STATUS_HIGHLIGHT',
    ]);
    expect(flattened[9]?.[0]).toEqual([
      'SOUND:sfx.battle.status.remove',
      'ANIMATION:animation.battle.card.status.remove',
      'TWEEN:STATUS_PULSE',
      'VISUAL_FX:STATUS_HIGHLIGHT',
    ]);
  });

  it('keeps attack declaration, reactions, impact, simultaneous damage, death, and return in rule order', () => {
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
      mutable.turnNumber = 2;
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, defenderId, 'FIELD', 'FRONT_CENTER');
    });
    const resolution = BattleSession.fromState(combatState, fixture.cardDefinitions).resolveAction({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: defenderId,
    });
    const plan = createBattlePresentationPlan(resolution);
    const declaration = plan.steps.find(({ step }) => step.effectId === 'action:ATTACK:declared');
    const combat = plan.steps.find(({ step }) => step.effectId === 'action:ATTACK:combat');
    const destroy = plan.steps.find(({ step }) => step.effectId === 'state:destroy');

    expect(declaration?.cueBatches.map(({ reason }) => reason)).toEqual(['EVENT']);
    expect(cueKinds(declaration?.cueBatches[0]?.cues ?? [])).toEqual([
      'SOUND:sfx.battle.attack',
      'TWEEN:ATTACK_APPROACH',
    ]);
    expect(combat?.cueBatches.map(({ reason }) => reason)).toEqual([
      'ATTACK_IMPACT',
      'SIMULTANEOUS_DAMAGE',
    ]);
    expect(destroy?.leavingFieldCardIds).toEqual([attackerId, defenderId]);
    expect(destroy?.cueBatches.map(({ reason }) => reason)).toEqual(['SIMULTANEOUS_DESTROY']);
    expect(
      plan.steps
        .flatMap(({ cueBatches }) => cueBatches)
        .some(({ reason }) => reason === 'ATTACK_RETURN'),
    ).toBe(false);
  });

  it('returns a surviving attacker only after the simultaneous target death batch', () => {
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
      mutable.turnNumber = 2;
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, defenderId, 'FIELD', 'FRONT_CENTER');
      const defender = mutable.cards.find((card) => card.id === defenderId);

      if (defender === undefined) {
        throw new Error('방어자 카드를 찾지 못했습니다.');
      }
      defender.isDeploymentPending = true;
    });
    const resolution = BattleSession.fromState(combatState, fixture.cardDefinitions).resolveAction({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: defenderId,
    });
    const destroy = createBattlePresentationPlan(resolution).steps.find(
      ({ step }) => step.effectId === 'state:destroy',
    );

    expect(destroy?.leavingFieldCardIds).toEqual([defenderId]);
    expect(destroy?.cueBatches.map(({ reason }) => reason)).toEqual(['EVENT', 'ATTACK_RETURN']);
    expect(cueKinds(destroy?.cueBatches[1]?.cues ?? [])).toEqual(['TWEEN:ATTACK_RETURN']);
  });

  it('parallelizes only same-step simultaneous DAMAGE and DESTROY targets', () => {
    const targetA = { type: 'CARD' as const, cardId: 'target-a' };
    const targetB = { type: 'CARD' as const, cardId: 'target-b' };
    const source = { type: 'CARD' as const, cardId: 'source' };
    const resolution = createResolution([
      [
        {
          type: 'DAMAGE',
          triggerType: 'DAMAGE_RECEIVED',
          subject: targetA,
          source,
          targetCardId: targetA.cardId,
          amount: 1,
        },
        {
          type: 'DAMAGE',
          triggerType: 'DAMAGE_RECEIVED',
          subject: targetB,
          source,
          targetCardId: targetB.cardId,
          amount: 2,
        },
      ],
      [
        {
          type: 'DESTROY',
          triggerType: 'CARD_DESTROYED',
          subject: targetA,
          source,
          cardId: targetA.cardId,
        },
        {
          type: 'DESTROY',
          triggerType: 'CARD_DESTROYED',
          subject: targetB,
          source,
          cardId: targetB.cardId,
        },
      ],
      [
        {
          type: 'DRAW',
          triggerType: 'CARD_DRAWN',
          subject: { type: 'PLAYER', playerId: 'PLAYER' },
          source,
          playerId: 'PLAYER',
          cardIds: ['draw-a', 'draw-b'],
        },
      ],
    ]);
    const plan = createBattlePresentationPlan(resolution);

    expect(plan.steps[0]?.cueBatches).toHaveLength(1);
    expect(plan.steps[0]?.cueBatches[0]?.reason).toBe('SIMULTANEOUS_DAMAGE');
    expect(plan.steps[1]?.cueBatches).toHaveLength(1);
    expect(plan.steps[1]?.cueBatches[0]?.reason).toBe('SIMULTANEOUS_DESTROY');
    expect(plan.steps[2]?.cueBatches).toHaveLength(2);
    expect(plan.steps[2]?.cueBatches.every(({ reason }) => reason === 'EVENT')).toBe(true);
  });
});
