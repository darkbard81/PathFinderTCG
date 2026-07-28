import type { CardDefinition } from '../../cards/card.js';
import type {
  BattleCardSource,
  BattleFieldPosition,
  CardStatusId,
  StableId,
} from '../../data/contracts.js';
import {
  BATTLE_FIELD_POSITIONS,
  type BattleAction,
  type BattleCardLocation,
  type BattleCardState,
  type BattleEffectiveStats,
  type BattleFieldState,
  type BattlePlayerId,
  type BattlePlayerState,
  type BattleResult,
  type BattleState,
  type BattleStatModifiers,
} from './types.js';

export interface MutableBattleStatModifiers {
  ATTACK: number;
  HEALTH: number;
  COST: number;
  DOMINANCE: number;
}

export interface MutableBattleCardState {
  id: StableId;
  cardDefinitionId: StableId;
  ownerId: BattlePlayerId;
  source: BattleCardSource;
  damage: number;
  statusIds: CardStatusId[];
  isDeploymentPending: boolean;
  statModifiers: MutableBattleStatModifiers;
  lastDamageSourceCardId: StableId | null;
}

export type MutableBattleFieldState = Record<BattleFieldPosition, StableId | null>;

export interface MutableBattlePlayerState {
  id: BattlePlayerId;
  battleDeckId: StableId;
  leaderCardId: StableId;
  drawPileIds: StableId[];
  handIds: StableId[];
  field: MutableBattleFieldState;
  dropIds: StableId[];
  exileIds: StableId[];
  requiredDrawFailed: boolean;
}

export interface MutableBattleState {
  schemaVersion: 1;
  seed: number;
  firstPlayerId: BattlePlayerId;
  activePlayerId: BattlePlayerId;
  turnNumber: number;
  actionCount: number;
  phase: 'ACTION' | 'ENDED';
  lastAction: BattleAction | null;
  players: Record<BattlePlayerId, MutableBattlePlayerState>;
  cards: MutableBattleCardState[];
  result: BattleResult;
}

const FIELD_COORDINATES: Readonly<
  Record<BattleFieldPosition, { readonly row: 0 | 1; readonly column: 0 | 1 | 2 }>
> = Object.freeze({
  FRONT_LEFT: Object.freeze({ row: 0, column: 0 }),
  FRONT_CENTER: Object.freeze({ row: 0, column: 1 }),
  FRONT_RIGHT: Object.freeze({ row: 0, column: 2 }),
  BACK_LEFT: Object.freeze({ row: 1, column: 0 }),
  BACK_CENTER: Object.freeze({ row: 1, column: 1 }),
  BACK_RIGHT: Object.freeze({ row: 1, column: 2 }),
});

const POSITION_BY_COORDINATE = new Map<string, BattleFieldPosition>(
  BATTLE_FIELD_POSITIONS.map((position) => {
    const coordinate = FIELD_COORDINATES[position];
    return [`${coordinate.row}:${coordinate.column}`, position];
  }),
);

export function otherBattlePlayerId(playerId: BattlePlayerId): BattlePlayerId {
  return playerId === 'PLAYER' ? 'ENEMY' : 'PLAYER';
}

export function getBattleFieldIndex(position: BattleFieldPosition): number {
  return BATTLE_FIELD_POSITIONS.indexOf(position);
}

export function getAdjacentBattleFields(
  position: BattleFieldPosition,
): readonly BattleFieldPosition[] {
  const coordinate = FIELD_COORDINATES[position];
  const positions: BattleFieldPosition[] = [];
  const candidates = [
    [coordinate.row === 0 ? 1 : 0, coordinate.column],
    [coordinate.row, coordinate.column - 1],
    [coordinate.row, coordinate.column + 1],
  ] as const;

  for (const [row, column] of candidates) {
    const adjacent = POSITION_BY_COORDINATE.get(`${row}:${column}`);

    if (adjacent !== undefined) {
      positions.push(adjacent);
    }
  }

  return Object.freeze(positions);
}

