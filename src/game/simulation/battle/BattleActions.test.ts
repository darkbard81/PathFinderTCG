import { describe, expect, it } from 'vitest';

import { BattleSession, IllegalBattleActionError } from './BattleSession.js';
import { getLegalBattleActions, getLegalPlacementPositions } from './rules.js';
import {
  getAttackTargetCardIds,
  getBattleCard,
  getBattleEffectiveStats,
  getFieldDominance,
  locateBattleCard,
} from './state.js';
import {
  createPhaseFiveBattleFixture,
  editBattleState,
  findBattleCardId,
  moveBattleCardForTest,
} from './battleTestFixtures.js';
import type { BattleAction } from './types.js';

function requireAction<T extends BattleAction['type']>(
  actions: readonly BattleAction[],
  type: T,
): Extract<BattleAction, { readonly type: T }> {
  const action = actions.find(
    (candidate): candidate is Extract<BattleAction, { readonly type: T }> =>
      candidate.type === type,
  );

  if (action === undefined) {
    throw new Error(`${type} Action을 찾을 수 없습니다.`);
  }

  return action;
}

describe('Phase 5 battle Actions and board rules', () => {
  it('exposes all initially available Action kinds through one legal-action API', () => {
    const fixture = createPhaseFiveBattleFixture();
    const actions = fixture.session.getLegalActions();
    const actionTypes = new Set(actions.map((action) => action.type));

    expect(actionTypes).toEqual(new Set(['PLACE', 'MOVE', 'END_TURN']));
    expect(actionTypes.has('ATTACK')).toBe(false);
    expect(actionTypes.has('ACTIVE')).toBe(false);

    for (const type of ['PLACE', 'MOVE', 'END_TURN'] as const) {
      const isolatedFixture = createPhaseFiveBattleFixture();
      const action = requireAction(isolatedFixture.session.getLegalActions(), type);
      expect(() => isolatedFixture.session.resolveAction(action)).not.toThrow();
    }
  });

  it('calculates adjacency dominance, Passive modifiers, and legal PLACE cost without consuming dominance', () => {
    const fixture = createPhaseFiveBattleFixture();
    const lowCostCardId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-sunroot-pathfinder',
    );
    const highCostCardId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-golden-champion',
    );
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      moveBattleCardForTest(mutable, lowCostCardId, 'HAND');
      moveBattleCardForTest(mutable, highCostCardId, 'HAND');
    });

    expect(
      getLegalPlacementPositions(state, fixture.cardDefinitions, 'PLAYER', lowCostCardId),
    ).toEqual(['FRONT_CENTER', 'BACK_LEFT', 'BACK_RIGHT']);
    expect(
      getLegalPlacementPositions(state, fixture.cardDefinitions, 'PLAYER', highCostCardId),
    ).toEqual([]);
    expect(getFieldDominance(state, fixture.cardDefinitions, 'PLAYER', 'FRONT_CENTER')).toBe(2);

    const withPathfinder = editBattleState(state, (mutable) => {
      moveBattleCardForTest(mutable, lowCostCardId, 'FIELD', 'FRONT_CENTER');
    });

    expect(
      getBattleEffectiveStats(withPathfinder, fixture.cardDefinitions, lowCostCardId).dominance,
    ).toBe(2);
    expect(getFieldDominance(withPathfinder, fixture.cardDefinitions, 'PLAYER', 'FRONT_LEFT')).toBe(
      2,
    );
    expect(
      getFieldDominance(withPathfinder, fixture.cardDefinitions, 'PLAYER', 'FRONT_RIGHT'),
    ).toBe(2);
  });

  it('allows only adjacent MOVE destinations and preserves card runtime state within Field', () => {
    const fixture = createPhaseFiveBattleFixture();
    const leaderId = fixture.session.getState().players.PLAYER.leaderCardId;
    const moveActions = fixture.session
      .getLegalActions()
      .filter(
        (action): action is Extract<BattleAction, { readonly type: 'MOVE' }> =>
          action.type === 'MOVE' && action.cardId === leaderId,
      );

    expect(moveActions.map((action) => action.fieldPosition)).toEqual([
      'FRONT_CENTER',
      'BACK_LEFT',
      'BACK_RIGHT',
    ]);

    const move = moveActions[0];

    if (move === undefined) {
      throw new Error('리더 MOVE Action을 찾을 수 없습니다.');
    }

    const resolution = fixture.session.resolveAction(move);
    expect(locateBattleCard(resolution.finalState, leaderId).fieldPosition).toBe(
      move.fieldPosition,
    );
    expect(getBattleCard(resolution.finalState, leaderId).isDeploymentPending).toBe(false);
    expect(getBattleCard(resolution.finalState, leaderId).hasMovedThisTurn).toBe(true);

    const illegalFixture = createPhaseFiveBattleFixture();
    expect(() =>
      illegalFixture.session.resolveAction({
        type: 'MOVE',
        cardId: illegalFixture.session.getState().players.PLAYER.leaderCardId,
        fieldPosition: 'FRONT_LEFT',
      }),
    ).toThrow(IllegalBattleActionError);
  });

  it('enforces front-row attack range, diagonal targets, and straight-front protection', () => {
    const fixture = createPhaseFiveBattleFixture();
    const attackerId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-amber-duelist',
    );
    const frontCenterId = findBattleCardId(
      fixture.session.getState(),
      'ENEMY',
      'enemy-crimson-duelist',
    );
    const frontLeftId = findBattleCardId(
      fixture.session.getState(),
      'ENEMY',
      'enemy-nightroot-scout',
    );
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      mutable.turnNumber = 2;
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, frontCenterId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, frontLeftId, 'FIELD', 'FRONT_LEFT');
    });
    const enemyLeaderId = state.players.ENEMY.leaderCardId;

    expect(getAttackTargetCardIds(state, attackerId)).toEqual([frontLeftId, frontCenterId]);
    expect(getAttackTargetCardIds(state, attackerId)).not.toContain(enemyLeaderId);

    const openFront = editBattleState(state, (mutable) => {
      moveBattleCardForTest(mutable, frontCenterId, 'HAND');
    });
    expect(getAttackTargetCardIds(openFront, attackerId)).toEqual([frontLeftId, enemyLeaderId]);

    const backRow = editBattleState(openFront, (mutable) => {
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'BACK_LEFT');
    });
    expect(getAttackTargetCardIds(backRow, attackerId)).toEqual([]);
  });

  it('applies combat damage simultaneously and suppresses a deployment-pending counterattack', () => {
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
    const combatSession = BattleSession.fromState(combatState, fixture.cardDefinitions);
    const resolution = combatSession.resolveAction({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: defenderId,
    });
    const destroyStep = resolution.steps.find((step) => step.effectId === 'state:destroy');

    expect(destroyStep?.events).toHaveLength(2);
    expect(locateBattleCard(resolution.finalState, attackerId).zone).toBe('DROP');
    expect(locateBattleCard(resolution.finalState, defenderId).zone).toBe('DROP');

    const pendingState = editBattleState(combatState, (mutable) => {
      const defender = mutable.cards.find((card) => card.id === defenderId);

      if (defender === undefined) {
        throw new Error('방어자 카드를 찾을 수 없습니다.');
      }
      defender.isDeploymentPending = true;
    });
    const pendingSession = BattleSession.fromState(pendingState, fixture.cardDefinitions);
    const pendingResolution = pendingSession.resolveAction({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: defenderId,
    });

    expect(locateBattleCard(pendingResolution.finalState, attackerId).zone).toBe('FIELD');
    expect(getBattleCard(pendingResolution.finalState, attackerId).damage).toBe(0);
    expect(locateBattleCard(pendingResolution.finalState, defenderId).zone).toBe('DROP');
  });

  it('rejects illegal PLACE, MOVE, ATTACK, ACTIVE, and pending-card actions while END_TURN remains legal', () => {
    const fixture = createPhaseFiveBattleFixture();
    const highCostCardId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-golden-champion',
    );
    const attackerId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-amber-duelist',
    );
    const targetId = findBattleCardId(fixture.session.getState(), 'ENEMY', 'enemy-crimson-duelist');
    const activeCardId = fixture.session.getState().players.PLAYER.leaderCardId;
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      mutable.turnNumber = 2;
      moveBattleCardForTest(mutable, highCostCardId, 'HAND');
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, targetId, 'FIELD', 'FRONT_CENTER');
      const attacker = mutable.cards.find((card) => card.id === attackerId);
      const activeCard = mutable.cards.find((card) => card.id === activeCardId);

      if (attacker === undefined || activeCard === undefined) {
        throw new Error('Action 제한 테스트 카드를 찾을 수 없습니다.');
      }
      attacker.isDeploymentPending = true;
      activeCard.hasAttackedThisTurn = true;
    });
    const actions = getLegalBattleActions(state, fixture.cardDefinitions);

    expect(
      actions.some((action) => action.type === 'PLACE' && action.cardId === highCostCardId),
    ).toBe(false);
    expect(actions.some((action) => action.type === 'ATTACK' && action.cardId === attackerId)).toBe(
      false,
    );
    expect(actions.some((action) => action.type === 'MOVE' && action.cardId === attackerId)).toBe(
      false,
    );
    expect(
      actions.some((action) => action.type === 'ACTIVE' && action.cardId === activeCardId),
    ).toBe(false);
    expect(actions.some((action) => action.type === 'END_TURN')).toBe(true);

    const session = BattleSession.fromState(state, fixture.cardDefinitions);
    const illegalActions: BattleAction[] = [
      {
        type: 'PLACE',
        cardId: highCostCardId,
        fieldPosition: 'FRONT_LEFT',
      },
      { type: 'ATTACK', cardId: attackerId, targetCardId: targetId },
      { type: 'MOVE', cardId: attackerId, fieldPosition: 'FRONT_LEFT' },
      { type: 'ACTIVE', cardId: activeCardId },
    ];

    for (const action of illegalActions) {
      expect(() => session.simulateAction(action)).toThrow(IllegalBattleActionError);
    }
  });

  it('locks an attacker out of later MOVE and ACTIVE actions during the same turn', () => {
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
      mutable.turnNumber = 2;
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
      moveBattleCardForTest(mutable, targetId, 'FIELD', 'FRONT_CENTER');
    });
    const session = BattleSession.fromState(state, fixture.cardDefinitions);
    const resolution = session.resolveAction({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: targetId,
    });
    const attacker = getBattleCard(resolution.finalState, attackerId);
    const remaining = session.getLegalActions();

    expect(attacker.hasAttackedThisTurn).toBe(true);
    expect(
      remaining.some(
        (action) =>
          'cardId' in action &&
          action.cardId === attackerId &&
          (action.type === 'MOVE' || action.type === 'ATTACK' || action.type === 'ACTIVE'),
      ),
    ).toBe(false);
  });

  it('allows MOVE before ATTACK and resets both usage locks on the owner next turn', () => {
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
      mutable.turnNumber = 2;
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'BACK_LEFT');
      moveBattleCardForTest(mutable, targetId, 'FIELD', 'FRONT_LEFT');
    });
    const session = BattleSession.fromState(state, fixture.cardDefinitions);

    session.resolveAction({
      type: 'MOVE',
      cardId: attackerId,
      fieldPosition: 'FRONT_LEFT',
    });
    expect(session.getState().activePlayerId).toBe('PLAYER');
    expect(session.getLegalActions()).toContainEqual({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: targetId,
    });

    session.resolveAction({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: targetId,
    });
    expect(getBattleCard(session.getState(), attackerId)).toMatchObject({
      hasMovedThisTurn: true,
      hasAttackedThisTurn: true,
    });

    session.resolveAction({ type: 'END_TURN' });
    expect(getBattleCard(session.getState(), attackerId)).toMatchObject({
      hasMovedThisTurn: true,
      hasAttackedThisTurn: true,
    });
    session.resolveAction({ type: 'END_TURN' });
    expect(session.getState().activePlayerId).toBe('PLAYER');
    expect(getBattleCard(session.getState(), attackerId)).toMatchObject({
      hasMovedThisTurn: false,
      hasAttackedThisTurn: false,
    });
  });

  it('automatically ends a turn after the last playable action is consumed', () => {
    const fixture = createPhaseFiveBattleFixture();
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      for (const cardId of [...mutable.players.PLAYER.handIds]) {
        moveBattleCardForTest(mutable, cardId, 'EXILE');
      }
    });
    const session = BattleSession.fromState(state, fixture.cardDefinitions);
    const move = requireAction(session.getLegalActions(), 'MOVE');
    const resolution = session.resolveAction(move);

    expect(resolution.finalState.activePlayerId).toBe('ENEMY');
    expect(resolution.finalState.turnNumber).toBe(2);
    expect(
      resolution.steps
        .flatMap((step) => step.events)
        .some((event) => event.type === 'TURN_ENDED' && event.playerId === 'PLAYER'),
    ).toBe(true);
  });

  it('ends the battle when the next mandatory draw finds an empty Deck', () => {
    const fixture = createPhaseFiveBattleFixture();
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      for (const cardId of [...mutable.players.ENEMY.drawPileIds]) {
        moveBattleCardForTest(mutable, cardId, 'EXILE');
      }
    });
    const session = BattleSession.fromState(state, fixture.cardDefinitions);
    const resolution = session.resolveAction({ type: 'END_TURN' });

    expect(resolution.finalState.result).toEqual({
      type: 'WIN',
      winnerId: 'PLAYER',
      loserIds: ['ENEMY'],
      reason: 'DECK_EXHAUSTED',
    });
    expect(resolution.finalState.phase).toBe('ENDED');
    expect(session.getLegalActions()).toEqual([]);
  });
});
