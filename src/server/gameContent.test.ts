import { describe, expect, it } from 'vitest';

import {
  parseSaveSlotState,
  validatePlayableSavedDeck,
  validateSaveSlotState,
} from '../game/data/index.js';
import { STAGE_ONE_ID, type StarterContentIdFactory } from '../game/content/index.js';
import { createPhaseEightGameContent, createPhaseThreeGameContent } from './gameContent.js';

function createSequentialContentIdFactory(namespace: string): StarterContentIdFactory {
  let sequence = 0;

  return (request) => {
    const copyIndex = request.kind === 'CARD_INSTANCE' ? request.copyIndex : 0;
    const id = `${namespace}-${request.kind.toLowerCase()}-${request.sourceId}-${copyIndex}-${sequence}`;
    sequence += 1;
    return id;
  };
}

describe('Phase 3 game content boundary', () => {
  it('creates a Schema-valid slot with the owned 30-card allied starter deck', () => {
    const content = createPhaseThreeGameContent(createSequentialContentIdFactory('slot'));
    const state = content.createInitialSaveSlotState(2, new Date('2026-07-27T06:00:00.000Z'));
    const deck = state.decks[0];

    if (deck === undefined) {
      throw new Error('Phase 3 초기 슬롯에 starter 덱이 없습니다.');
    }

    expect(state).toMatchObject({
      slotId: 2,
      selectedDeckId: deck.id,
      progress: {
        unlockedStageIds: [],
        clearedStageIds: [],
      },
    });
    expect(state.collection.cardInstances).toHaveLength(30);
    expect(state.decks).toHaveLength(1);
    expect(deck.leaderInstanceId).not.toBeNull();
    expect(deck.unitInstanceIds).toHaveLength(29);
    expect(parseSaveSlotState(state).success).toBe(true);
    expect(validateSaveSlotState(state, content.cardDefinitions, content.stages)).toEqual({
      valid: true,
      issues: [],
    });
    expect(
      validatePlayableSavedDeck(deck, {
        collection: state.collection,
        cardDefinitions: content.cardDefinitions,
      }),
    ).toEqual({
      valid: true,
      issues: [],
    });
  });

  it('issues fresh owned-card and deck IDs for separate new slots', () => {
    const content = createPhaseThreeGameContent(createSequentialContentIdFactory('fresh'));
    const first = content.createInitialSaveSlotState(1, new Date('2026-07-27T06:00:00.000Z'));
    const second = content.createInitialSaveSlotState(2, new Date('2026-07-27T06:01:00.000Z'));
    const firstIds = new Set([
      ...first.collection.cardInstances.map((instance) => instance.id),
      ...first.decks.map((deck) => deck.id),
    ]);
    const secondIds = [
      ...second.collection.cardInstances.map((instance) => instance.id),
      ...second.decks.map((deck) => deck.id),
    ];

    expect(secondIds.every((id) => !firstIds.has(id))).toBe(true);
  });
});

describe('Phase 8 game content boundary', () => {
  it('unlocks the data-defined Stage 01 for new slots', () => {
    const content = createPhaseEightGameContent(createSequentialContentIdFactory('phase-eight'));
    const state = content.createInitialSaveSlotState(1, new Date('2026-07-28T06:00:00.000Z'));

    expect(content.stages.map((stage) => stage.id)).toEqual([STAGE_ONE_ID]);
    expect(state.progress).toEqual({
      unlockedStageIds: [STAGE_ONE_ID],
      clearedStageIds: [],
    });
    expect(validateSaveSlotState(state, content.cardDefinitions, content.stages)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it('migrates an existing Phase 3 slot without replacing its collection or deck', () => {
    const createId = createSequentialContentIdFactory('legacy');
    const phaseThree = createPhaseThreeGameContent(createId);
    const phaseEight = createPhaseEightGameContent(createId);
    const legacy = phaseThree.createInitialSaveSlotState(2, new Date('2026-07-27T06:00:00.000Z'));
    const migrated = phaseEight.migrateSaveSlotState(legacy, new Date('2026-07-28T06:00:00.000Z'));

    expect(migrated).not.toBe(legacy);
    expect(migrated.collection).toBe(legacy.collection);
    expect(migrated.decks).toBe(legacy.decks);
    expect(migrated.progress).toEqual({
      unlockedStageIds: [STAGE_ONE_ID],
      clearedStageIds: [],
    });
    expect(migrated.lastModifiedAt).toBe('2026-07-28T06:00:00.000Z');
    expect(phaseEight.migrateSaveSlotState(migrated, new Date('2026-07-28T07:00:00.000Z'))).toBe(
      migrated,
    );
  });
});