export function createEmptyBattleField(): MutableBattleFieldState {
  return {
    FRONT_LEFT: null,
    FRONT_CENTER: null,
    FRONT_RIGHT: null,
    BACK_LEFT: null,
    BACK_CENTER: null,
    BACK_RIGHT: null,
  };
}

export function createEmptyStatModifiers(): MutableBattleStatModifiers {
  return {
    ATTACK: 0,
    HEALTH: 0,
    COST: 0,
    DOMINANCE: 0,
  };
}

function cloneBattleAction(action: BattleAction | null): BattleAction | null {
  return action === null ? null : { ...action };
}

function cloneBattleResult(result: BattleResult): BattleResult {
  if (result.type === 'ONGOING') {
    return {
      type: 'ONGOING',
      winnerId: null,
      loserIds: [],
      reason: null,
    };
  }

  if (result.type === 'WIN') {
    return {
      type: 'WIN',
      winnerId: result.winnerId,
      loserIds: [result.loserIds[0]],
      reason: result.reason,
    };
  }

  return {
    type: 'DRAW',
    winnerId: null,
    loserIds: [result.loserIds[0], result.loserIds[1]],
    reason: result.reason,
  };
}

function cloneCardSource(source: BattleCardSource): BattleCardSource {
  return { ...source };
}

export function cloneBattleState(state: BattleState): MutableBattleState {
  const clonePlayer = (player: BattlePlayerState): MutableBattlePlayerState => ({
    id: player.id,
    battleDeckId: player.battleDeckId,
    leaderCardId: player.leaderCardId,
    drawPileIds: [...player.drawPileIds],
    handIds: [...player.handIds],
    field: { ...player.field },
    dropIds: [...player.dropIds],
    exileIds: [...player.exileIds],
    requiredDrawFailed: player.requiredDrawFailed,
  });

  return {
    schemaVersion: 1,
    seed: state.seed,
    firstPlayerId: state.firstPlayerId,
    activePlayerId: state.activePlayerId,
    turnNumber: state.turnNumber,
    actionCount: state.actionCount,
    phase: state.phase,
    lastAction: cloneBattleAction(state.lastAction),
    players: {
      PLAYER: clonePlayer(state.players.PLAYER),
      ENEMY: clonePlayer(state.players.ENEMY),
    },
    cards: state.cards.map((card) => ({
      id: card.id,
      cardDefinitionId: card.cardDefinitionId,
      ownerId: card.ownerId,
      source: cloneCardSource(card.source),
      damage: card.damage,
      statusIds: [...card.statusIds],
      isDeploymentPending: card.isDeploymentPending,
      statModifiers: { ...card.statModifiers },
      lastDamageSourceCardId: card.lastDamageSourceCardId,
    })),
    result: cloneBattleResult(state.result),
  };
}

function freezeBattleAction(action: BattleAction | null): BattleAction | null {
  return action === null ? null : Object.freeze({ ...action });
}

function freezeBattleResult(result: BattleResult): BattleResult {
  if (result.type === 'ONGOING') {
    const loserIds: readonly [] = [];
    return Object.freeze({
      type: 'ONGOING',
      winnerId: null,
      loserIds: Object.freeze(loserIds),
      reason: null,
    });
  }

  if (result.type === 'WIN') {
    const loserIds: readonly [(typeof result.loserIds)[0]] = [result.loserIds[0]];
    return Object.freeze({
      type: 'WIN',
      winnerId: result.winnerId,
      loserIds: Object.freeze(loserIds),
      reason: result.reason,
    });
  }

  const loserIds: readonly [(typeof result.loserIds)[0], (typeof result.loserIds)[1]] = [
    result.loserIds[0],
    result.loserIds[1],
  ];
  return Object.freeze({
    type: 'DRAW',
    winnerId: null,
    loserIds: Object.freeze(loserIds),
    reason: result.reason,
  });
}

function freezeField(field: MutableBattleFieldState): BattleFieldState {
  return Object.freeze({ ...field });
}

