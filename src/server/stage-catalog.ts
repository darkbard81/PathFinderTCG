import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CardDefinitionFile } from '../game/save/card-catalog';
import { loadStageDefinitions } from '../game/stage/stage-loader';
import type {
  StageDefinition,
  StageEnemyDeckDefinition,
  StageEnemyDeckPath,
} from '../game/stage/types';

const defaultProjectRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Stage 정의와 적 덱을 저장소 파일에서 직접 읽는다.
 *
 * 브라우저 쪽 `stage-definitions.ts`는 Stage 메타데이터만 번들러가 모아 준다. 적 덱 JSON은
 * 이 카탈로그가 디스크에서 읽고, 테스트는 `stage-enemy-decks.ts`가 같은 파일을 번들로 모은다.
 * Stage 목록 검증은 같은 `loadStageDefinitions`를 통과시켜 규칙이 갈라지지 않게 한다.
 */
export class StageCatalog {
  private readonly stageDefinitions: readonly StageDefinition[];
  private readonly enemyDeckFiles = new Map<StageEnemyDeckPath, CardDefinitionFile>();

  public constructor(private readonly projectRoot: string = defaultProjectRoot) {
    this.stageDefinitions = loadStageDefinitions(readStageFiles(projectRoot));
  }

  public listStages(): StageDefinition[] {
    return [...this.stageDefinitions];
  }

  /** Stage ID에 맞는 정의를 돌려준다. 없으면 전투 시작을 막을 수 있게 예외를 던진다. */
  public requireStage(stageId: string): StageDefinition {
    const stageDefinition = this.stageDefinitions.find((stage) => stage.id === stageId);
    if (!stageDefinition) {
      throw new Error(`Unknown stageId: ${stageId}`);
    }

    return stageDefinition;
  }

  /** Stage가 참조하는 적 덱 파일을 읽는다. 한 번 읽은 덱은 다시 읽지 않는다. */
  public resolveEnemyDeck(stageDefinition: StageDefinition): StageEnemyDeckDefinition {
    const cached = this.enemyDeckFiles.get(stageDefinition.enemyDeckPath);
    const cardDefinitionFile = cached ?? this.readEnemyDeckFile(stageDefinition.enemyDeckPath);
    if (!cached) {
      this.enemyDeckFiles.set(stageDefinition.enemyDeckPath, cardDefinitionFile);
    }

    return {
      deckId: stageDefinition.enemyDeckId,
      deckPath: stageDefinition.enemyDeckPath,
      cardDefinitionFile,
    };
  }

  private readEnemyDeckFile(deckPath: StageEnemyDeckPath): CardDefinitionFile {
    // deckPath는 stage-loader가 `cards/deck_*.json` 형태만 통과시킨 값이라 경로 조작이 들어오지 않는다.
    const absolutePath = path.join(this.projectRoot, deckPath);
    try {
      return JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as CardDefinitionFile;
    } catch (error) {
      throw new Error(
        `Failed to read enemy deck ${deckPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function readStageFiles(projectRoot: string): Record<string, unknown> {
  const stagesRoot = path.join(projectRoot, 'cards', 'stages');
  const entries = fs
    .readdirSync(stagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();

  return Object.fromEntries(
    entries.map((name) => [
      `cards/stages/${name}`,
      JSON.parse(fs.readFileSync(path.join(stagesRoot, name), 'utf8')) as unknown,
    ]),
  );
}
