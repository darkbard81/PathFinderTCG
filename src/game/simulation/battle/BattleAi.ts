import type { CardDefinition } from '../../cards/card.js';
import type { BattleFieldPosition, StableId } from '../../data/contracts.js';
import {
  DETERMINISTIC_BATTLE_DECISIONS,
  resolveBattleAction,
  type BattleSession,
} from './BattleSession.js';
import {
  battleActionKey,
  getLegalBattleActions,
  getLegalPlacementPositions,
  getTotalProjectedDominance,
} from './rules.js';
import {
  getAttackTargetCardIds,
  getBattleCard,
  getBattleEffectiveStats,
  getBattleFieldIndex,
  getCardDefinition,
  locateBattleCard,
  otherBattlePlayerId,
} from './state.js';
import {
  BATTLE_FIELD_POSITIONS,
  type ActionResolution,
  type BattleAction,
  type BattlePlayerId,
  type BattleState,
} from './types.js';

export const STAGE_ONE_AI_PROFILE_ID = 'ai-stage-01' as const;

export const STAGE_ONE_AI_SCORES = Object.freeze({
  opponentLeaderDefeated: 100_000,
  ownLeaderDefeated: -100_000,
  opponentUnitDestroyed: 5_000,
  opponentLeaderDamage: 1_000,
  opponentUnitDamage: 250,
  place: 400,
  projectedDominance: 100,
  placedCardCost: 50,
  moveOpensRoute: 300,
  draw: 200,
  discard: 50,
  endTurn: 0,
} as const);

export interface BattleAiScoreBreakdown {
  readonly opponentLeaderDefeated: number;
  readonly ownLeaderDefeated: number;
  readonly opponentUnitsDestroyed: number;
  readonly opponentLeaderDamage: number;
  readonly opponentUnitDamage: number;
  readonly place: number;
  readonly projectedDominance: number;
  readonly placedCardCost: number;
  readonly moveOpensRoute: number;
  readonly draw: number;
  readonly discard: number;
  readonly endTurn: number;
}

export interface ScoredBattleAction {
  readonly action: BattleAction;
  readonly score: number;
  readonly breakdown: BattleAiScoreBreakdown;
  readonly resolution: ActionResolution;
}

export interface BattleAiGameResult {
  readonly finalState: BattleState;
  readonly actions: readonly BattleAction[];
  readonly actionCount: number;
}

function getCardDamageIncrease(
  beforeState: BattleState,
  afterState: BattleState,
  cardId: StableId,
): number {
  const beforeLocation = locateBattleCard(beforeState, cardId);
  const afterLocation = locateBattleCard(afterState, cardId);

  if (beforeLocation.zone !== 'FIELD' || afterLocation.zone !== 'FIELD') {
    return 0;
  }

  const beforeCard = getBattleCard(beforeState, cardId);
  const afterCard = getBattleCard(afterState, cardId);
  return Math.max(0, afterCard.damage - beforeCard.damage);
}

function countPlacementRoutes(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
  playerId: BattlePlayerId,
): number {
  return state.players[playerId].handIds.reduce(
    (total, cardId) =>
      total + getLegalPlacementPositions(state, cardDefinitions, playerId, cardId).length,
    0,
  );
}

function moveOpensRoute(
  beforeState: BattleState,
  afterState: BattleState,
  cardDefinitions: readonly CardDefinition[],
  action: Extract<BattleAction, { readonly type: 'MOVE' }>,
  playerId: BattlePlayerId,
): boolean {
  const beforeAttackTargets = getAttackTargetCardIds(beforeState, action.cardId);
  const afterLocation = locateBattleCard(afterState, action.cardId);
  const afterCard = getBattleCard(afterState, action.cardId);
  const afterAttackTargets =
    afterLocation.zone === 'FIELD' && !afterCard.isDeploymentPending
      ? getAttackTargetCardIds(afterState, action.cardId)
      : Object.freeze([]);
  const openedAttack = beforeAttackTargets.length === 0 && afterAttackTargets.length > 0;
  const openedPlacement =
    countPlacementRoutes(afterState, cardDefinitions, playerId) >
    countPlacementRoutes(beforeState, cardDefinitions, playerId);

  return openedAttack || openedPlacement;
}