function freezeStatModifiers(modifiers: MutableBattleStatModifiers): BattleStatModifiers {
  return Object.freeze({ ...modifiers });
}

function freezeCard(card: MutableBattleCardState): BattleCardState {
  return Object.freeze({
    id: card.id,
    cardDefinitionId: card.cardDefinitionId,
    ownerId: card.ownerId,
    source: Object.freeze({ ...card.source }),
    damage: card.damage,
    statusIds: Object.freeze([...card.statusIds]),
    isDeploymentPending: card.isDeploymentPending,
    statModifiers: freezeStatModifiers(card.statModifiers),
    lastDamageSourceCardId: card.lastDamageSourceCardId,
  });
}

function freezePlayer(player: MutableBattlePlayerState): BattlePlayerState {
  return Object.freeze({
    id: player.id,
    battleDeckId: player.battleDeckId,
    leaderCardId: player.leaderCardId,
    drawPileIds: Object.freeze([...player.drawPileIds]),
    handIds: Object.freeze([...player.handIds]),
    field: freezeField(player.field),
    dropIds: Object.freeze([...player.dropIds]),
    exileIds: Object.freeze([...player.exileIds]),
    requiredDrawFailed: player.requiredDrawFailed,
  });
}

export function freezeBattleState(state: MutableBattleState): BattleState {
  return Object.freeze({
    schemaVersion: 1,
    seed: state.seed,
    firstPlayerId: state.firstPlayerId,
    activePlayerId: state.activePlayerId,
    turnNumber: state.turnNumber,
    actionCount: state.actionCount,
    phase: state.phase,
    lastAction: freezeBattleAction(state.lastAction),
    players: Object.freeze({
      PLAYER: freezePlayer(state.players.PLAYER),
      ENEMY: freezePlayer(state.players.ENEMY),
    }),
    cards: Object.freeze(state.cards.map((card) => freezeCard(card))),
    result: freezeBattleResult(state.result),
  });
}

export function getBattleCard(
  state: Pick<BattleState, 'cards'> | Pick<MutableBattleState, 'cards'>,
  cardId: StableId,
): BattleCardState | MutableBattleCardState {
  const card = state.cards.find((candidate) => candidate.id === cardId);

  if (card === undefined) {
    throw new Error(`전투 카드 ID를 찾을 수 없습니다: ${cardId}`);
  }

  return card;
}

export function getCardDefinition(
  cardDefinitions: readonly CardDefinition[],
  cardDefinitionId: StableId,
): CardDefinition {
  const definition = cardDefinitions.find((candidate) => candidate.id === cardDefinitionId);

  if (definition === undefined) {
    throw new Error(`카드 정의 ID를 찾을 수 없습니다: ${cardDefinitionId}`);
  }

  return definition;
}

export function locateBattleCard(
  state: Pick<BattleState, 'players'> | Pick<MutableBattleState, 'players'>,
  cardId: StableId,
): BattleCardLocation {
  for (const playerId of ['PLAYER', 'ENEMY'] as const) {
    const player = state.players[playerId];

    if (player.drawPileIds.includes(cardId)) {
      return { playerId, zone: 'DECK', fieldPosition: null };
    }

    if (player.handIds.includes(cardId)) {
      return { playerId, zone: 'HAND', fieldPosition: null };
    }

    for (const position of BATTLE_FIELD_POSITIONS) {
      if (player.field[position] === cardId) {
        return { playerId, zone: 'FIELD', fieldPosition: position };
      }
    }

    if (player.dropIds.includes(cardId)) {
      return { playerId, zone: 'DROP', fieldPosition: null };
    }

    if (player.exileIds.includes(cardId)) {
      return { playerId, zone: 'EXILE', fieldPosition: null };
    }
  }

  throw new Error(`전투 카드가 어느 존에도 없습니다: ${cardId}`);
}

