import { describe, expect, it } from 'vitest';

import type { CardDefinition } from '../../cards/card.js';
import {
  BattleSession,
  DETERMINISTIC_BATTLE_DECISIONS,
  InvalidBattleDecisionError,
} from './BattleSession.js';
import { getBattleCard, locateBattleCard } from './state.js';
import {
  createPhaseFiveBattleFixture,
  editBattleState,
  findBattleCardId,
  moveBattleCardForTest,
} from './battleTestFixtures.js';
import type { BattleDecisionProvider, ReactiveSkillChoice } from './types.js';

function replaceDefinition(
  definitions: readonly CardDefinition[],
  replacement: CardDefinition,
): readonly CardDefinition[] {
  return Object.freeze(
    definitions.map((definition) => (definition.id === replacement.id ? replacement : definition)),
  );
}

function requireDefinition(
  definitions: readonly CardDefinition[],
  definitionId: string,
): CardDefinition {
  const definition = definitions.find((candidate) => candidate.id === definitionId);

  if (definition === undefined) {
    throw new Error(`카드 정의를 찾을 수 없습니다: ${definitionId}`);
  }

  return definition;
}

describe('Phase 5 Skills, Trigger queue, Effects, and state checks', () => {
  it('keeps DAMAGE_RECEIVED TRIGGER_SOURCE as the attacking card', () => {
    const fixture = createPhaseFiveBattleFixture();
    const attackerId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-amber-duelist',
    );
    const enemyLeaderId = fixture.session.getState().players.ENEMY.leaderCardId;
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
    });
    const session = BattleSession.fromState(state, fixture.cardDefinitions);
    const resolution = session.resolveAction({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: enemyLeaderId,
    });
    const reprisalStep = resolution.steps.find((step) =>
      step.effectId.includes('enemy-leader-velsara-eclipse-reprisal'),
    );
    const reprisalDamage = reprisalStep?.events.find((event) => event.type === 'DAMAGE');

    expect(reprisalDamage).toMatchObject({
      type: 'DAMAGE',
      targetCardId: attackerId,
      source: { type: 'CARD', cardId: enemyLeaderId },
      amount: 1,
    });
    expect(locateBattleCard(resolution.finalState, attackerId).zone).toBe('DROP');
    expect(getBattleCard(resolution.finalState, enemyLeaderId).damage).toBe(2);
  });

  it('queues each Reactive Skill instance once per Action chain and terminates reflected damage', () => {
    const fixture = createPhaseFiveBattleFixture();
    const attackerId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-twilight-exiler',
    );
    const enemyLeaderId = fixture.session.getState().players.ENEMY.leaderCardId;
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
    });
    const session = BattleSession.fromState(state, fixture.cardDefinitions);
    const resolution = session.resolveAction({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: enemyLeaderId,
    });
    const effectIds = resolution.steps.map((step) => step.effectId);

    expect(
      effectIds.filter((effectId) => effectId.includes('enemy-leader-velsara-eclipse-reprisal')),
    ).toHaveLength(1);
    expect(
      effectIds.filter((effectId) => effectId.includes('allied-twilight-exiler-last-light')),
    ).toHaveLength(1);
    expect(resolution.finalState.result).toEqual({
      type: 'WIN',
      winnerId: 'PLAYER',
      loserIds: ['ENEMY'],
      reason: 'LEADER_DEFEATED',
    });
    expect(locateBattleCard(resolution.finalState, enemyLeaderId).zone).toBe('EXILE');
  });

  it('uses controller-provided stacking order and resolves the opponent stack first', () => {
    const fixture = createPhaseFiveBattleFixture();
    const attackerId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-amber-duelist',
    );
    const targetId = findBattleCardId(fixture.session.getState(), 'ENEMY', 'enemy-crimson-duelist');
    const firstGuardId = findBattleCardId(
      fixture.session.getState(),
      'ENEMY',
      'enemy-obsidian-guard',
      0,
    );
    const secondGuardId = findBattleCardId(
      fixture.session.getState(),
      'ENEMY',
      'enemy-obsidian-guard',
      1,
    );
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, targetId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, firstGuardId, 'FIELD', 'BACK_LEFT');
      moveBattleCardForTest(mutable, secondGuardId, 'FIELD', 'BACK_RIGHT');
    });
    let stackingCandidates: readonly ReactiveSkillChoice[] = Object.freeze([]);
    const decisions: BattleDecisionProvider = {
      ...DETERMINISTIC_BATTLE_DECISIONS,
      orderReactiveSkills: (decision) => {
        if (decision.playerId === 'ENEMY' && decision.choices.length === 2) {
          stackingCandidates = Object.freeze([...decision.choices]);
          return Object.freeze([...decision.choices].reverse());
        }

        return DETERMINISTIC_BATTLE_DECISIONS.orderReactiveSkills(decision);
      },
    };
    const session = BattleSession.fromState(state, fixture.cardDefinitions);
    const resolution = session.resolveAction(
      { type: 'ATTACK', cardId: attackerId, targetCardId: targetId },
      decisions,
    );
    const guardEffectSteps = resolution.steps.filter((step) =>
      step.effectId.includes('enemy-obsidian-guard-dulling-ward'),
    );

    expect(stackingCandidates).toHaveLength(2);
    expect(guardEffectSteps.map((step) => step.effectId)).toEqual(
      stackingCandidates.map((choice) => `skill:${choice.sourceCardId}:${choice.skillId}:effect:0`),
    );
  });

  it('delegates mandatory DISCARD choices to the affected player and rejects an invalid choice', () => {
    const fixture = createPhaseFiveBattleFixture();
    const supportId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-pollen-saboteur',
    );
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      moveBattleCardForTest(mutable, supportId, 'FIELD', 'BACK_LEFT');
    });
    const playerDiscardId = state.players.PLAYER.handIds[0];
    const expectedEnemyDiscardId = state.players.ENEMY.handIds.at(-1);

    if (playerDiscardId === undefined || expectedEnemyDiscardId === undefined) {
      throw new Error('DISCARD 선택 테스트 Hand 카드가 부족합니다.');
    }

    const decisions: BattleDecisionProvider = {
      ...DETERMINISTIC_BATTLE_DECISIONS,
      chooseDiscardCards: (decision) => {
        if (decision.reason === 'EFFECT' && decision.playerId === 'ENEMY') {
          return Object.freeze([expectedEnemyDiscardId]);
        }

        return DETERMINISTIC_BATTLE_DECISIONS.chooseDiscardCards(decision);
      },
    };
    const session = BattleSession.fromState(state, fixture.cardDefinitions);
    const resolution = session.resolveAction(
      {
        type: 'DISCARD',
        cardId: playerDiscardId,
        activeSkillSourceCardId: supportId,
      },
      decisions,
    );

    expect(resolution.finalState.players.ENEMY.exileIds).toContain(expectedEnemyDiscardId);

    const invalidSession = BattleSession.fromState(state, fixture.cardDefinitions);
    const beforeInvalidDecision = invalidSession.getState();
    const invalidDecisions: BattleDecisionProvider = {
      ...DETERMINISTIC_BATTLE_DECISIONS,
      chooseDiscardCards: (decision) =>
        decision.reason === 'EFFECT'
          ? Object.freeze([])
          : DETERMINISTIC_BATTLE_DECISIONS.chooseDiscardCards(decision),
    };

    expect(() =>
      invalidSession.resolveAction(
        {
          type: 'DISCARD',
          cardId: playerDiscardId,
          activeSkillSourceCardId: supportId,
        },
        invalidDecisions,
      ),
    ).toThrow(InvalidBattleDecisionError);
    expect(invalidSession.getState()).toBe(beforeInvalidDecision);
  });

  it('returns a single destroyed unit from Drop with damage reset and deployment pending', () => {
    const fixture = createPhaseFiveBattleFixture();
    const attackerId = findBattleCardId(
      fixture.session.getState(),
      'ENEMY',
      'enemy-blackthorn-anchor',
    );
    const targetId = findBattleCardId(fixture.session.getState(), 'PLAYER', 'allied-amber-duelist');
    const renewerId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-grove-renewer',
    );
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      mutable.activePlayerId = 'ENEMY';
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, targetId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, renewerId, 'FIELD', 'BACK_LEFT');
    });
    const session = BattleSession.fromState(state, fixture.cardDefinitions);
    const resolution = session.resolveAction({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: targetId,
    });
    const target = getBattleCard(resolution.finalState, targetId);
    const returnStep = resolution.steps.find((step) =>
      step.events.some((event) => event.type === 'PLACE' && event.cardId === targetId),
    );

    expect(locateBattleCard(resolution.finalState, targetId).zone).toBe('FIELD');
    expect(target.damage).toBe(0);
    expect(target.statusIds).toEqual([]);
    expect(
      returnStep === undefined
        ? undefined
        : getBattleCard(returnStep.afterState, targetId).isDeploymentPending,
    ).toBe(true);
    expect(target.isDeploymentPending).toBe(false);
    expect(
      resolution.steps
        .flatMap((step) => step.events)
        .some(
          (event) =>
            event.type === 'PLACE' &&
            event.cardId === targetId &&
            event.source?.type === 'CARD' &&
            event.source.cardId === targetId,
        ),
    ).toBe(true);
  });

  it('queues CARD_DESTROYED + SELF from Drop and can return that same card', () => {
    const fixture = createPhaseFiveBattleFixture();
    const attackerId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-golden-champion',
    );
    const revenantId = findBattleCardId(
      fixture.session.getState(),
      'ENEMY',
      'enemy-gravebloom-revenant',
    );
    const supportId = findBattleCardId(
      fixture.session.getState(),
      'ENEMY',
      'enemy-nightroot-scout',
    );
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, revenantId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, supportId, 'FIELD', 'FRONT_LEFT');
    });
    const session = BattleSession.fromState(state, fixture.cardDefinitions);
    const resolution = session.resolveAction({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: revenantId,
    });
    const returnStep = resolution.steps.find((step) =>
      step.events.some((event) => event.type === 'PLACE' && event.cardId === revenantId),
    );

    expect(returnStep).toBeDefined();
    expect(locateBattleCard(resolution.finalState, revenantId).zone).toBe('FIELD');
    expect(getBattleCard(resolution.finalState, revenantId).damage).toBe(0);
    expect(
      resolution.steps.filter((step) =>
        step.effectId.includes('enemy-gravebloom-revenant-return-in-bloom'),
      ),
    ).toHaveLength(1);
  });

  it('does not choose an arbitrary TRIGGER_SUBJECT from simultaneous destruction', () => {
    const fixture = createPhaseFiveBattleFixture();
    const firstTargetId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-amber-duelist',
    );
    const secondTargetId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-mossguard',
    );
    const renewerId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-grove-renewer',
    );
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      moveBattleCardForTest(mutable, firstTargetId, 'FIELD', 'FRONT_LEFT');
      moveBattleCardForTest(mutable, secondTargetId, 'FIELD', 'FRONT_RIGHT');
      moveBattleCardForTest(mutable, renewerId, 'FIELD', 'BACK_LEFT');
      const first = mutable.cards.find((card) => card.id === firstTargetId);
      const second = mutable.cards.find((card) => card.id === secondTargetId);

      if (first === undefined || second === undefined) {
        throw new Error('동시 파괴 테스트 카드를 찾을 수 없습니다.');
      }
      first.damage = 1;
      second.damage = 2;
    });
    const session = BattleSession.fromState(state, fixture.cardDefinitions);
    const resolution = session.resolveAction({ type: 'END_TURN' });
    const failedPlace = resolution.steps
      .flatMap((step) => step.events)
      .find((event) => event.type === 'EFFECT_FAILED' && event.effect.type === 'PLACE');

    if (failedPlace?.type !== 'EFFECT_FAILED') {
      throw new Error('TRIGGER_SUBJECT 실패 이벤트를 찾을 수 없습니다.');
    }

    expect(failedPlace.reason).toContain('TRIGGER_SUBJECT');
    expect(locateBattleCard(resolution.finalState, firstTargetId).zone).toBe('DROP');
    expect(locateBattleCard(resolution.finalState, secondTargetId).zone).toBe('DROP');
  });

  it('resolves all applicable Effect variants in order and resets nonpermanent changes on zone changes', () => {
    const fixture = createPhaseFiveBattleFixture();
    const sourceId = findBattleCardId(fixture.session.getState(), 'PLAYER', 'allied-amber-duelist');
    const baseDefinition = requireDefinition(fixture.cardDefinitions, 'allied-amber-duelist');
    const syntheticDefinition: CardDefinition = {
      ...baseDefinition,
      hp: 5,
      attack: 1,
      activeSkill: {
        id: 'phase5-all-effects',
        description: 'Phase 5 Effect 해결 순서 테스트',
        type: 'ACTIVE',
        action: 'MOVE',
        effects: [
          { type: 'MOVE', target: 'SELF' },
          { type: 'HEAL', target: 'SELF', amount: 1 },
          { type: 'DRAW', target: 'OWNER', count: 1 },
          { type: 'DISCARD', target: 'OPPONENT', count: 1 },
          { type: 'DAMAGE', target: 'OPPONENT', amount: 1 },
          {
            type: 'MODIFY_STAT',
            target: 'SELF',
            stat: 'ATTACK',
            amount: 2,
          },
          { type: 'DESTROY', target: 'SELF' },
          { type: 'PLACE', target: 'SELF' },
        ],
      },
    };
    const definitions = replaceDefinition(fixture.cardDefinitions, syntheticDefinition);
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      moveBattleCardForTest(mutable, sourceId, 'FIELD', 'FRONT_LEFT');
      const source = mutable.cards.find((card) => card.id === sourceId);

      if (source === undefined) {
        throw new Error('Effect 테스트 출처를 찾을 수 없습니다.');
      }
      source.damage = 1;
    });
    const session = BattleSession.fromState(state, definitions);
    const resolution = session.resolveAction({
      type: 'MOVE',
      cardId: sourceId,
      fieldPosition: 'FRONT_CENTER',
    });
    const skillEvents = resolution.steps
      .filter((step) => step.effectId.includes('phase5-all-effects'))
      .flatMap((step) => step.events)
      .map((event) => event.type);
    const finalSource = getBattleCard(resolution.finalState, sourceId);

    expect(skillEvents).toEqual([
      'MOVE',
      'HEAL',
      'DRAW',
      'DISCARD',
      'DAMAGE',
      'STAT_MODIFIED',
      'DESTROY',
      'PLACE',
    ]);
    expect(locateBattleCard(resolution.finalState, sourceId).zone).toBe('FIELD');
    expect(finalSource.damage).toBe(0);
    expect(finalSource.statModifiers.ATTACK).toBe(0);
    expect(finalSource.isDeploymentPending).toBe(true);
    expect(
      getBattleCard(resolution.finalState, resolution.finalState.players.ENEMY.leaderCardId).damage,
    ).toBe(1);
  });

  it('records a failed REMOVE_STATUS and continues to the following Effect', () => {
    const fixture = createPhaseFiveBattleFixture();
    const sourceId = findBattleCardId(fixture.session.getState(), 'PLAYER', 'allied-amber-duelist');
    const targetId = findBattleCardId(
      fixture.session.getState(),
      'ENEMY',
      'enemy-blackthorn-anchor',
    );
    const baseDefinition = requireDefinition(fixture.cardDefinitions, 'allied-amber-duelist');
    const syntheticDefinition: CardDefinition = {
      ...baseDefinition,
      hp: 5,
      attack: 0,
      activeSkill: {
        id: 'phase5-remove-status-failure',
        description: '실패 후 다음 Effect 진행 테스트',
        type: 'ACTIVE',
        action: 'ATTACK',
        effects: [
          {
            type: 'REMOVE_STATUS',
            target: 'ACTION_TARGET',
            statusId: 'EXILED',
          },
          { type: 'DAMAGE', target: 'ACTION_TARGET', amount: 1 },
        ],
      },
    };
    const definitions = replaceDefinition(fixture.cardDefinitions, syntheticDefinition);
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      moveBattleCardForTest(mutable, sourceId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, targetId, 'FIELD', 'FRONT_CENTER');
    });
    const session = BattleSession.fromState(state, definitions);
    const resolution = session.resolveAction({
      type: 'ATTACK',
      cardId: sourceId,
      targetCardId: targetId,
    });
    const skillSteps = resolution.steps.filter((step) =>
      step.effectId.includes('phase5-remove-status-failure'),
    );

    expect(skillSteps[0]?.events[0]?.type).toBe('EFFECT_FAILED');
    expect(skillSteps[1]?.events[0]).toMatchObject({
      type: 'DAMAGE',
      targetCardId: targetId,
      amount: 1,
    });
  });

  it('moves EXILED cards to irreversible Exile without a destroy event', () => {
    const fixture = createPhaseFiveBattleFixture();
    const attackerId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-twilight-exiler',
    );
    const targetId = findBattleCardId(
      fixture.session.getState(),
      'ENEMY',
      'enemy-blackthorn-anchor',
    );
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, targetId, 'FIELD', 'FRONT_CENTER');
    });
    const session = BattleSession.fromState(state, fixture.cardDefinitions);
    const resolution = session.resolveAction({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: targetId,
    });
    const targetEvents = resolution.steps
      .flatMap((step) => step.events)
      .filter(
        (event) =>
          ('cardId' in event && event.cardId === targetId) ||
          ('targetCardId' in event && event.targetCardId === targetId),
      );

    expect(locateBattleCard(resolution.finalState, targetId).zone).toBe('EXILE');
    expect(targetEvents.some((event) => event.type === 'EXILE')).toBe(true);
    expect(targetEvents.some((event) => event.type === 'DESTROY')).toBe(false);
    expect(getBattleCard(resolution.finalState, targetId)).toMatchObject({
      damage: 0,
      statusIds: [],
      isDeploymentPending: false,
    });
  });

  it('declares a draw when both leaders are destroyed by the same combat state check', () => {
    const fixture = createPhaseFiveBattleFixture();
    const playerLeaderId = fixture.session.getState().players.PLAYER.leaderCardId;
    const enemyLeaderId = fixture.session.getState().players.ENEMY.leaderCardId;
    const playerLeaderDefinition = requireDefinition(
      fixture.cardDefinitions,
      'allied-leader-aelira',
    );
    const enemyLeaderDefinition = requireDefinition(
      fixture.cardDefinitions,
      'enemy-leader-velsara',
    );
    const definitions = replaceDefinition(
      replaceDefinition(fixture.cardDefinitions, {
        ...playerLeaderDefinition,
        attack: 1,
      }),
      {
        ...enemyLeaderDefinition,
        attack: 1,
      },
    );
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      moveBattleCardForTest(mutable, playerLeaderId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, enemyLeaderId, 'FIELD', 'FRONT_CENTER');
      const playerLeader = mutable.cards.find((card) => card.id === playerLeaderId);
      const enemyLeader = mutable.cards.find((card) => card.id === enemyLeaderId);

      if (playerLeader === undefined || enemyLeader === undefined) {
        throw new Error('리더 카드를 찾을 수 없습니다.');
      }
      playerLeader.damage = 19;
      enemyLeader.damage = 19;
    });
    const session = BattleSession.fromState(state, definitions);
    const resolution = session.resolveAction({
      type: 'ATTACK',
      cardId: playerLeaderId,
      targetCardId: enemyLeaderId,
    });

    expect(resolution.finalState.result).toEqual({
      type: 'DRAW',
      winnerId: null,
      loserIds: ['PLAYER', 'ENEMY'],
      reason: 'LEADER_DEFEATED',
    });
    expect(locateBattleCard(resolution.finalState, playerLeaderId).zone).toBe('DROP');
    expect(locateBattleCard(resolution.finalState, enemyLeaderId).zone).toBe('DROP');
  });
});
