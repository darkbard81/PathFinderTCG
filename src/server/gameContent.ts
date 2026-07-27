import type { CardDefinition } from '../game/cards/card.js';
import {
  GAME_DATA_SCHEMA_VERSION,
  type SaveSlotState,
  type StageDefinition,
} from '../game/data/index.js';

export type SaveSlotId = SaveSlotState['slotId'];

export interface ServerGameContent {
  readonly cardDefinitions: readonly CardDefinition[];
  readonly stages: readonly StageDefinition[];
  createInitialSaveSlotState(slotId: SaveSlotId, now: Date): SaveSlotState;
}

/**
 * Phase 3 카드 풀이 연결되기 전의 직렬화 가능한 빈 초기 상태다.
 * Phase 1 검증 fixture를 런타임 콘텐츠로 승격하지 않는다.
 */
export function createPhaseTwoGameContent(): ServerGameContent {
  const cardDefinitions: readonly CardDefinition[] = Object.freeze([]);
  const stages: readonly StageDefinition[] = Object.freeze([]);

  return Object.freeze({
    cardDefinitions,
    stages,
    createInitialSaveSlotState(slotId: SaveSlotId, now: Date): SaveSlotState {
      return {
        schemaVersion: GAME_DATA_SCHEMA_VERSION,
        slotId,
        collection: {
          cardInstances: [],
        },
        decks: [],
        selectedDeckId: null,
        progress: {
          unlockedStageIds: [],
          clearedStageIds: [],
        },
        completedStageRuns: [],
        lastModifiedAt: now.toISOString(),
      };
    },
  });
}