function sumBreakdown(breakdown: BattleAiScoreBreakdown): number {
  return (
    breakdown.opponentLeaderDefeated +
    breakdown.ownLeaderDefeated +
    breakdown.opponentUnitsDestroyed +
    breakdown.opponentLeaderDamage +
    breakdown.opponentUnitDamage +
    breakdown.place +
    breakdown.projectedDominance +
    breakdown.placedCardCost +
    breakdown.moveOpensRoute +
    breakdown.draw +
    breakdown.discard +
    breakdown.endTurn
  );
}

export function scoreBattleAiAction(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
  action: BattleAction,
): ScoredBattleAction {
  const actorId = state.activePlayerId;
  const opponentId = otherBattlePlayerId(actorId);
  const resolution = resolveBattleAction(
    state,
    cardDefinitions,
    action,
    DETERMINISTIC_BATTLE_DECISIONS,
  );
  const finalState = resolution.finalState;
  const opponentLeaderDefeated =
    finalState.result.type !== 'ONGOING' && finalState.result.loserIds.includes(opponentId)
      ? STAGE_ONE_AI_SCORES.opponentLeaderDefeated
      : 0;
  const ownLeaderDefeated =
    finalState.result.type !== 'ONGOING' && finalState.result.loserIds.includes(actorId)
      ? STAGE_ONE_AI_SCORES.ownLeaderDefeated
      : 0;
  const destroyedOpponentUnitIds = new Set<StableId>();

  for (const step of resolution.steps) {
    for (const event of step.events) {
      if (event.type !== 'DESTROY') {
        continue;
      }

      const card = getBattleCard(state, event.cardId);
      const definition = getCardDefinition(cardDefinitions, card.cardDefinitionId);

      if (card.ownerId === opponentId && definition.type === 'UNIT') {
        destroyedOpponentUnitIds.add(card.id);
      }
    }
  }

  const opponentLeaderId = state.players[opponentId].leaderCardId;
  const opponentLeaderDamage = getCardDamageIncrease(state, finalState, opponentLeaderId);
  const opponentUnitDamage = BATTLE_FIELD_POSITIONS.reduce((total, position) => {
    const cardId = state.players[opponentId].field[position];

    if (cardId === null || cardId === opponentLeaderId) {
      return total;
    }

    return total + getCardDamageIncrease(state, finalState, cardId);
  }, 0);
  let place = 0;
  let projectedDominance = 0;
  let placedCardCost = 0;
  let moveRoute = 0;
  let draw = 0;
  let discard = 0;
  let endTurn = 0;

  switch (action.type) {
    case 'PLACE': {
      place = STAGE_ONE_AI_SCORES.place;
      const dominanceIncrease = Math.max(
        0,
        getTotalProjectedDominance(finalState, cardDefinitions, actorId) -
          getTotalProjectedDominance(state, cardDefinitions, actorId),
      );
      projectedDominance = dominanceIncrease * STAGE_ONE_AI_SCORES.projectedDominance;
      placedCardCost =
        getBattleEffectiveStats(state, cardDefinitions, action.cardId).cost *
        STAGE_ONE_AI_SCORES.placedCardCost;
      break;
    }
    case 'MOVE':
      moveRoute = moveOpensRoute(state, finalState, cardDefinitions, action, actorId)
        ? STAGE_ONE_AI_SCORES.moveOpensRoute
        : 0;
      break;
    case 'DRAW':
      draw = STAGE_ONE_AI_SCORES.draw;
      break;
    case 'DISCARD':
      discard = STAGE_ONE_AI_SCORES.discard;
      break;
    case 'END_TURN':
      endTurn = STAGE_ONE_AI_SCORES.endTurn;
      break;
    case 'ATTACK':
      break;
  }

  const breakdown: BattleAiScoreBreakdown = Object.freeze({
    opponentLeaderDefeated,
    ownLeaderDefeated,
    opponentUnitsDestroyed:
      destroyedOpponentUnitIds.size * STAGE_ONE_AI_SCORES.opponentUnitDestroyed,
    opponentLeaderDamage: opponentLeaderDamage * STAGE_ONE_AI_SCORES.opponentLeaderDamage,
    opponentUnitDamage: opponentUnitDamage * STAGE_ONE_AI_SCORES.opponentUnitDamage,
    place,
    projectedDominance,
    placedCardCost,
    moveOpensRoute: moveRoute,
    draw,
    discard,
    endTurn,
  });

  return Object.freeze({
    action,
    score: sumBreakdown(breakdown),
    breakdown,
    resolution,
  });
}

