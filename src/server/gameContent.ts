import { randomUUID } from 'node:crypto';

import type { CardDefinition } from '../game/cards/card.js';
import {
  ENEMY_TEST_DECK_BLUEPRINT,
  STAGE_ONE_DEFINITION,
  TEST_CARD_CATALOG,
  createAlliedStarterDeckContent,
  type StarterContentIdFactory,
} from '../game/content/index.js';
import {
  GAME_DATA_SCHEMA_VERSION,
  validateStageDefinition,
  type SaveSlotState,
  type StageDefinition,
} from '../game/data/index.js';

export type SaveSlotId = SaveSlotState['slotId'];

export interface ServerGameContent {
  readonly cardDefinitions: readonly CardDefinition[];
  readonly stages: readonly StageDefinition[];
  createInitialSaveSlotState(slotId: SaveSlotId, now: Date): SaveSlotState;
  migrateSaveSlotState(state: SaveSlotState, now: Date): SaveSlotState;
}

export function createPhaseThreeGameContent(
  createId: StarterContentIdFactory = () => randomUUID(),
): ServerGameContent {
  const cardDefinitions = TEST_CARD_CATALOG.cardDefinitions;
  const stages: readonly StageDefinition[] = Object.freeze([]);

  return Object.freeze({
    cardDefinitions,
    stages,
    createInitialSaveSlotState(slotId: SaveSlotId, now: Date): SaveSlotState {
      const starterContent = createAlliedStarterDeckContent(createId);

      return {
        schemaVersion: GAME_DATA_SCHEMA_VERSION,
        slotId,
        collection: starterContent.collection,
        decks: [starterContent.deck],
        selectedDeckId: starterContent.deck.id,
        progress: {
          unlockedStageIds: [],
          clearedStageIds: [],
        },
        completedStageRuns: [],
        lastModifiedAt: now.toISOString(),
      };
    },
    migrateSaveSlotState(state: SaveSlotState): SaveSlotState {
      return state;
    },
  });
}

export function createPhaseEightGameContent(
  createId: StarterContentIdFactory = () => randomUUID(),
): ServerGameContent {
  const phaseThree = createPhaseThreeGameContent(createId);
  const stageValidation = validateStageDefinition(
    STAGE_ONE_DEFINITION,
    [ENEMY_TEST_DECK_BLUEPRINT],
    phaseThree.cardDefinitions,
  );

  if (!stageValidation.valid) {
    throw new Error(
      `Stage 01 콘텐츠가 데이터 계약을 만족하지 않습니다: ${stageValidation.issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join(' · ')}`,
    );
  }

  return Object.freeze({
    cardDefinitions: phaseThree.cardDefinitions,
    stages: Object.freeze([STAGE_ONE_DEFINITION]),
    createInitialSaveSlotState(slotId: SaveSlotId, now: Date): SaveSlotState {
      const state = phaseThree.createInitialSaveSlotState(slotId, now);

      return {
        ...state,
        progress: {
          ...state.progress,
          unlockedStageIds: [STAGE_ONE_DEFINITION.id],
        },
      };
    },
    migrateSaveSlotState(state: SaveSlotState, now: Date): SaveSlotState {
      if (state.progress.unlockedStageIds.includes(STAGE_ONE_DEFINITION.id)) {
        return state;
      }

      return {
        ...state,
        progress: {
          ...state.progress,
          unlockedStageIds: [...state.progress.unlockedStageIds, STAGE_ONE_DEFINITION.id],
        },
        lastModifiedAt: now.toISOString(),
      };
    },
  });
}
