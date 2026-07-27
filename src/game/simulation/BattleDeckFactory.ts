import type { CardDefinition } from '../cards/card.js';
import type {
  BattleCardInstance,
  BattleCardSource,
  BattleDeck,
  BattleDeckSource,
  EnemyDeckBlueprint,
  OwnedCollection,
  SavedDeck,
  StableId,
} from '../data/contracts.js';
import {
  DataContractValidationError,
  validateBattleDeck,
  validateEnemyDeckBlueprint,
  validatePlayableSavedDeck,
} from '../data/validation.js';

export type BattleIdKind = 'BATTLE_CARD' | 'BATTLE_DECK';

export interface BattleIdRequest {
  readonly kind: BattleIdKind;
  readonly sourceId: StableId;
  readonly ordinal: number;
}

export type BattleIdFactory = (request: BattleIdRequest) => StableId;

function assertSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError('전투 시드는 0~4294967295 범위의 정수여야 합니다.');
  }
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffleIds(ids: readonly StableId[], seed: number): readonly StableId[] {
  const shuffled = [...ids];
  const random = createSeededRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    const swap = shuffled[swapIndex];

    if (current === undefined || swap === undefined) {
      throw new Error('셔플할 카드 ID를 찾을 수 없습니다.');
    }

    shuffled[index] = swap;
    shuffled[swapIndex] = current;
  }

  return Object.freeze(shuffled);
}

function freezeSource(source: BattleCardSource): BattleCardSource {
  return Object.freeze({ ...source });
}

function createBattleCard(
  id: StableId,
  cardDefinitionId: StableId,
  source: BattleCardSource,
  isLeader: boolean,
): BattleCardInstance {
  return Object.freeze({
    id,
    cardDefinitionId,
    source: freezeSource(source),
    zone: isLeader ? 'FIELD' : 'DECK',
    fieldPosition: isLeader ? 'BACK_CENTER' : null,
    damage: 0,
    statusIds: Object.freeze([]),
    isDeploymentPending: false,
  });
}

function freezeBattleDeck(
  id: StableId,
  source: BattleDeckSource,
  seed: number,
  cards: readonly BattleCardInstance[],
  leaderId: StableId,
  drawPileIds: readonly StableId[],
): BattleDeck {
  const emptyIds: readonly StableId[] = Object.freeze([]);

  return Object.freeze({
    id,
    source: Object.freeze({ ...source }),
    seed,
    leaderId,
    cards: Object.freeze([...cards]),
    drawPileIds,
    handIds: emptyIds,
    fieldIds: Object.freeze([leaderId]),
    dropIds: emptyIds,
    exileIds: emptyIds,
  });
}

export class BattleDeckFactory {
  private readonly cardDefinitions: readonly CardDefinition[];
  private readonly createId: BattleIdFactory;

  constructor(cardDefinitions: readonly CardDefinition[], createId: BattleIdFactory) {
    this.cardDefinitions = Object.freeze([...cardDefinitions]);
    this.createId = createId;
  }

