import { describe, expect, it } from 'vitest';

import { parseSaveSlotState, validateSaveSlotState } from '../game/data/index.js';
import { createPhaseTwoGameContent } from './gameContent.js';

describe('Phase 2 game content boundary', () => {
  it('creates an empty Schema-valid slot without promoting Phase 1 fixtures to runtime content', () => {
    const content = createPhaseTwoGameContent();
    const state = content.createInitialSaveSlotState(2, new Date('2026-07-27T06:00:00.000Z'));

    expect(state).toMatchObject({
      slotId: 2,
      collection: {
        cardInstances: [],
      },
      decks: [],
      selectedDeckId: null,
    });
    expect(parseSaveSlotState(state).success).toBe(true);
    expect(validateSaveSlotState(state, content.cardDefinitions, content.stages)).toEqual({
      valid: true,
      issues: [],
    });
  });
});
