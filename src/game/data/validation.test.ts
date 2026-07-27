import { describe, expect, it } from 'vitest';

import type { CardDefinition } from '../cards/card.js';
import type {
  CardInstance,
  OwnedCollection,
  SavedDeck,
  SaveSlotState,
  StageDefinition,
} from './contracts.js';
import {
  validateCardCatalog,
  validateEnemyDeckBlueprint,
  validateOwnedCollection,
  validatePlayableSavedDeck,
  validateSavedDeckForStorage,
  validateSaveSlotState,
  validateStageDefinition,
  type DataValidationResult,
} from './validation.js';
import { createPhaseOneFixtures } from './testFixtures.js';

function issueCodes(validation: DataValidationResult): readonly string[] {
  return validation.issues.map((validationIssue) => validationIssue.code);
}

describe('game data semantic validation', () => {
  it('accepts the valid catalog, collection, playable deck, blueprint, Stage, and save slot', () => {
    const fixtures = createPhaseOneFixtures();

    expect(validateCardCatalog(fixtures.cardCatalog)).toEqual({
      valid: true,
      issues: [],
    });
    expect(
      validateOwnedCollection(fixtures.collection, fixtures.cardCatalog.cardDefinitions),
    ).toEqual({
      valid: true,
      issues: [],
    });
    expect(
      validatePlayableSavedDeck(fixtures.deck, {
        collection: fixtures.collection,
        cardDefinitions: fixtures.cardCatalog.cardDefinitions,
      }),
    ).toEqual({
      valid: true,
      issues: [],
    });
    expect(
      validateEnemyDeckBlueprint(fixtures.enemyDeckBlueprint, fixtures.cardCatalog.cardDefinitions),
    ).toEqual({
      valid: true,
      issues: [],
    });
    expect(
      validateStageDefinition(
        fixtures.stage,
        [fixtures.enemyDeckBlueprint],
        fixtures.cardCatalog.cardDefinitions,
      ),
    ).toEqual({
      valid: true,
      issues: [],
    });
    expect(
      validateSaveSlotState(fixtures.saveSlot, fixtures.cardCatalog.cardDefinitions, [
        fixtures.stage,
      ]),
    ).toEqual({
      valid: true,
      issues: [],
    });
  });

  it('allows an incomplete deck to be stored but rejects it for Stage entry', () => {
    const fixtures = createPhaseOneFixtures();
    const incompleteDeck: SavedDeck = {
      ...fixtures.deck,
      leaderInstanceId: null,
      unitInstanceIds: fixtures.deck.unitInstanceIds.slice(0, 10),
    };
    const context = {
      collection: fixtures.collection,
      cardDefinitions: fixtures.cardCatalog.cardDefinitions,
    };

    expect(validateSavedDeckForStorage(incompleteDeck, context).valid).toBe(true);
    expect(issueCodes(validatePlayableSavedDeck(incompleteDeck, context))).toEqual(
      expect.arrayContaining(['LEADER_REQUIRED', 'DECK_SIZE_INVALID']),
    );
  });

  it('rejects a 31-card deck', () => {
    const fixtures = createPhaseOneFixtures();
    const extraOwnedUnit = fixtures.collection.cardInstances.at(-1);

    if (extraOwnedUnit === undefined) {
      throw new Error('추가 카드 fixture가 없습니다.');
    }

    const oversizedDeck: SavedDeck = {
      ...fixtures.deck,
      unitInstanceIds: [...fixtures.deck.unitInstanceIds, extraOwnedUnit.id],
    };
    const validation = validatePlayableSavedDeck(oversizedDeck, {
      collection: fixtures.collection,
      cardDefinitions: fixtures.cardCatalog.cardDefinitions,
    });

    expect(validation.valid).toBe(false);
    expect(issueCodes(validation)).toContain('DECK_SIZE_INVALID');
  });

  it('rejects a second leader in the unit list', () => {
    const fixtures = createPhaseOneFixtures();
    const secondLeader: CardInstance = {
      id: 'owned-allied-leader-2',
      cardDefinitionId: fixtures.leaderDefinition.id,
    };
    const collection: OwnedCollection = {
      cardInstances: [...fixtures.collection.cardInstances, secondLeader],
    };
    const twoLeaderDeck: SavedDeck = {
      ...fixtures.deck,
      unitInstanceIds: [secondLeader.id, ...fixtures.deck.unitInstanceIds.slice(1)],
    };
    const validation = validatePlayableSavedDeck(twoLeaderDeck, {
      collection,
      cardDefinitions: fixtures.cardCatalog.cardDefinitions,
    });

    expect(validation.valid).toBe(false);
    expect(issueCodes(validation)).toContain('UNIT_TYPE_REQUIRED');
  });

  it('rejects three copies of one unit definition', () => {
    const fixtures = createPhaseOneFixtures();
    const repeatedDefinition = fixtures.unitDefinitions[0];

    if (repeatedDefinition === undefined) {
      throw new Error('유닛 정의 fixture가 없습니다.');
    }

    const thirdCopy: CardInstance = {
      id: 'owned-allied-unit-01-3',
      cardDefinitionId: repeatedDefinition.id,
    };
    const collection: OwnedCollection = {
      cardInstances: [...fixtures.collection.cardInstances, thirdCopy],
    };
    const threeCopyDeck: SavedDeck = {
      ...fixtures.deck,
      unitInstanceIds: [...fixtures.deck.unitInstanceIds.slice(0, -1), thirdCopy.id],
    };
    const validation = validatePlayableSavedDeck(threeCopyDeck, {
      collection,
      cardDefinitions: fixtures.cardCatalog.cardDefinitions,
    });

    expect(validation.valid).toBe(false);
    expect(issueCodes(validation)).toContain('COPY_LIMIT_EXCEEDED');
  });

  it('rejects a playable deck without eight low-cost units', () => {
    const fixtures = createPhaseOneFixtures();
    const expensiveDefinitions = fixtures.cardCatalog.cardDefinitions.map((definition) =>
      definition.type === 'UNIT'
        ? {
            ...definition,
            cost: Math.max(2, definition.cost),
          }
        : definition,
    );
    const validation = validatePlayableSavedDeck(fixtures.deck, {
      collection: fixtures.collection,
      cardDefinitions: expensiveDefinitions,
    });

    expect(validation.valid).toBe(false);
    expect(issueCodes(validation)).toContain('LOW_COST_REQUIREMENT');
  });

  it('rejects an unowned instance and a nonexistent card definition', () => {
    const fixtures = createPhaseOneFixtures();
    const unownedDeck: SavedDeck = {
      ...fixtures.deck,
      unitInstanceIds: [...fixtures.deck.unitInstanceIds.slice(0, -1), 'not-owned-unit'],
    };
    const unknownDefinitionInstance: CardInstance = {
      id: 'owned-unknown-definition',
      cardDefinitionId: 'missing-definition',
    };
    const collectionWithUnknownDefinition: OwnedCollection = {
      cardInstances: [...fixtures.collection.cardInstances, unknownDefinitionInstance],
    };
    const unknownDefinitionDeck: SavedDeck = {
      ...fixtures.deck,
      unitInstanceIds: [
        ...fixtures.deck.unitInstanceIds.slice(0, -1),
        unknownDefinitionInstance.id,
      ],
    };

    expect(
      issueCodes(
        validatePlayableSavedDeck(unownedDeck, {
          collection: fixtures.collection,
          cardDefinitions: fixtures.cardCatalog.cardDefinitions,
        }),
      ),
    ).toContain('UNKNOWN_INSTANCE');
    expect(
      issueCodes(
        validatePlayableSavedDeck(unknownDefinitionDeck, {
          collection: collectionWithUnknownDefinition,
          cardDefinitions: fixtures.cardCatalog.cardDefinitions,
        }),
      ),
    ).toContain('UNKNOWN_CARD_DEFINITION');
  });

  it('rejects presentation and Stage references outside their catalogs', () => {
    const fixtures = createPhaseOneFixtures();
    const outsiderDefinition: CardDefinition = {
      id: 'outsider-unit',
      name: '외부 유닛',
      description: '적 덱에 포함되지 않은 보상 검증용 유닛이다.',
      type: 'UNIT',
      cost: 1,
      dominance: 1,
      hp: 2,
      attack: 1,
    };
    const invalidCatalog = {
      cardDefinitions: fixtures.cardCatalog.cardDefinitions,
      cardPresentations: [
        ...fixtures.cardCatalog.cardPresentations,
        {
          cardDefinitionId: 'missing-definition',
          rarity: 'RARE' as const,
          artAssetKey: 'cards.art.missing',
          frameVariant: 'COMMON' as const,
        },
      ],
    };
    const invalidStage: StageDefinition = {
      ...fixtures.stage,
      rewards: [
        ...fixtures.stage.rewards,
        {
          cardDefinitionId: outsiderDefinition.id,
          weight: 1,
        },
      ],
    };

    expect(issueCodes(validateCardCatalog(invalidCatalog))).toEqual(
      expect.arrayContaining(['UNKNOWN_CARD_DEFINITION', 'PRESENTATION_VARIANT_MISMATCH']),
    );
    expect(
      issueCodes(
        validateStageDefinition(
          invalidStage,
          [fixtures.enemyDeckBlueprint],
          [...fixtures.cardCatalog.cardDefinitions, outsiderDefinition],
        ),
      ),
    ).toContain('REWARD_NOT_IN_ENEMY_DECK');
  });

  it('rejects invalid save references and reward records', () => {
    const fixtures = createPhaseOneFixtures();
    const invalidSave: SaveSlotState = {
      ...fixtures.saveSlot,
      selectedDeckId: 'missing-deck',
      progress: {
        unlockedStageIds: [],
        clearedStageIds: [fixtures.stage.id],
      },
      completedStageRuns: [
        {
          runId: 'invalid-run',
          stageId: fixtures.stage.id,
          result: 'LOSS',
          rewardCardInstanceId: fixtures.collection.cardInstances.at(-1)?.id ?? null,
          completedAt: 'invalid-time',
        },
      ],
    };
    const validation = validateSaveSlotState(invalidSave, fixtures.cardCatalog.cardDefinitions, [
      fixtures.stage,
    ]);

    expect(validation.valid).toBe(false);
    expect(issueCodes(validation)).toEqual(
      expect.arrayContaining([
        'SELECTED_DECK_NOT_FOUND',
        'CLEARED_STAGE_LOCKED',
        'INVALID_STAGE_RUN_REWARD',
        'INVALID_TIMESTAMP',
        'STAGE_NOT_CLEARED',
      ]),
    );
  });
});