  createFromSavedDeck(deck: SavedDeck, collection: OwnedCollection, seed: number): BattleDeck {
    assertSeed(seed);
    const validation = validatePlayableSavedDeck(deck, {
      collection,
      cardDefinitions: this.cardDefinitions,
    });

    if (!validation.valid) {
      throw new DataContractValidationError(
        `저장 덱을 전투 덱으로 만들 수 없습니다: ${deck.id}`,
        validation.issues,
      );
    }

    if (deck.leaderInstanceId === null) {
      throw new Error('검증을 통과한 저장 덱에 리더가 없습니다.');
    }

    const instanceIndex = new Map(
      collection.cardInstances.map((cardInstance) => [cardInstance.id, cardInstance]),
    );
    const leaderInstance = instanceIndex.get(deck.leaderInstanceId);

    if (leaderInstance === undefined) {
      throw new Error('검증을 통과한 저장 덱의 리더 인스턴스를 찾을 수 없습니다.');
    }

    const battleDeckId = this.createId({
      kind: 'BATTLE_DECK',
      sourceId: deck.id,
      ordinal: 0,
    });
    const leader = createBattleCard(
      this.createId({
        kind: 'BATTLE_CARD',
        sourceId: deck.id,
        ordinal: 0,
      }),
      leaderInstance.cardDefinitionId,
      {
        type: 'OWNED',
        cardInstanceId: leaderInstance.id,
      },
      true,
    );
    const units = deck.unitInstanceIds.map((instanceId, index) => {
      const cardInstance = instanceIndex.get(instanceId);

      if (cardInstance === undefined) {
        throw new Error(`검증을 통과한 유닛 인스턴스를 찾을 수 없습니다: ${instanceId}`);
      }

      return createBattleCard(
        this.createId({
          kind: 'BATTLE_CARD',
          sourceId: deck.id,
          ordinal: index + 1,
        }),
        cardInstance.cardDefinitionId,
        {
          type: 'OWNED',
          cardInstanceId: cardInstance.id,
        },
        false,
      );
    });
    const cards = Object.freeze([leader, ...units]);
    const battleDeck = freezeBattleDeck(
      battleDeckId,
      {
        type: 'SAVED_DECK',
        savedDeckId: deck.id,
      },
      seed,
      cards,
      leader.id,
      shuffleIds(
        units.map((unit) => unit.id),
        seed,
      ),
    );

    this.assertValidBattleDeck(battleDeck);
    return battleDeck;
  }

  createFromEnemyDeckBlueprint(blueprint: EnemyDeckBlueprint, seed: number): BattleDeck {
    assertSeed(seed);
    const validation = validateEnemyDeckBlueprint(blueprint, this.cardDefinitions);

    if (!validation.valid) {
      throw new DataContractValidationError(
        `적 덱 청사진을 전투 덱으로 만들 수 없습니다: ${blueprint.id}`,
        validation.issues,
      );
    }

    const battleDeckId = this.createId({
      kind: 'BATTLE_DECK',
      sourceId: blueprint.id,
      ordinal: 0,
    });
    const leader = createBattleCard(
      this.createId({
        kind: 'BATTLE_CARD',
        sourceId: blueprint.id,
        ordinal: 0,
      }),
      blueprint.leaderDefinitionId,
      {
        type: 'BLUEPRINT',
        enemyDeckBlueprintId: blueprint.id,
        copyIndex: 0,
      },
      true,
    );
    let ordinal = 1;
    const units: BattleCardInstance[] = [];

    for (const entry of blueprint.unitEntries) {
      for (let copyIndex = 0; copyIndex < entry.quantity; copyIndex += 1) {
        units.push(
          createBattleCard(
            this.createId({
              kind: 'BATTLE_CARD',
              sourceId: blueprint.id,
              ordinal,
            }),
            entry.cardDefinitionId,
            {
              type: 'BLUEPRINT',
              enemyDeckBlueprintId: blueprint.id,
              copyIndex,
            },
            false,
          ),
        );
        ordinal += 1;
      }
    }

    const frozenUnits = Object.freeze(units);
    const cards = Object.freeze([leader, ...frozenUnits]);
    const battleDeck = freezeBattleDeck(
      battleDeckId,
      {
        type: 'ENEMY_BLUEPRINT',
        enemyDeckBlueprintId: blueprint.id,
      },
      seed,
      cards,
      leader.id,
      shuffleIds(
        frozenUnits.map((unit) => unit.id),
        seed,
      ),
    );

    this.assertValidBattleDeck(battleDeck);
    return battleDeck;
  }

  private assertValidBattleDeck(battleDeck: BattleDeck): void {
    const validation = validateBattleDeck(battleDeck, this.cardDefinitions);

    if (!validation.valid) {
      throw new DataContractValidationError(
        `생성된 전투 덱이 계약을 만족하지 않습니다: ${battleDeck.id}`,
        validation.issues,
      );
    }
  }
}
