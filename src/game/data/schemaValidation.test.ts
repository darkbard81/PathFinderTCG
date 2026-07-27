import { describe, expect, expectTypeOf, it } from 'vitest';

import type { CardDefinition } from '../cards/card.js';
import { BattleDeckFactory } from '../simulation/BattleDeckFactory.js';
import {
  CORE_DECK_RULES,
  GAME_DATA_SCHEMA_VERSION,
  type CardInstance,
  type CardPresentation,
  type EnemyDeckBlueprint,
  type OwnedCollection,
  type SavedDeck,
  type SaveSlotState,
  type StageDefinition,
} from './contracts.js';
import gameDataSchema from './game-data.schema.json';
import {
  parseBattleCardInstance,
  parseBattleDeck,
  parseCardDefinition,
  parseCardInstance,
  parseCardPresentation,
  parseEnemyDeckBlueprint,
  parseOwnedCollection,
  parsePlayableSavedDeck,
  parseSavedDeck,
  parseSaveSlotState,
  parseStageDefinition,
} from './schemaValidation.js';
import { createPhaseOneFixtures, createSequentialBattleIdFactory } from './testFixtures.js';

function jsonRoundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe('game data JSON Schema', () => {
  it('keeps image and rarity metadata outside CardDefinition', () => {
    expectTypeOf<CardDefinition>().not.toHaveProperty('rarity');
    expectTypeOf<CardDefinition>().not.toHaveProperty('artAssetKey');
    expectTypeOf<CardPresentation>().toHaveProperty('rarity');
    expectTypeOf<CardPresentation>().toHaveProperty('artAssetKey');
  });

  it('keeps the JSON Schema deck limit synchronized with the TypeScript contract', () => {
    expect(gameDataSchema.$defs.savedDeck.properties.unitInstanceIds.maxItems).toBe(
      CORE_DECK_RULES.unitCards,
    );
    expect(gameDataSchema.$defs.battleDeck.properties.cards.minItems).toBe(
      CORE_DECK_RULES.totalCards,
    );
    expect(gameDataSchema.$defs.battleDeck.properties.cards.maxItems).toBe(
      CORE_DECK_RULES.totalCards,
    );
    expect(gameDataSchema.$defs.enemyDeckEntry.properties.quantity.maximum).toBe(
      CORE_DECK_RULES.maxCopiesPerUnitDefinition,
    );
    expect(gameDataSchema.$defs.saveSlotState.properties.schemaVersion.const).toBe(
      GAME_DATA_SCHEMA_VERSION,
    );
  });

  it('parses every valid Phase 1 content and save contract', () => {
    const fixtures = createPhaseOneFixtures();
    const leaderResult = parseCardDefinition(fixtures.leaderDefinition);
    const presentationResult = parseCardPresentation(fixtures.cardCatalog.cardPresentations[0]);
    const instanceResult = parseCardInstance(fixtures.collection.cardInstances[0]);
    const collectionResult = parseOwnedCollection(fixtures.collection);
    const deckResult = parseSavedDeck(fixtures.deck);
    const playableDeckResult = parsePlayableSavedDeck(fixtures.deck);
    const blueprintResult = parseEnemyDeckBlueprint(fixtures.enemyDeckBlueprint);
    const stageResult = parseStageDefinition(fixtures.stage);
    const saveResult = parseSaveSlotState(fixtures.saveSlot);

    expect(leaderResult.success).toBe(true);
    expect(presentationResult.success).toBe(true);
    expect(instanceResult.success).toBe(true);
    expect(collectionResult.success).toBe(true);
    expect(deckResult.success).toBe(true);
    expect(playableDeckResult.success).toBe(true);
    expect(blueprintResult.success).toBe(true);
    expect(stageResult.success).toBe(true);
    expect(saveResult.success).toBe(true);

    if (
      !leaderResult.success ||
      !presentationResult.success ||
      !instanceResult.success ||
      !collectionResult.success ||
      !deckResult.success ||
      !playableDeckResult.success ||
      !blueprintResult.success ||
      !stageResult.success ||
      !saveResult.success
    ) {
      throw new Error('유효 fixture의 Schema 파싱 결과가 일치하지 않습니다.');
    }

    expectTypeOf(leaderResult.value).toEqualTypeOf<CardDefinition>();
    expectTypeOf(presentationResult.value).toEqualTypeOf<CardPresentation>();
    expectTypeOf(instanceResult.value).toEqualTypeOf<CardInstance>();
    expectTypeOf(collectionResult.value).toEqualTypeOf<OwnedCollection>();
    expectTypeOf(deckResult.value).toEqualTypeOf<SavedDeck>();
    expectTypeOf(playableDeckResult.value).toEqualTypeOf<SavedDeck>();
    expectTypeOf(blueprintResult.value).toEqualTypeOf<EnemyDeckBlueprint>();
    expectTypeOf(stageResult.value).toEqualTypeOf<StageDefinition>();
    expectTypeOf(saveResult.value).toEqualTypeOf<SaveSlotState>();
  });

  it('allows incomplete SavedDeck JSON but rejects it as a playable deck', () => {
    const fixtures = createPhaseOneFixtures();
    const incompleteDeck = {
      ...fixtures.deck,
      leaderInstanceId: null,
      unitInstanceIds: fixtures.deck.unitInstanceIds.slice(0, 10),
    };

    expect(parseSavedDeck(incompleteDeck).success).toBe(true);
    expect(parsePlayableSavedDeck(incompleteDeck).success).toBe(false);
  });

  it('rejects structurally invalid card, instance, deck, Stage, and save data', () => {
    const fixtures = createPhaseOneFixtures();
    const invalidCard = {
      ...fixtures.leaderDefinition,
      hp: 19,
    };
    const invalidPresentation = {
      ...fixtures.cardCatalog.cardPresentations[0],
      artAssetKey: '',
    };
    const invalidInstance = {
      ...fixtures.collection.cardInstances[0],
      runtimeSprite: 'forbidden',
    };
    const invalidCollection = {
      cardInstances: 'not-an-array',
    };
    const invalidDeck = {
      ...fixtures.deck,
      unitInstanceIds: [...fixtures.deck.unitInstanceIds, 'owned-extra-unit'],
    };
    const invalidBlueprint = {
      ...fixtures.enemyDeckBlueprint,
      unitEntries: [
        {
          cardDefinitionId: fixtures.unitDefinitions[0]?.id,
          quantity: 3,
        },
      ],
    };
    const invalidStage = {
      ...fixtures.stage,
      rewards: [
        {
          cardDefinitionId: fixtures.leaderDefinition.id,
          weight: 0,
        },
      ],
    };
    const invalidSave = {
      ...fixtures.saveSlot,
      schemaVersion: 2,
      lastModifiedAt: 'not-a-timestamp',
    };

    expect(parseCardDefinition(invalidCard).success).toBe(false);
    expect(parseCardPresentation(invalidPresentation).success).toBe(false);
    expect(parseCardInstance(invalidInstance).success).toBe(false);
    expect(parseOwnedCollection(invalidCollection).success).toBe(false);
    expect(parseSavedDeck(invalidDeck).success).toBe(false);
    expect(parseEnemyDeckBlueprint(invalidBlueprint).success).toBe(false);
    expect(parseStageDefinition(invalidStage).success).toBe(false);
    expect(parseSaveSlotState(invalidSave).success).toBe(false);
  });

  it('parses a factory BattleDeck and preserves save and battle data through JSON round trips', () => {
    const fixtures = createPhaseOneFixtures();
    const factory = new BattleDeckFactory(
      fixtures.cardCatalog.cardDefinitions,
      createSequentialBattleIdFactory('schema'),
    );
    const battleDeck = factory.createFromSavedDeck(fixtures.deck, fixtures.collection, 42);
    const battleResult = parseBattleDeck(jsonRoundTrip(battleDeck));
    const battleCardResult = parseBattleCardInstance(jsonRoundTrip(battleDeck.cards[0]));
    const invalidStatusCardResult = parseBattleCardInstance({
      ...battleDeck.cards[0],
      statusIds: ['POISONED'],
    });
    const saveResult = parseSaveSlotState(jsonRoundTrip(fixtures.saveSlot));

    expect(battleResult.success).toBe(true);
    expect(battleCardResult.success).toBe(true);
    expect(invalidStatusCardResult.success).toBe(false);
    expect(saveResult.success).toBe(true);

    if (!battleResult.success || !saveResult.success) {
      throw new Error('JSON 왕복 데이터의 Schema 파싱에 실패했습니다.');
    }

    expect(battleResult.value).toEqual(battleDeck);
    expect(saveResult.value).toEqual(fixtures.saveSlot);
  });
});
