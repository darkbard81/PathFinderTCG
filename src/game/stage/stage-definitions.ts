import { loadStageDefinitions } from './stage-loader';
import type { StageDefinition, StageEnemyDeckDefinition, StageProgressState } from './types';

export type { StageEnemyDeckDefinition };

const stageDefinitionData = import.meta.glob<unknown>('../../../cards/stages/*.json', {
  eager: true,
  import: 'default',
});

export const STAGE_DEFINITIONS: readonly StageDefinition[] =
  loadStageDefinitions(stageDefinitionData);

/**
 * Stage 목록을 표시 순서 기준으로 돌려준다.
 * 호출자가 배열을 변경해도 원본 정의 순서는 변하지 않게 새 배열을 반환한다.
 */
export function listStageDefinitions(): StageDefinition[] {
  return [...STAGE_DEFINITIONS].sort((left, right) => left.order - right.order);
}

/**
 * Stage ID로 정의를 찾는다.
 * Scene 데이터처럼 외부에서 들어온 ID 검증에 사용한다.
 */
export function findStageDefinition(stageId: string): StageDefinition | null {
  return STAGE_DEFINITIONS.find((stage) => stage.id === stageId) ?? null;
}

/**
 * Stage ID에 맞는 정의를 반환하고, 존재하지 않으면 전투 시작을 중단할 수 있게 예외를 던진다.
 */
export function requireStageDefinition(stageId: string): StageDefinition {
  const stageDefinition = findStageDefinition(stageId);
  if (!stageDefinition) {
    throw new Error(`Unknown stageId: ${stageId}`);
  }

  return stageDefinition;
}

/**
 * Stage 해금 조건을 현재 진행 상태 기준으로 판정한다.
 * 이번 단계에서는 항상 해금과 선행 Stage 클리어 조건만 다룬다.
 */
export function isStageUnlocked(
  stageDefinition: StageDefinition,
  progress: StageProgressState,
): boolean {
  if (stageDefinition.unlock.type === 'ALWAYS') {
    return true;
  }

  return progress.clearedStageIds.includes(stageDefinition.unlock.stageId);
}
