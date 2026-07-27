import { describe, expect, it } from 'vitest';

import type { SavedDeck } from '../data/contracts.js';
import { parseBattleDeck } from '../data/schemaValidation.js';
import { createPhaseOneFixtures, createSequentialBattleIdFactory } from '../data/testFixtures.js';
import { DataContractValidationError, validateBattleDeck } from '../data/validation.js';
import { BattleDeckFactory } from './BattleDeckFactory.js';

describe('BattleDeckFactory', () => {
  it('creates an independent 30-card battle deck from a playable saved deck', () => {
    const fixtures = createPhaseOneFixtures();
    const deckSnapshot = JSON.stringify(fixtures.deck);
    const collectionSnapshot = JSON.stringify(fixtures.collection);
    const factory = new BattleDeckFactory(
      fixtures.cardCatalog.cardDefinitions,
      createSequentialBattleIdFactory('player'),
    );
    const battleDeck = factory.createFromSavedDeck(fixtures.deck, fixtures.collection, 0x1234_5678);

    expect(battleDeck.cards).toHaveLength(30);
    expect(battleDeck.drawPileIds).toHaveLength(29);
    expect(battleDeck.handIds).toEqual([]);
    expect(battleDeck.fieldIds).toEqual([battleDeck.leaderId]);
    expect(battleDeck.dropIds).toEqual([]);
    expect(battleDeck.exileIds).toEqual([]);
    expect(battleDeck.source).toEqual({
      type: 'SAVED_DECK',
      savedDeckId: fixtures.deck.id,
    });

    const leader = battleDeck.cards.find((card) => card.id === battleDeck.leaderId);
    expect(leader).toMatchObject({
      zone: 'FIELD',
      fieldPosition: 'BACK_CENTER',
      damage: 0,
      statusIds: [],
      isDeploymentPending: false,
    });

    for (const card of battleDeck.cards) {
      expect(Object.isFrozen(card)).toBe(true);
      expect(Object.isFrozen(card.source)).toBe(true);
      expect(Object.isFrozen(card.statusIds)).toBe(true);

      if (card.source.type === 'OWNED') {
        expect(card.id).not.toBe(card.source.cardInstanceId);
      }
    }

    expect(Object.isFrozen(battleDeck)).toBe(true);
    expect(Object.isFrozen(battleDeck.cards)).toBe(true);
    expect(Object.isFrozen(battleDeck.drawPileIds)).toBe(true);
    expect(JSON.stringify(fixtures.deck)).toBe(deckSnapshot);
    expect(JSON.stringify(fixtures.collection)).toBe(collectionSnapshot);
    expect(validateBattleDeck(battleDeck, fixtures.cardCatalog.cardDefinitions)).toEqual({
      valid: true,
      issues: [],
    });
    expect(parseBattleDeck(battleDeck).success).toBe(true);
  });

  it('uses the same seed and source order to reproduce the shuffle', () => {
    const fixtures = createPhaseOneFixtures();
    const firstFactory = new BattleDeckFactory(
      fixtures.cardCatalog.cardDefinitions,
      createSequentialBattleIdFactory('repeatable'),
    );
    const secondFactory = new BattleDeckFactory(
      fixtures.cardCatalog.cardDefinitions,
      createSequentialBattleIdFactory('repeatable'),
    );
    const differentSeedFactory = new BattleDeckFactory(
      fixtures.cardCatalog.cardDefinitions,
      createSequentialBattleIdFactory('repeatable'),
    );
    const first = firstFactory.createFromSavedDeck(fixtures.deck, fixtures.collection, 77);
    const second = secondFactory.createFromSavedDeck(fixtures.deck, fixtures.collection, 77);
    const differentSeed = differentSeedFactory.createFromSavedDeck(
      fixtures.deck,
      fixtures.collection,
      78,
    );

    expect(second).toEqual(first);
    expect(differentSeed.drawPileIds).not.toEqual(first.drawPileIds);
  });

  it('creates a fresh enemy battle deck from a definition blueprint', () => {
    const fixtures = createPhaseOneFixtures();
    const blueprintSnapshot = JSON.stringify(fixtures.enemyDeckBlueprint);
    const factory = new BattleDeckFactory(
      fixtures.cardCatalog.cardDefinitions,
      createSequentialBattleIdFactory('enemy'),
    );
    const battleDeck = factory.createFromEnemyDeckBlueprint(fixtures.enemyDeckBlueprint, 999);

    expect(battleDeck.source).toEqual({
      type: 'ENEMY_BLUEPRINT',
      enemyDeckBlueprintId: fixtures.enemyDeckBlueprint.id,
    });
    expect(battleDeck.cards).toHaveLength(30);
    expect(battleDeck.drawPileIds).toHaveLength(29);
    expect(
      battleDeck.cards.every(
        (card) =>
          card.source.type === 'BLUEPRINT' &&
          card.source.enemyDeckBlueprintId === fixtures.enemyDeckBlueprint.id,
      ),
    ).toBe(true);
    expect(JSON.stringify(fixtures.enemyDeckBlueprint)).toBe(blueprintSnapshot);
    expect(validateBattleDeck(battleDeck, fixtures.cardCatalog.cardDefinitions).valid).toBe(true);
  });

  it('rejects an incomplete source deck, an invalid seed, and duplicate generated IDs', () => {
    const fixtures = createPhaseOneFixtures();
    const incompleteDeck: SavedDeck = {
      ...fixtures.deck,
      leaderInstanceId: null,
    };
    const factory = new BattleDeckFactory(
      fixtures.cardCatalog.cardDefinitions,
      createSequentialBattleIdFactory('invalid'),
    );

    expect(() => factory.createFromSavedDeck(incompleteDeck, fixtures.collection, 1)).toThrow(
      DataContractValidationError,
    );
    expect(() => factory.createFromSavedDeck(fixtures.deck, fixtures.collection, -1)).toThrow(
      RangeError,
    );

    const duplicateIdFactory = new BattleDeckFactory(
      fixtures.cardCatalog.cardDefinitions,
      () => 'duplicate-battle-id',
    );

    try {
      duplicateIdFactory.createFromSavedDeck(fixtures.deck, fixtures.collection, 1);
      throw new Error('중복 전투 ID 생성이 거부되지 않았습니다.');
    } catch (error) {
      expect(error).toBeInstanceOf(DataContractValidationError);

      if (error instanceof DataContractValidationError) {
        expect(error.issues.map((validationIssue) => validationIssue.code)).toContain(
          'DUPLICATE_ID',
        );
      }
    }
  });
});
