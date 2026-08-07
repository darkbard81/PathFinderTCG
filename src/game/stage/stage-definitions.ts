import type { CardDefinitionFile } from '../save/card-catalog';
import { loadStageDefinitions } from './stage-loader';
import type { StageDefinition, StageEnemyDeckPath, StageProgressState } from './types';

export type StageEnemyDeckDefinition = {
  deckId: string;
  deckPath: StageEnemyDeckPath;
  cardDefinitionFile: CardDefinitionFile;
};

const enemyDeckDefinitionData = import.meta.glob<unknown>('../../../cards/deck_*.json', {
  eager: true,
  import: 'default',
});

const ENEMY_DECK_DEFINITIONS = new Map<StageEnemyDeckPath, CardDefinitionFile>(
  Object.entries(enemyDeckDefinitionData).map(([modulePath, definition]) => [
    toStageEnemyDeckPath(modulePath),
    definition as CardDefinitionFile,
  ]),
);

const stageDefinitionData = import.meta.glob<unknown>('../../../cards/stages/*.json', {
  eager: true,
  import: 'default',
});

export const STAGE_DEFINITIONS: readonly StageDefinition[] =
  loadStageDefinitions(stageDefinitionData);

for (const stageDefinition of STAGE_DEFINITIONS) {
  requireRegisteredEnemyDeck(stageDefinition);
}

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

/**
 * Stage가 참조하는 적 덱 정의 파일을 반환한다.
 * cards/deck_*.json 규칙으로 자동 등록된 덱만 반환한다.
 */
export function resolveStageEnemyDeck(stageDefinition: StageDefinition): StageEnemyDeckDefinition {
  const cardDefinitionFile = requireRegisteredEnemyDeck(stageDefinition);
  return {
    deckId: stageDefinition.enemyDeckId,
    deckPath: stageDefinition.enemyDeckPath,
    cardDefinitionFile,
  };
}

/** Stage가 참조한 deck_*.json이 자동 등록됐는지 확인하고 정의를 반환한다. */
function requireRegisteredEnemyDeck(stageDefinition: StageDefinition): CardDefinitionFile {
  const cardDefinitionFile = ENEMY_DECK_DEFINITIONS.get(stageDefinition.enemyDeckPath);
  if (!cardDefinitionFile) {
    throw new Error(
      `Stage ${stageDefinition.id} references an unknown enemy deck path: ${stageDefinition.enemyDeckPath}`,
    );
  }

  return cardDefinitionFile;
}

/** Vite glob 경로를 Stage JSON에서 사용하는 cards/deck_*.json 경로로 변환한다. */
function toStageEnemyDeckPath(modulePath: string): StageEnemyDeckPath {
  const deckPath = modulePath.replace(/^.*\/cards\//, 'cards/');
  if (!/^cards\/deck_[A-Za-z0-9_-]+\.json$/.test(deckPath)) {
    throw new Error(`Invalid enemy deck module path: ${modulePath}`);
  }

  return deckPath as StageEnemyDeckPath;
}
