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
    case 'DRAW':
      return `DRAW:${action.activeSkillSourceCardId ?? ''}`;
    case 'PLACE':
      return `PLACE:${action.cardId}:${action.fieldPosition}:${
        action.activeSkillSourceCardId ?? ''
      }`;
    case 'MOVE':
      return `MOVE:${action.cardId}:${action.fieldPosition}`;
    case 'ATTACK':
      return `ATTACK:${action.cardId}:${action.targetCardId}`;
    case 'DISCARD':
      return `DISCARD:${action.cardId}:${action.activeSkillSourceCardId ?? ''}`;
    case 'END_TURN':
      return `END_TURN:${action.activeSkillSourceCardId ?? ''}`;
  }
}

function getEligibleActiveSkillSourceIds(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
  playerId: BattlePlayerId,
  actionType: 'DRAW' | 'PLACE' | 'DISCARD' | 'END_TURN',
): readonly StableId[] {
  const player = state.players[playerId];
  const sourceIds: StableId[] = [];

  for (const position of BATTLE_FIELD_POSITIONS) {
    const cardId = player.field[position];

    if (cardId === null) {
      continue;
    }

    const card = getBattleCard(state, cardId);
    const definition = getCardDefinition(cardDefinitions, card.cardDefinitionId);

    if (
      !card.isDeploymentPending &&
      definition.activeSkill !== undefined &&
      definition.activeSkill.action === actionType
    ) {
      sourceIds.push(cardId);
    }
  }

  return Object.freeze(sourceIds);
}

function getActiveSourceVariants(sourceIds: readonly StableId[]): readonly (StableId | null)[] {
  return Object.freeze([null, ...sourceIds]);
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

  if (player.drawPileIds.length > 0) {
    const sourceIds = getEligibleActiveSkillSourceIds(state, cardDefinitions, playerId, 'DRAW');

    for (const sourceId of getActiveSourceVariants(sourceIds)) {
      actions.push(
        sourceId === null
          ? freezeAction({ type: 'DRAW' })
          : freezeAction({ type: 'DRAW', activeSkillSourceCardId: sourceId }),
      );
    }
  }

  const placeSourceIds = getEligibleActiveSkillSourceIds(state, cardDefinitions, playerId, 'PLACE');

  for (const cardId of player.handIds) {
    for (const fieldPosition of getLegalPlacementPositions(
      state,
      cardDefinitions,
      playerId,
      cardId,
    )) {
      for (const sourceId of getActiveSourceVariants(placeSourceIds)) {
        actions.push(
          sourceId === null
            ? freezeAction({ type: 'PLACE', cardId, fieldPosition })
            : freezeAction({
                type: 'PLACE',
                cardId,
                fieldPosition,
                activeSkillSourceCardId: sourceId,
              }),
        );
      }
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

    for (const fieldPosition of getAdjacentBattleFields(position)) {
      if (player.field[fieldPosition] === null) {
        actions.push(freezeAction({ type: 'MOVE', cardId, fieldPosition }));
      }
    }

    for (const targetCardId of getAttackTargetCardIds(state, cardId)) {
      actions.push(freezeAction({ type: 'ATTACK', cardId, targetCardId }));
    }
  }

  const discardSourceIds = getEligibleActiveSkillSourceIds(
    state,
    cardDefinitions,
    playerId,
    'DISCARD',
  );

  for (const cardId of player.handIds) {
    const card = getBattleCard(state, cardId);
    const definition = getCardDefinition(cardDefinitions, card.cardDefinitionId);

    if (definition.type !== 'UNIT') {
      continue;
    }

    for (const sourceId of getActiveSourceVariants(discardSourceIds)) {
      actions.push(
        sourceId === null
          ? freezeAction({ type: 'DISCARD', cardId })
          : freezeAction({
              type: 'DISCARD',
              cardId,
              activeSkillSourceCardId: sourceId,
            }),
      );
    }
  }

  const endTurnSourceIds = getEligibleActiveSkillSourceIds(
    state,
    cardDefinitions,
    playerId,
    'END_TURN',
  );

  for (const sourceId of getActiveSourceVariants(endTurnSourceIds)) {
    actions.push(
      sourceId === null
        ? freezeAction({ type: 'END_TURN' })
        : freezeAction({ type: 'END_TURN', activeSkillSourceCardId: sourceId }),
    );
  }

  return Object.freeze(actions);
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
