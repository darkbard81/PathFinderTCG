import { describe, expect, it } from 'vitest';

import type { CardDefinition } from '../../cards/card.js';
import {
  STAGE_ONE_AI_PROFILE_ID,
  STAGE_ONE_AI_SCORES,
  chooseBattleAiAction,
  getScoredBattleAiActions,
  scoreBattleAiAction,
} from './BattleAi.js';
import { battleActionKey, getLegalBattleActions, getTotalProjectedDominance } from './rules.js';
import { getBattleEffectiveStats } from './state.js';
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
    throw new Error(`${type} AI 점수 테스트 Action을 찾을 수 없습니다.`);
  }

  return action;
}

function replaceDefinition(
  definitions: readonly CardDefinition[],
  replacement: CardDefinition,
): readonly CardDefinition[] {
  return Object.freeze(
    definitions.map((definition) => (definition.id === replacement.id ? replacement : definition)),
  );
}

describe('Phase 5 deterministic rule-based AI', () => {
  it('uses the approved Stage 01 profile and exact base Action score constants', () => {
    const fixture = createPhaseFiveBattleFixture();
    const state = fixture.session.getState();
    const actions = getLegalBattleActions(state, fixture.cardDefinitions);
    const placeAction = requireAction(actions, 'PLACE');
    const drawAction = requireAction(
      actions.filter(
        (action) => action.type !== 'DRAW' || action.activeSkillSourceCardId === undefined,
      ),
      'DRAW',
    );
    const discardAction = requireAction(
      actions.filter(
        (action) => action.type !== 'DISCARD' || action.activeSkillSourceCardId === undefined,
      ),
      'DISCARD',
    );
    const endTurnAction = requireAction(
      actions.filter(
        (action) => action.type !== 'END_TURN' || action.activeSkillSourceCardId === undefined,
      ),
      'END_TURN',
    );
    const placeScore = scoreBattleAiAction(state, fixture.cardDefinitions, placeAction);
    const dominanceIncrease = Math.max(
      0,
      getTotalProjectedDominance(
        placeScore.resolution.finalState,
        fixture.cardDefinitions,
        'PLAYER',
      ) - getTotalProjectedDominance(state, fixture.cardDefinitions, 'PLAYER'),
    );
    const placedCost = getBattleEffectiveStats(
      state,
      fixture.cardDefinitions,
      placeAction.cardId,
    ).cost;

    expect(STAGE_ONE_AI_PROFILE_ID).toBe('ai-stage-01');
    expect(placeScore.breakdown.place).toBe(400);
    expect(placeScore.breakdown.projectedDominance).toBe(dominanceIncrease * 100);
    expect(placeScore.breakdown.placedCardCost).toBe(placedCost * 50);
    expect(scoreBattleAiAction(state, fixture.cardDefinitions, drawAction).score).toBe(
      STAGE_ONE_AI_SCORES.draw,
    );
    expect(scoreBattleAiAction(state, fixture.cardDefinitions, discardAction).score).toBe(
      STAGE_ONE_AI_SCORES.discard,
    );
    expect(scoreBattleAiAction(state, fixture.cardDefinitions, endTurnAction).score).toBe(
      STAGE_ONE_AI_SCORES.endTurn,
    );
  });

  it('prioritizes an immediate opposing-leader defeat over every other legal action', () => {
    const fixture = createPhaseFiveBattleFixture();
    const attackerId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-amber-duelist',
    );
    const enemyLeaderId = fixture.session.getState().players.ENEMY.leaderCardId;
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
      const enemyLeader = mutable.cards.find((card) => card.id === enemyLeaderId);

      if (enemyLeader === undefined) {
        throw new Error('적 리더를 찾을 수 없습니다.');
      }
      enemyLeader.damage = 18;
    });
    const selected = chooseBattleAiAction(state, fixture.cardDefinitions);
    const score = scoreBattleAiAction(state, fixture.cardDefinitions, selected);

    expect(selected).toEqual({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: enemyLeaderId,
    });
    expect(score.breakdown.opponentLeaderDefeated).toBe(100_000);
  });

  it('breaks equal scores by Action string and then Field index', () => {
    const fixture = createPhaseFiveBattleFixture();
    const attackerId = findBattleCardId(
      fixture.session.getState(),
      'PLAYER',
      'allied-sunroot-pathfinder',
    );
    const leftTargetId = findBattleCardId(
      fixture.session.getState(),
      'ENEMY',
      'enemy-nightroot-scout',
    );
    const rightTargetId = findBattleCardId(
      fixture.session.getState(),
      'ENEMY',
      'enemy-shadow-cartographer',
    );
    const baseAttackerDefinition = fixture.cardDefinitions.find(
      (definition) => definition.id === 'allied-sunroot-pathfinder',
    );

    if (baseAttackerDefinition === undefined) {
      throw new Error('AI 동점 테스트 공격자 정의를 찾을 수 없습니다.');
    }

    const definitions = replaceDefinition(fixture.cardDefinitions, {
      ...baseAttackerDefinition,
      hp: 10,
      attack: 0,
      passiveSkill: undefined,
    });
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      for (const cardId of [
        ...mutable.players.PLAYER.handIds,
        ...mutable.players.PLAYER.drawPileIds,
      ]) {
        moveBattleCardForTest(mutable, cardId, 'EXILE');
      }

      const fillerIds = mutable.cards
        .filter(
          (card) =>
            card.ownerId === 'PLAYER' &&
            card.id !== attackerId &&
            card.id !== mutable.players.PLAYER.leaderCardId,
        )
        .slice(0, 4)
        .map((card) => card.id);
      const positions = ['FRONT_LEFT', 'FRONT_RIGHT', 'BACK_LEFT', 'BACK_RIGHT'] as const;

      moveBattleCardForTest(mutable, attackerId, 'FIELD', 'FRONT_CENTER');
      positions.forEach((position, index) => {
        const fillerId = fillerIds[index];

        if (fillerId === undefined) {
          throw new Error('AI 동점 테스트 Field filler가 부족합니다.');
        }
        moveBattleCardForTest(mutable, fillerId, 'FIELD', position);
      });
      moveBattleCardForTest(mutable, leftTargetId, 'FIELD', 'FRONT_LEFT');
      moveBattleCardForTest(mutable, rightTargetId, 'FIELD', 'FRONT_RIGHT');
    });
    const scored = getScoredBattleAiActions(state, definitions);

    expect(scored.every((entry) => entry.score === 0)).toBe(true);
    expect(scored[0]?.action).toEqual({
      type: 'ATTACK',
      cardId: attackerId,
      targetCardId: leftTargetId,
    });
    expect(scored.at(-1)?.action.type).toBe('END_TURN');
  });

  it('uses card definition ID after equal PLACE scores and Field indexes', () => {
    const fixture = createPhaseFiveBattleFixture();
    const amberId = findBattleCardId(fixture.session.getState(), 'PLAYER', 'allied-amber-duelist');
    const scribeId = findBattleCardId(fixture.session.getState(), 'PLAYER', 'allied-dawn-scribe');
    const state = editBattleState(fixture.session.getState(), (mutable) => {
      for (const cardId of [...mutable.players.PLAYER.handIds]) {
        moveBattleCardForTest(mutable, cardId, 'EXILE');
      }
      moveBattleCardForTest(mutable, amberId, 'HAND');
      moveBattleCardForTest(mutable, scribeId, 'HAND');
    });
    const selected = chooseBattleAiAction(state, fixture.cardDefinitions);
    const matchingScores = getScoredBattleAiActions(state, fixture.cardDefinitions).filter(
      (entry) =>
        entry.action.type === 'PLACE' &&
        entry.action.fieldPosition === 'FRONT_CENTER' &&
        (entry.action.cardId === amberId || entry.action.cardId === scribeId) &&
        entry.action.activeSkillSourceCardId === undefined,
    );

    expect(matchingScores).toHaveLength(2);
    expect(matchingScores[0]?.score).toBe(matchingScores[1]?.score);
    expect(selected).toEqual({
      type: 'PLACE',
      cardId: amberId,
      fieldPosition: 'FRONT_CENTER',
    });
  });

  it('returns the same decision for the same state and does not depend on opponent hidden-card order', () => {
    const fixture = createPhaseFiveBattleFixture();
    const state = fixture.session.getState();
    const hiddenOrderVariant = editBattleState(state, (mutable) => {
      const firstHandId = mutable.players.ENEMY.handIds[0];
      const firstDeckId = mutable.players.ENEMY.drawPileIds[0];

      if (firstHandId === undefined || firstDeckId === undefined) {
        throw new Error('AI 비공개 정보 테스트 카드가 부족합니다.');
      }

      mutable.players.ENEMY.handIds[0] = firstDeckId;
      mutable.players.ENEMY.drawPileIds[0] = firstHandId;
    });
    const first = chooseBattleAiAction(state, fixture.cardDefinitions);
    const repeated = chooseBattleAiAction(state, fixture.cardDefinitions);
    const hiddenVariant = chooseBattleAiAction(hiddenOrderVariant, fixture.cardDefinitions);

    expect(repeated).toEqual(first);
    expect(hiddenVariant).toEqual(first);
  });

  it('uses only legal actions and finishes a valid 30-card AI-vs-AI battle without an infinite turn', () => {
    const fixture = createPhaseFiveBattleFixture(0x0bad_c0de);
    const session = fixture.session;
    const repeatedFixture = createPhaseFiveBattleFixture(0x0bad_c0de);
    const repeatedSession = repeatedFixture.session;
    const selectedActions: BattleAction[] = [];

    while (session.getState().result.type === 'ONGOING') {
      if (selectedActions.length >= 128) {
        throw new Error('AI 전투가 128 Action 안에 끝나지 않았습니다.');
      }

      const legalActionKeys = new Set(
        session.getLegalActions().map((action) => battleActionKey(action)),
      );
      const action = chooseBattleAiAction(session.getState(), fixture.cardDefinitions);
      const repeatedAction = chooseBattleAiAction(
        repeatedSession.getState(),
        repeatedFixture.cardDefinitions,
      );

      expect(legalActionKeys.has(battleActionKey(action))).toBe(true);
      expect(repeatedAction).toEqual(action);
      selectedActions.push(action);
      session.resolveAction(action);
      repeatedSession.resolveAction(repeatedAction);
    }

    expect(selectedActions.length).toBeGreaterThan(0);
    expect(selectedActions.length).toBeLessThan(128);
    expect(session.getState().result.type).not.toBe('ONGOING');
    expect(session.getLegalActions()).toEqual([]);
    expect(repeatedSession.getState()).toEqual(session.getState());
    expect(new Set(selectedActions.map((action) => action.type)).size).toBeGreaterThan(1);
  });
});
