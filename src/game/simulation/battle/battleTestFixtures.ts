import type { CardDefinition } from '../../cards/card.js';
import {
  ENEMY_TEST_DECK_BLUEPRINT,
  TEST_CARD_CATALOG,
  createAlliedStarterDeckContent,
} from '../../content/index.js';
import type {
  BattleDeck,
  BattleFieldPosition,
  BattleZone,
  StableId,
} from '../../data/contracts.js';
import { BattleDeckFactory, type BattleIdFactory } from '../BattleDeckFactory.js';
import { BattleSession } from './BattleSession.js';
import {
  cloneBattleState,
  createEmptyStatModifiers,
  freezeBattleState,
  type MutableBattleState,
} from './state.js';
import type { BattlePlayerId, BattleSetup, BattleState } from './types.js';

export interface PhaseFiveBattleFixture {
  readonly cardDefinitions: readonly CardDefinition[];
  readonly playerDeck: BattleDeck;
  readonly enemyDeck: BattleDeck;
  readonly setup: BattleSetup;
  readonly session: BattleSession;
}

function createBattleIdFactory(namespace: string): BattleIdFactory {
  let sequence = 0;

  return ({ kind, sourceId, ordinal }) => {
    const id = `${namespace}-${kind.toLowerCase()}-${sourceId}-${ordinal}-${sequence}`;
    sequence += 1;
    return id;
  };
}

export function createPhaseFiveBattleFixture(seed = 0x1234_5678): PhaseFiveBattleFixture {
  const starter = createAlliedStarterDeckContent((request) => {
    const copyIndex = request.kind === 'CARD_INSTANCE' ? request.copyIndex : 0;
    return `phase5-${request.kind.toLowerCase()}-${request.sourceId}-${copyIndex}`;
  });
  const cardDefinitions = TEST_CARD_CATALOG.cardDefinitions;
  const playerDeck = new BattleDeckFactory(
    cardDefinitions,
    createBattleIdFactory('phase5-player'),
  ).createFromSavedDeck(starter.deck, starter.collection, 0x0a11_1ed0);
  const enemyDeck = new BattleDeckFactory(
    cardDefinitions,
    createBattleIdFactory('phase5-enemy'),
  ).createFromEnemyDeckBlueprint(ENEMY_TEST_DECK_BLUEPRINT, 0x0e11_e0d0);
  const setup: BattleSetup = Object.freeze({
    seed,
    playerDeck,
    enemyDeck,
    cardDefinitions,
    firstPlayerId: 'PLAYER',
  });

  return Object.freeze({
    cardDefinitions,
    playerDeck,
    enemyDeck,
    setup,
    session: BattleSession.create(setup),
  });
}

export function findBattleCardId(
  state: BattleState | MutableBattleState,
  playerId: BattlePlayerId,
  cardDefinitionId: StableId,
  occurrence = 0,
): StableId {
  const cards = state.cards.filter(
    (card) => card.ownerId === playerId && card.cardDefinitionId === cardDefinitionId,
  );
  const card = cards[occurrence];

  if (card === undefined) {
    throw new Error(
      `${playerId}의 ${cardDefinitionId} ${occurrence + 1}번째 전투 카드를 찾을 수 없습니다.`,
    );
  }

  return card.id;
}

function removeId(cardIds: StableId[], cardId: StableId): void {
  const index = cardIds.indexOf(cardId);

  if (index !== -1) {
    cardIds.splice(index, 1);
  }
}

function removeCardFromAllZones(state: MutableBattleState, cardId: StableId): void {
  for (const playerId of ['PLAYER', 'ENEMY'] as const) {
    const player = state.players[playerId];
    removeId(player.drawPileIds, cardId);
    removeId(player.handIds, cardId);
    removeId(player.dropIds, cardId);
    removeId(player.exileIds, cardId);

    for (const position of [
      'FRONT_LEFT',
      'FRONT_CENTER',
      'FRONT_RIGHT',
      'BACK_LEFT',
      'BACK_CENTER',
      'BACK_RIGHT',
    ] as const) {
      if (player.field[position] === cardId) {
        player.field[position] = null;
      }
    }
  }
}

export function moveBattleCardForTest(
  state: MutableBattleState,
  cardId: StableId,
  zone: BattleZone,
  fieldPosition?: BattleFieldPosition,
): void {
  const card = state.cards.find((candidate) => candidate.id === cardId);

  if (card === undefined) {
    throw new Error(`전투 카드 ID를 찾을 수 없습니다: ${cardId}`);
  }

  removeCardFromAllZones(state, cardId);
  card.damage = 0;
  card.statusIds = [];
  card.isDeploymentPending = false;
  card.hasMovedThisTurn = false;
  card.hasAttackedThisTurn = false;
  card.hasUsedActiveSkillThisTurn = false;
  card.statModifiers = createEmptyStatModifiers();
  card.lastDamageSourceCardId = null;
  const player = state.players[card.ownerId];

  switch (zone) {
    case 'DECK':
      player.drawPileIds.push(cardId);
      break;
    case 'HAND':
      player.handIds.push(cardId);
      break;
    case 'FIELD':
      if (fieldPosition === undefined) {
        throw new Error('테스트 Field 배치에는 위치가 필요합니다.');
      }
      if (player.field[fieldPosition] !== null) {
        throw new Error(`테스트 Field 위치가 이미 점유되었습니다: ${fieldPosition}`);
      }
      player.field[fieldPosition] = cardId;
      break;
    case 'DROP':
      player.dropIds.push(cardId);
      break;
    case 'EXILE':
      player.exileIds.push(cardId);
      break;
  }
}

export function editBattleState(
  state: BattleState,
  edit: (mutable: MutableBattleState) => void,
): BattleState {
  const mutable = cloneBattleState(state);
  edit(mutable);
  return freezeBattleState(mutable);
}
