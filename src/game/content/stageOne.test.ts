import { describe, expect, it } from 'vitest';

import { validateStageDefinition } from '../data/index.js';
import {
  ENEMY_TEST_DECK_BLUEPRINT,
  STAGE_ONE_DEFINITION,
  STAGE_ONE_ID,
  STAGE_ONE_REWARD_ENTRIES,
  STAGE_ONE_REWARD_WEIGHT_BY_RARITY,
  TEST_CARD_CATALOG,
  TEST_CARD_DESIGNS,
} from './index.js';

describe('Stage 01 content', () => {
  it('uses the approved Stage ID, enemy deck, AI profile, and valid reward contract', () => {
    expect(STAGE_ONE_DEFINITION).toMatchObject({
      id: STAGE_ONE_ID,
      enemyDeckBlueprintId: ENEMY_TEST_DECK_BLUEPRINT.id,
      aiProfileId: 'ai-stage-01',
    });
    expect(
      validateStageDefinition(
        STAGE_ONE_DEFINITION,
        [ENEMY_TEST_DECK_BLUEPRINT],
        TEST_CARD_CATALOG.cardDefinitions,
      ),
    ).toEqual({
      valid: true,
      issues: [],
    });
  });

  it('includes every enemy deck definition exactly once, including its leader, at rarity weights', () => {
    const expectedDefinitionIds = new Set([
      ENEMY_TEST_DECK_BLUEPRINT.leaderDefinitionId,
      ...ENEMY_TEST_DECK_BLUEPRINT.unitEntries.map((entry) => entry.cardDefinitionId),
    ]);
    const rewardsByDefinition = new Map(
      STAGE_ONE_REWARD_ENTRIES.map((reward) => [reward.cardDefinitionId, reward]),
    );

    expect(rewardsByDefinition.size).toBe(expectedDefinitionIds.size);
    expect(new Set(rewardsByDefinition.keys())).toEqual(expectedDefinitionIds);

    for (const design of TEST_CARD_DESIGNS.filter((candidate) => candidate.faction === 'ENEMY')) {
      expect(rewardsByDefinition.get(design.definition.id)?.weight).toBe(
        STAGE_ONE_REWARD_WEIGHT_BY_RARITY[design.presentation.rarity],
      );
    }

    expect(rewardsByDefinition.get(ENEMY_TEST_DECK_BLUEPRINT.leaderDefinitionId)?.weight).toBe(10);
  });
});
