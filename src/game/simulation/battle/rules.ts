import type { CardDefinition } from '../../cards/card.js';
import type { BattleFieldPosition, StableId } from '../../data/contracts.js';
import {
  getAdjacentBattleFields,
  getAttackTargetCardIds,
  getBattleCard,
  getBattleEffectiveStats,
  getCardDefinition,
  getFieldDominance,
  locateBattleCard,
} from './state.js';
import {
  BATTLE_FIELD_POSITIONS,
  type BattleAction,
  type BattlePlayerId,
  type BattleState,
} from './types.js';

function freezeAction<T extends BattleAction>(action: T): T {
  return Object.freeze({ ...action });
}

export function battleActionKey(action: BattleAction): string {
  switch (action.type) {
    case 'PLACE':
      return `PLACE:${action.cardId}:${action.fieldPosition}`;
    case 'MOVE':
      return `MOVE:${action.cardId}:${action.fieldPosition}`;
    case 'ATTACK':
      return `ATTACK:${action.cardId}:${action.targetCardId}`;
    case 'ACTIVE':
      return `ACTIVE:${action.cardId}:${action.targetCardId ?? ''}`;
    case 'END_TURN':
      return 'END_TURN';
  }
}

function activeSkillRequiresActionTarget(
  cardDefinitions: readonly CardDefinition[],
  state: BattleState,
  cardId: StableId,
): boolean {
  const card = getBattleCard(state, cardId);
  const definition = getCardDefinition(cardDefinitions, card.cardDefinitionId);
  return (
    definition.activeSkill?.effects.some((effect) => effect.target === 'ACTION_TARGET') ?? false
  );
}

export function getActiveSkillTargetCardIds(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
  playerId: BattlePlayerId,
  cardId: StableId,
): readonly StableId[] {
  const location = locateBattleCard(state, cardId);
  const card = getBattleCard(state, cardId);
  const definition = getCardDefinition(cardDefinitions, card.cardDefinitionId);
  const activeSkill = definition.activeSkill;

  if (
    location.playerId !== playerId ||
    location.zone !== 'FIELD' ||
    activeSkill === undefined ||
    !activeSkillRequiresActionTarget(cardDefinitions, state, cardId)
  ) {
    return Object.freeze([]);
  }

  return activeSkill.action === 'ATTACK'
    ? getAttackTargetCardIds(state, cardId)
    : Object.freeze([]);
}

export function getLegalPlacementPositions(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
  playerId: BattlePlayerId,
  cardId: StableId,
): readonly BattleFieldPosition[] {
  const card = getBattleCard(state, cardId);
  const location = locateBattleCard(state, cardId);
  const definition = getCardDefinition(cardDefinitions, card.cardDefinitionId);

  if (location.playerId !== playerId || location.zone !== 'HAND' || definition.type !== 'UNIT') {
    return Object.freeze([]);
  }

  const cost = getBattleEffectiveStats(state, cardDefinitions, cardId).cost;
  return Object.freeze(
    BATTLE_FIELD_POSITIONS.filter(
      (position) =>
        state.players[playerId].field[position] === null &&
        getFieldDominance(state, cardDefinitions, playerId, position) >= cost,
    ),
  );
}

export function getLegalBattleActions(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
): readonly BattleAction[] {
  if (state.phase !== 'ACTION' || state.result.type !== 'ONGOING') {
    return Object.freeze([]);
  }

  const playerId = state.activePlayerId;
  const player = state.players[playerId];
  const actions: BattleAction[] = [];

  for (const cardId of player.handIds) {
    for (const fieldPosition of getLegalPlacementPositions(
      state,
      cardDefinitions,
      playerId,
      cardId,
    )) {
      actions.push(freezeAction({ type: 'PLACE', cardId, fieldPosition }));
    }
  }

  for (const position of BATTLE_FIELD_POSITIONS) {
    const cardId = player.field[position];

    if (cardId === null) {
      continue;
    }

    const card = getBattleCard(state, cardId);

    if (card.isDeploymentPending) {
      continue;
    }

    if (!card.hasMovedThisTurn && !card.hasAttackedThisTurn) {
      for (const fieldPosition of getAdjacentBattleFields(position)) {
        if (player.field[fieldPosition] === null) {
          actions.push(freezeAction({ type: 'MOVE', cardId, fieldPosition }));
        }
      }
    }

    if (state.turnNumber > 1 && !card.hasAttackedThisTurn) {
      for (const targetCardId of getAttackTargetCardIds(state, cardId)) {
        actions.push(freezeAction({ type: 'ATTACK', cardId, targetCardId }));
      }
    }

    const definition = getCardDefinition(cardDefinitions, card.cardDefinitionId);
    if (
      state.turnNumber > 1 &&
      !card.hasAttackedThisTurn &&
      !card.hasUsedActiveSkillThisTurn &&
      definition.activeSkill !== undefined
    ) {
      if (activeSkillRequiresActionTarget(cardDefinitions, state, cardId)) {
        for (const targetCardId of getActiveSkillTargetCardIds(
          state,
          cardDefinitions,
          playerId,
          cardId,
        )) {
          actions.push(freezeAction({ type: 'ACTIVE', cardId, targetCardId }));
        }
      } else {
        actions.push(freezeAction({ type: 'ACTIVE', cardId }));
      }
    }
  }

  actions.push(freezeAction({ type: 'END_TURN' }));

  return Object.freeze(actions);
}

export function hasPlayableBattleActions(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
): boolean {
  return getLegalBattleActions(state, cardDefinitions).some((action) => action.type !== 'END_TURN');
}

export function isLegalBattleAction(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
  action: BattleAction,
): boolean {
  const key = battleActionKey(action);
  return getLegalBattleActions(state, cardDefinitions).some(
    (candidate) => battleActionKey(candidate) === key,
  );
}

export function isAttackStillLegal(
  state: BattleState,
  attackerCardId: StableId,
  targetCardId: StableId,
): boolean {
  if (state.phase !== 'ACTION' || state.result.type !== 'ONGOING') {
    return false;
  }

  const attacker = getBattleCard(state, attackerCardId);
  const location = locateBattleCard(state, attackerCardId);

  return (
    location.playerId === state.activePlayerId &&
    location.zone === 'FIELD' &&
    !attacker.isDeploymentPending &&
    getAttackTargetCardIds(state, attackerCardId).includes(targetCardId)
  );
}

export function getTotalProjectedDominance(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
  playerId: BattlePlayerId,
): number {
  return BATTLE_FIELD_POSITIONS.reduce(
    (total, position) => total + getFieldDominance(state, cardDefinitions, playerId, position),
    0,
  );
}
