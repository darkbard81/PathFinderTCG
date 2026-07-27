import { describe, expect, it } from 'vitest';

import {
  parseCardDefinition,
  parseCardPresentation,
  validateCardCatalog,
  validateEnemyDeckBlueprint,
  validatePlayableSavedDeck,
  validateStageDefinition,
  type StageDefinition,
} from '../data/index.js';
import { BattleDeckFactory, type BattleIdFactory } from '../simulation/BattleDeckFactory.js';
import {
  ALLIED_CARD_DESIGNS,
  ENEMY_CARD_DESIGNS,
  ENEMY_TEST_DECK_BLUEPRINT,
  STAGE_ONE_REWARD_ENTRIES,
  TEST_CARD_CATALOG,
  TEST_CARD_DESIGNS,
  createAlliedStarterDeckContent,
  validateTestCardPool,
  type StarterContentIdFactory,
} from './index.js';

function createStarterIdFactory(namespace: string): StarterContentIdFactory {
  return (request) => {
    const copyIndex = request.kind === 'CARD_INSTANCE' ? request.copyIndex : 0;
    return `${namespace}-${request.kind.toLowerCase()}-${request.sourceId}-${copyIndex}`;
  };
}

function createBattleIdFactory(namespace: string): BattleIdFactory {
  let sequence = 0;

  return ({ kind, sourceId, ordinal }) => {
    const id = `${namespace}-${kind.toLowerCase()}-${sourceId}-${ordinal}-${sequence}`;
    sequence += 1;
    return id;
  };
}

