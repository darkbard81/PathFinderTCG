import type { CardDefinitionFile } from '../save/card-catalog';
import { STAGE_DEFINITIONS } from './stage-definitions';
import type { StageDefinition, StageEnemyDeckDefinition, StageEnemyDeckPath } from './types';

/**
 * 적 덱 JSON을 번들러가 모은 목록으로 읽는다.
 *
 * 서버·테스트 전용이다. 화면은 Stage 메타데이터만 필요하고 적 구성은 전투 API가 서버에서 연다.
 */
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

for (const stageDefinition of STAGE_DEFINITIONS) {
  requireRegisteredEnemyDeck(stageDefinition);
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

function requireRegisteredEnemyDeck(stageDefinition: StageDefinition): CardDefinitionFile {
  const cardDefinitionFile = ENEMY_DECK_DEFINITIONS.get(stageDefinition.enemyDeckPath);
  if (!cardDefinitionFile) {
    throw new Error(
      `Stage ${stageDefinition.id} references an unknown enemy deck path: ${stageDefinition.enemyDeckPath}`,
    );
  }

  return cardDefinitionFile;
}

function toStageEnemyDeckPath(modulePath: string): StageEnemyDeckPath {
  const deckPath = modulePath.replace(/^.*\/cards\//, 'cards/');
  if (!/^cards\/deck_[A-Za-z0-9_-]+\.json$/.test(deckPath)) {
    throw new Error(`Invalid enemy deck module path: ${modulePath}`);
  }

  return deckPath as StageEnemyDeckPath;
}
