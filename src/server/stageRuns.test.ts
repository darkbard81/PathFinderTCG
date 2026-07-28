import { describe, expect, it } from 'vitest';

import { ENEMY_TEST_DECK_BLUEPRINT, STAGE_ONE_REWARD_ENTRIES } from '../game/content/index.js';
import type { StageRewardEntry } from '../game/data/index.js';
import { selectWeightedStageReward } from './stageRuns.js';

const UINT32_RANGE = 0x1_0000_0000;

function seedForRoll(roll: number, totalWeight: number): number {
  let seed = Math.ceil((roll * UINT32_RANGE) / totalWeight);

  while (Math.floor((seed / UINT32_RANGE) * totalWeight) < roll) {
    seed += 1;
  }
  while (seed > 0 && Math.floor(((seed - 1) / UINT32_RANGE) * totalWeight) >= roll) {
    seed -= 1;
  }

  return seed;
}

describe('Stage reward selection', () => {
  it('makes every positive-weight Stage 01 candidate selectable, including the enemy leader', () => {
    const totalWeight = STAGE_ONE_REWARD_ENTRIES.reduce(
      (total, reward) => total + reward.weight,
      0,
    );
    let cumulativeWeight = 0;
    const selectedDefinitionIds = new Set<string>();

    for (const reward of STAGE_ONE_REWARD_ENTRIES) {
      const targetRoll = cumulativeWeight + Math.floor((reward.weight - 1) / 2);
      const selected = selectWeightedStageReward(
        STAGE_ONE_REWARD_ENTRIES,
        seedForRoll(targetRoll, totalWeight),
      );
      selectedDefinitionIds.add(selected.cardDefinitionId);
      expect(selected.cardDefinitionId).toBe(reward.cardDefinitionId);
      cumulativeWeight += reward.weight;
    }

    expect(selectedDefinitionIds).toEqual(
      new Set(STAGE_ONE_REWARD_ENTRIES.map((reward) => reward.cardDefinitionId)),
    );
    expect(selectedDefinitionIds.has(ENEMY_TEST_DECK_BLUEPRINT.leaderDefinitionId)).toBe(true);
  });

  it('uses half-open weighted intervals at both uint32 boundaries', () => {
    const rewards: readonly StageRewardEntry[] = [
      { cardDefinitionId: 'first', weight: 1 },
      { cardDefinitionId: 'second', weight: 1 },
    ];

    expect(selectWeightedStageReward(rewards, 0).cardDefinitionId).toBe('first');
    expect(selectWeightedStageReward(rewards, 0xffff_ffff).cardDefinitionId).toBe('second');
  });

  it('rejects invalid seeds, empty tables, and non-positive weights', () => {
    expect(() => selectWeightedStageReward([], 0)).toThrow('비어');
    expect(() =>
      selectWeightedStageReward([{ cardDefinitionId: 'invalid', weight: 0 }], 0),
    ).toThrow('양의 정수');
    expect(() =>
      selectWeightedStageReward([{ cardDefinitionId: 'valid', weight: 1 }], UINT32_RANGE),
    ).toThrow('0~4294967295');
  });
});
