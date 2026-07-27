import { randomUUID } from 'node:crypto';

import type { CardDefinition } from '../game/cards/card.js';
import {
  TEST_CARD_CATALOG,
  createAlliedStarterDeckContent,
  type StarterContentIdFactory,
} from '../game/content/index.js';
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
  });
}