function getActionFieldPosition(
  state: BattleState,
  action: BattleAction,
): BattleFieldPosition | null {
  switch (action.type) {
    case 'PLACE':
    case 'MOVE':
      return action.fieldPosition;
    case 'ATTACK': {
      const location = locateBattleCard(state, action.targetCardId);
      return location.fieldPosition;
    }
    case 'DRAW':
    case 'DISCARD':
    case 'END_TURN':
      return null;
  }
}

function getActionCardDefinitionId(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
  action: BattleAction,
): StableId {
  let cardId: StableId | undefined;

  switch (action.type) {
    case 'PLACE':
    case 'MOVE':
    case 'ATTACK':
    case 'DISCARD':
      cardId = action.cardId;
      break;
    case 'DRAW':
    case 'END_TURN':
      cardId = action.activeSkillSourceCardId;
      break;
  }

  if (cardId === undefined) {
    return '';
  }

  const card = getBattleCard(state, cardId);
  return getCardDefinition(cardDefinitions, card.cardDefinitionId).id;
}

function compareScoredActions(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
  left: ScoredBattleAction,
  right: ScoredBattleAction,
): number {
  const scoreComparison = right.score - left.score;

  if (scoreComparison !== 0) {
    return scoreComparison;
  }

  const typeComparison = left.action.type.localeCompare(right.action.type);

  if (typeComparison !== 0) {
    return typeComparison;
  }

  const leftField = getActionFieldPosition(state, left.action);
  const rightField = getActionFieldPosition(state, right.action);
  const fieldComparison =
    (leftField === null ? Number.MAX_SAFE_INTEGER : getBattleFieldIndex(leftField)) -
    (rightField === null ? Number.MAX_SAFE_INTEGER : getBattleFieldIndex(rightField));

  if (fieldComparison !== 0) {
    return fieldComparison;
  }

  const definitionComparison = getActionCardDefinitionId(
    state,
    cardDefinitions,
    left.action,
  ).localeCompare(getActionCardDefinitionId(state, cardDefinitions, right.action));

  if (definitionComparison !== 0) {
    return definitionComparison;
  }

  /**
   * 같은 정의의 복사본은 승인된 세 동점 키가 완전히 같다. 이때만 전투 인스턴스 ID를 최종
   * 안정화 키로 사용하며 점수나 공개 카드 정보는 추가로 읽지 않는다.
   */
  return battleActionKey(left.action).localeCompare(battleActionKey(right.action));
}

export function getScoredBattleAiActions(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
): readonly ScoredBattleAction[] {
  return Object.freeze(
    getLegalBattleActions(state, cardDefinitions)
      .map((action) => scoreBattleAiAction(state, cardDefinitions, action))
      .sort((left, right) => compareScoredActions(state, cardDefinitions, left, right)),
  );
}

export function chooseBattleAiAction(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
): BattleAction {
  const selected = getScoredBattleAiActions(state, cardDefinitions)[0];

  if (selected === undefined) {
    throw new Error('AI가 선택할 합법 전투 Action이 없습니다.');
  }

  return selected.action;
}

export function playBattleWithRuleBasedAi(
  session: BattleSession,
  cardDefinitions: readonly CardDefinition[],
  maximumActions = 256,
): BattleAiGameResult {
  const actions: BattleAction[] = [];

  while (session.getState().result.type === 'ONGOING') {
    if (actions.length >= maximumActions) {
      throw new Error(`AI 전투가 ${maximumActions} Action 안에 끝나지 않았습니다.`);
    }

    const action = chooseBattleAiAction(session.getState(), cardDefinitions);
    actions.push(action);
    session.resolveAction(action, DETERMINISTIC_BATTLE_DECISIONS);
  }

  return Object.freeze({
    finalState: session.getState(),
    actions: Object.freeze(actions),
    actionCount: actions.length,
  });
}