describe('Phase 3 test card pool', () => {
  it('satisfies the approved faction, role, Skill, rarity, budget, and art-direction contract', () => {
    const validation = validateTestCardPool(TEST_CARD_DESIGNS);

    expect(validation, JSON.stringify(validation.issues, null, 2)).toEqual({
      valid: true,
      issues: [],
    });
    expect(TEST_CARD_DESIGNS).toHaveLength(32);
    expect(ALLIED_CARD_DESIGNS).toHaveLength(16);
    expect(ENEMY_CARD_DESIGNS).toHaveLength(16);

    const cardIds = TEST_CARD_DESIGNS.map((design) => design.definition.id);
    const skillIds = TEST_CARD_DESIGNS.flatMap((design) => {
      const { activeSkill, reactiveSkill, passiveSkill } = design.definition;
      return [activeSkill?.id, reactiveSkill?.id, passiveSkill?.id].filter(
        (skillId): skillId is string => skillId !== undefined,
      );
    });

    expect(new Set(cardIds).size).toBe(cardIds.length);
    expect(new Set(skillIds).size).toBe(skillIds.length);
    expect(TEST_CARD_DESIGNS.every((design) => Object.isFrozen(design))).toBe(true);
    expect(TEST_CARD_DESIGNS.every((design) => Object.isFrozen(design.definition))).toBe(true);
  });

  it('passes the card and presentation JSON Schemas and semantic catalog validation', () => {
    for (const design of TEST_CARD_DESIGNS) {
      const cardResult = parseCardDefinition(design.definition);
      const presentationResult = parseCardPresentation(design.presentation);

      expect(cardResult, `${design.definition.id}: ${JSON.stringify(cardResult)}`).toMatchObject({
        success: true,
      });
      expect(
        presentationResult,
        `${design.definition.id}: ${JSON.stringify(presentationResult)}`,
      ).toMatchObject({
        success: true,
      });
    }

    expect(TEST_CARD_CATALOG.cardDefinitions).toHaveLength(32);
    expect(TEST_CARD_CATALOG.cardPresentations).toHaveLength(32);
    expect(validateCardCatalog(TEST_CARD_CATALOG)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it('keeps every unit within the target combat budget without rarity modifiers', () => {
    for (const design of TEST_CARD_DESIGNS) {
      const definition = design.definition;

      if (definition.type !== 'UNIT') {
        continue;
      }

      const basicScore = definition.attack + definition.hp * 0.5 + definition.dominance * 1.5;
      const targetScore = definition.cost * 2 + 2;
      const evaluatedScore = basicScore + design.expectedSkillValue;

      expect(
        Math.abs(evaluatedScore - targetScore),
        `${definition.id}: ${evaluatedScore} vs ${targetScore}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('builds valid 30-card BattleDecks from the allied starter deck and enemy blueprint', () => {
    const starter = createAlliedStarterDeckContent(createStarterIdFactory('owned'));
    const savedDeckValidation = validatePlayableSavedDeck(starter.deck, {
      collection: starter.collection,
      cardDefinitions: TEST_CARD_CATALOG.cardDefinitions,
    });
    const enemyBlueprintValidation = validateEnemyDeckBlueprint(
      ENEMY_TEST_DECK_BLUEPRINT,
      TEST_CARD_CATALOG.cardDefinitions,
    );

    expect(starter.collection.cardInstances).toHaveLength(30);
    expect(starter.deck.unitInstanceIds).toHaveLength(29);
    expect(savedDeckValidation).toEqual({ valid: true, issues: [] });
    expect(enemyBlueprintValidation).toEqual({ valid: true, issues: [] });

    const alliedBattleDeck = new BattleDeckFactory(
      TEST_CARD_CATALOG.cardDefinitions,
      createBattleIdFactory('allied'),
    ).createFromSavedDeck(starter.deck, starter.collection, 0x1357_2468);
    const enemyBattleDeck = new BattleDeckFactory(
      TEST_CARD_CATALOG.cardDefinitions,
      createBattleIdFactory('enemy'),
    ).createFromEnemyDeckBlueprint(ENEMY_TEST_DECK_BLUEPRINT, 0x2468_1357);

    expect(alliedBattleDeck.cards).toHaveLength(30);
    expect(alliedBattleDeck.drawPileIds).toHaveLength(29);
    expect(enemyBattleDeck.cards).toHaveLength(30);
    expect(enemyBattleDeck.drawPileIds).toHaveLength(29);
  });

  it('provides at least eight immediately affordable units and valid Stage 01 reward weights', () => {
    for (const factionDesigns of [ALLIED_CARD_DESIGNS, ENEMY_CARD_DESIGNS]) {
      const leader = factionDesigns.find((design) => design.definition.type === 'LEADER');

      if (leader === undefined) {
        throw new Error('진영 카드 풀에 리더가 없습니다.');
      }

      const affordableUnitCount = factionDesigns
        .filter(
          (design) =>
            design.definition.type === 'UNIT' &&
            design.definition.cost <= leader.definition.dominance,
        )
        .reduce((total, design) => total + design.deckQuantity, 0);

      expect(affordableUnitCount).toBe(14);
    }

    const stage: StageDefinition = {
      id: 'stage-01',
      enemyDeckBlueprintId: ENEMY_TEST_DECK_BLUEPRINT.id,
      aiProfileId: 'ai-stage-01',
      rewards: STAGE_ONE_REWARD_ENTRIES,
    };

    expect(STAGE_ONE_REWARD_ENTRIES).toHaveLength(16);
    expect(
      validateStageDefinition(
        stage,
        [ENEMY_TEST_DECK_BLUEPRINT],
        TEST_CARD_CATALOG.cardDefinitions,
      ),
    ).toEqual({
      valid: true,
      issues: [],
    });
  });

  it('reports a balance regression instead of accepting an over-budget card', () => {
    const firstUnitIndex = TEST_CARD_DESIGNS.findIndex(
      (design) => design.definition.type === 'UNIT',
    );
    const firstUnit = TEST_CARD_DESIGNS[firstUnitIndex];

    if (firstUnitIndex === -1 || firstUnit === undefined) {
      throw new Error('밸런스 회귀 테스트에 사용할 유닛이 없습니다.');
    }

    const invalidDesigns = [...TEST_CARD_DESIGNS];
    invalidDesigns[firstUnitIndex] = {
      ...firstUnit,
      expectedSkillValue: firstUnit.expectedSkillValue + 5,
    };
    const validation = validateTestCardPool(invalidDesigns);

    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toContain('BALANCE_BUDGET_EXCEEDED');
  });
});
