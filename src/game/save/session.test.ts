import { describe, expect, it } from 'vitest';
import { CARD_DEFINITIONS } from './card-catalog';
import { createInitialSaveState } from './create-initial-save';
import { createGameSession, createSaveSlotStateFromGameSession } from './session';
import { SAVE_SLOT_SCHEMA_VERSION } from './types';

describe('createGameSession', () => {
  it('attaches card definitions to save instances', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const starterEquipmentIds = CARD_DEFINITIONS.filter(
      (definition) => definition.type === 'EQUIPMENT',
    ).map((definition) => definition.id);

    expect(session.slotId).toBe(1);
    expect(session.deck.leader.instance.id).toBe('leader_minerva');
    expect(session.deck.leader.definition.name).toBe('미네르바');
    expect(session.deck.cards).toHaveLength(29);
    expect(session.deck.cards.every((card) => card.definition.id.startsWith('unit_'))).toBe(true);
    expect(session.collection.cards.map((card) => card.definition.id)).toEqual(starterEquipmentIds);
    expect(session.equipment).toEqual({ equipped: [] });
    expect(session.stageProgress).toEqual({
      clearedStageIds: [],
      lastSelectedStageId: null,
    });
  });

  it('throws when a definitionId cannot be resolved', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const brokenState = {
      ...state,
      deck: {
        ...state.deck,
        leader: {
          ...state.deck.leader,
          id: 'missing_definition',
        },
      },
    };

    expect(() => createGameSession(brokenState)).toThrow(
      'Unknown card definitionId: missing_definition',
    );
  });

  it('deep-copies card instances while preserving instance IDs', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const leaderOriginalHp = state.deck.leader.hp;
    const firstCardOriginalAttack = state.deck.cards[0]!.attack;
    const session = createGameSession(state);

    expect(session.deck.leader.instance).not.toBe(state.deck.leader);
    expect(session.deck.cards[0]!.instance).not.toBe(state.deck.cards[0]);
    expect(session.deck.cards[0]!.instance.abilities).not.toBe(state.deck.cards[0]!.abilities);
    expect(session.deck.leader.instance.instanceId).toBe(state.deck.leader.instanceId);
    expect(session.deck.cards[0]!.instance.instanceId).toBe(state.deck.cards[0]!.instanceId);

    session.deck.leader.instance.hp = 1;
    session.deck.cards[0]!.instance.attack = 1;
    session.deck.cards[0]!.instance.abilities[0]!.text = 'changed';

    expect(state.deck.leader.hp).toBe(leaderOriginalHp);
    expect(state.deck.cards[0]!.attack).toBe(firstCardOriginalAttack);
    expect(state.deck.cards[0]!.abilities[0]!.text).not.toBe('changed');
  });

  it('serializes a game session back to save-slot state without runtime fields', async () => {
    const createdAt = new Date('2024-01-01T00:00:00.000Z');
    const updatedAt = new Date('2024-01-02T00:00:00.000Z');
    const state = await createInitialSaveState({ slotId: 1, now: createdAt });
    const starterEquipmentIds = CARD_DEFINITIONS.filter(
      (definition) => definition.type === 'EQUIPMENT',
    ).map((definition) => definition.id);
    state.stageProgress = {
      clearedStageIds: ['test-stage-dark'],
      lastSelectedStageId: 'test-stage-dark',
    };
    const session = createGameSession(state);

    (session.deck.leader.instance as unknown as Record<string, unknown>).battlefieldSlot = 'BC';
    (session.deck.cards[0]!.instance as unknown as Record<string, unknown>).handIndex = 0;

    const savedState = createSaveSlotStateFromGameSession(session, { now: updatedAt });

    expect(savedState).toMatchObject({
      schemaVersion: SAVE_SLOT_SCHEMA_VERSION,
      slotId: 1,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      saveName: 'Slot 1',
      stageProgress: {
        clearedStageIds: ['test-stage-dark'],
        lastSelectedStageId: 'test-stage-dark',
      },
      deck: {
        id: state.deck.id,
      },
      collection: {
        cards: starterEquipmentIds.map((id) => expect.objectContaining({ id })),
      },
      equipment: {
        equipped: [],
      },
    });
    expect(savedState.deck.leader.zone).toBe('LEADER');
    expect(savedState.deck.cards.every((card) => card.zone === 'DECK')).toBe(true);
    expect(savedState.deck.leader).not.toHaveProperty('definition');
    expect(savedState.deck.leader).not.toHaveProperty('battlefieldSlot');
    expect(savedState.deck.cards[0]).not.toHaveProperty('definition');
    expect(savedState.deck.cards[0]).not.toHaveProperty('handIndex');
  });

  it('restores card and collection instances from serialized session state', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    state.collection.cards.push({
      ...state.deck.cards[0]!,
      instanceId: 'collection-card-1',
      zone: 'COLLECTION',
    });
    const session = createGameSession(state);
    const savedState = createSaveSlotStateFromGameSession(session, {
      now: new Date('2024-01-03T00:00:00.000Z'),
    });

    const restoredSession = createGameSession(savedState);

    expect(restoredSession.deck.leader.instance.instanceId).toBe(
      session.deck.leader.instance.instanceId,
    );
    expect(restoredSession.deck.leader.definition.id).toBe(session.deck.leader.definition.id);
    expect(restoredSession.deck.cards.map((card) => card.instance.instanceId)).toEqual(
      session.deck.cards.map((card) => card.instance.instanceId),
    );
    expect(restoredSession.deck.cards.map((card) => card.definition.id)).toEqual(
      session.deck.cards.map((card) => card.definition.id),
    );
    expect(restoredSession.collection.cards.map((card) => card.instance.instanceId)).toContain(
      'collection-card-1',
    );
    const restoredCollectionCard = restoredSession.collection.cards.find(
      (card) => card.instance.instanceId === 'collection-card-1',
    );
    const savedCollectionCard = savedState.collection.cards.find(
      (card) => card.instanceId === 'collection-card-1',
    );
    expect(restoredCollectionCard?.definition.id).toBe(state.deck.cards[0]!.id);
    expect(savedCollectionCard).not.toHaveProperty('definition');
    expect(savedCollectionCard?.zone).toBe('COLLECTION');
  });
});
