import type { StageDefinition } from '../data/contracts.js';
import { ENEMY_TEST_DECK_BLUEPRINT, STAGE_ONE_REWARD_ENTRIES } from './testCardPool.js';

export const STAGE_ONE_ID = 'stage-01' as const;
export const STAGE_ONE_AI_PROFILE_ID = 'ai-stage-01' as const;

export const STAGE_ONE_DEFINITION: StageDefinition = Object.freeze({
  id: STAGE_ONE_ID,
  enemyDeckBlueprintId: ENEMY_TEST_DECK_BLUEPRINT.id,
  aiProfileId: STAGE_ONE_AI_PROFILE_ID,
  rewards: STAGE_ONE_REWARD_ENTRIES,
});

export interface StagePresentation {
  readonly name: string;
  readonly description: string;
  readonly rewardSummary: string;
}

export interface StageCatalogEntry {
  readonly definition: StageDefinition;
  readonly presentation: StagePresentation;
}

export const STAGE_ONE_PRESENTATION: StagePresentation = Object.freeze({
  name: 'Stage 01 · 검은가시 전초전',
  description:
    '태양숲 원정대로 월식의 검은가시 군단을 격파하세요. 플레이어가 먼저 행동하며 별도 Stage 보정은 없습니다.',
  rewardSummary: '승리 시 검은가시 적 덱의 카드 중 가중치에 따라 정확히 1장을 획득합니다.',
});

export const STAGE_CATALOG: readonly StageCatalogEntry[] = Object.freeze([
  Object.freeze({
    definition: STAGE_ONE_DEFINITION,
    presentation: STAGE_ONE_PRESENTATION,
  }),
]);

export const STAGE_DEFINITIONS: readonly StageDefinition[] = Object.freeze(
  STAGE_CATALOG.map((entry) => entry.definition),
);