export function getBattleEffectiveStats(
  state: BattleState | MutableBattleState,
  cardDefinitions: readonly CardDefinition[],
  cardId: StableId,
): BattleEffectiveStats {
  const card = getBattleCard(state, cardId);
  const definition = getCardDefinition(cardDefinitions, card.cardDefinitionId);
  const location = locateBattleCard(state, cardId);
  let passiveAttack = 0;
  let passiveHealth = 0;
  let passiveCost = 0;
  let passiveDominance = 0;

  if (definition.passiveSkill !== undefined) {
    for (const effect of definition.passiveSkill.effects) {
      if (effect.type !== 'MODIFY_STAT' || effect.target !== 'SELF') {
        throw new Error(`코어 Passive 계약을 위반한 카드입니다: ${definition.id}`);
      }

      const enabled = effect.stat === 'COST' ? location.zone === 'HAND' : location.zone === 'FIELD';

      if (!enabled) {
        continue;
      }

      switch (effect.stat) {
        case 'ATTACK':
          passiveAttack += effect.amount;
          break;
        case 'HEALTH':
          passiveHealth += effect.amount;
          break;
        case 'COST':
          passiveCost += effect.amount;
          break;
        case 'DOMINANCE':
          passiveDominance += effect.amount;
          break;
      }
    }
  }

  return Object.freeze({
    attack: Math.max(0, definition.attack + card.statModifiers.ATTACK + passiveAttack),
    hp: Math.max(1, definition.hp + card.statModifiers.HEALTH + passiveHealth),
    cost: Math.max(
      definition.type === 'UNIT' ? 1 : 0,
      definition.cost + card.statModifiers.COST + passiveCost,
    ),
    dominance: Math.max(0, definition.dominance + card.statModifiers.DOMINANCE + passiveDominance),
  });
}

export function getFieldDominance(
  state: BattleState | MutableBattleState,
  cardDefinitions: readonly CardDefinition[],
  playerId: BattlePlayerId,
  position: BattleFieldPosition,
): number {
  const player = state.players[playerId];

  return getAdjacentBattleFields(position).reduce((total, adjacentPosition) => {
    const adjacentCardId = player.field[adjacentPosition];

    if (adjacentCardId === null) {
      return total;
    }

    return total + getBattleEffectiveStats(state, cardDefinitions, adjacentCardId).dominance;
  }, 0);
}

export function getAttackTargetCardIds(
  state: BattleState | MutableBattleState,
  attackerCardId: StableId,
): readonly StableId[] {
  const attackerLocation = locateBattleCard(state, attackerCardId);

  if (
    attackerLocation.zone !== 'FIELD' ||
    attackerLocation.fieldPosition === null ||
    !attackerLocation.fieldPosition.startsWith('FRONT_')
  ) {
    return Object.freeze([]);
  }

  const attackerCoordinate = FIELD_COORDINATES[attackerLocation.fieldPosition];
  const opponentId = otherBattlePlayerId(attackerLocation.playerId);
  const opponentField = state.players[opponentId].field;
  const targetIds: StableId[] = [];

  for (const column of [
    attackerCoordinate.column - 1,
    attackerCoordinate.column,
    attackerCoordinate.column + 1,
  ]) {
    const frontPosition = POSITION_BY_COORDINATE.get(`0:${column}`);

    if (frontPosition === undefined) {
      continue;
    }

    const frontCardId = opponentField[frontPosition];

    if (frontCardId !== null) {
      targetIds.push(frontCardId);
    }
  }

  const straightFrontPosition = POSITION_BY_COORDINATE.get(`0:${attackerCoordinate.column}`);
  const straightBackPosition = POSITION_BY_COORDINATE.get(`1:${attackerCoordinate.column}`);

  if (
    straightFrontPosition !== undefined &&
    straightBackPosition !== undefined &&
    opponentField[straightFrontPosition] === null
  ) {
    const backCardId = opponentField[straightBackPosition];

    if (backCardId !== null) {
      targetIds.push(backCardId);
    }
  }

  return Object.freeze(targetIds);
}
