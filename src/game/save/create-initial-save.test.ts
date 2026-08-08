import { describe, expect, it } from 'vitest';
import { CARD_DEFINITIONS } from './card-catalog';
import { createInitialSaveState } from './create-initial-save';
import { SAVE_SLOT_SCHEMA_VERSION } from './types';

describe('createInitialSaveState', () => {
  it('creates a leader, 29 repeated unit cards, and starter equipment', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const starterEquipmentIds = CARD_DEFINITIONS.filter(
      (definition) => definition.type === 'EQUIPMENT',
    ).map((definition) => definition.id);

    expect(state.schemaVersion).toBe(SAVE_SLOT_SCHEMA_VERSION);
    expect(state.slotId).toBe(1);
    expect(state.deck.leader.zone).toBe('LEADER');
    expect(state.deck.leader.id).toBe('leader_minerva');
    expect(state.deck.leader.name).toBe('미네르바');
    expect(state.deck.leader.traits).toEqual(
      expect.arrayContaining(['elf', 'humanoid', 'medium', 'rare']),
    );
    expect(state.deck.leader.abilities).toEqual([]);
    expect(state.deck.cards).toHaveLength(29);
    expect(state.deck.cards.every((card) => card.zone === 'DECK')).toBe(true);
    expect(state.deck.cards.every((card) => typeof card.description === 'string')).toBe(true);
    expect(state.collection.cards).toHaveLength(starterEquipmentIds.length);
    expect(state.collection.cards.map((card) => card.id)).toEqual(starterEquipmentIds);
    expect(state.collection.cards.every((card) => card.type === 'EQUIPMENT')).toBe(true);
    expect(state.collection.cards.every((card) => card.zone === 'COLLECTION')).toBe(true);
    expect(state.equipment).toEqual({ equipped: [] });
    expect(state.stageProgress).toEqual({
      clearedStageIds: [],
      lastSelectedStageId: null,
    });

    const instanceIds = new Set([
      state.deck.leader.instanceId,
      ...state.deck.cards.map((card) => card.instanceId),
      ...state.collection.cards.map((card) => card.instanceId),
    ]);
    expect(instanceIds.size).toBe(30 + starterEquipmentIds.length);
  });
});
