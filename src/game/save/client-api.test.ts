import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveSlotsClient } from './client-api';
import { SAVE_SLOT_SCHEMA_VERSION, type CardInstance, type SaveSlotState } from './types';

type FakeResponseInit = {
  ok: boolean;
  status: number;
  statusText: string;
  body: unknown;
};

function createFakeResponse(init: FakeResponseInit): Response {
  return {
    ok: init.ok,
    status: init.status,
    statusText: init.statusText,
    json: async () => init.body,
    text: async () => (typeof init.body === 'string' ? init.body : JSON.stringify(init.body)),
  } as Response;
}

function createValidSaveSlotState(): SaveSlotState {
  return {
    schemaVersion: SAVE_SLOT_SCHEMA_VERSION,
    slotId: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    saveName: 'Slot 1',
    deck: {
      id: 'deck-1',
      leader: createValidCardInstance({ zone: 'LEADER' }),
      cards: [],
    },
    collection: {
      cards: [createValidCardInstance({ instanceId: 'collection-1', zone: 'COLLECTION' })],
    },
    equipment: {
      equipped: [],
    },
    stageProgress: {
      clearedStageIds: [],
      lastSelectedStageId: null,
    },
    lobby: {
      ownedBackgroundIds: ['background_01'],
      selectedBackgroundId: 'background_01',
    },
    resources: {
      gold: 125_680,
      manaStone: 8_420,
      summonTicket: 12,
    },
  };
}

function createValidCardInstance(overrides: Partial<CardInstance> = {}): CardInstance {
  return {
    id: overrides.zone === 'COLLECTION' ? 'unit_collection_test' : 'leader_minerva',
    name: overrides.zone === 'COLLECTION' ? '컬렉션 테스트 카드' : '미네르바',
    type: overrides.zone === 'COLLECTION' ? 'UNIT' : 'LEADER',
    traits: ['rare', 'elf'],
    slot: 0,
    cost: 1,
    dominance: 1,
    hp: 100,
    attack: 10,
    level: 1,
    exp: 0,
    abilities: [],
    growth: {
      lv2: [],
      lv3: [],
      lv4: [],
      lv5: [],
      lv6: [],
      lv7: [],
      lv8: [],
      lv9: [],
    },
    description: '테스트 리더',
    note: '테스트 노트',
    instanceId: 'leader-1',
    owner: 'PLAYER',
    zone: 'LEADER',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('save slot client api', () => {
  it('loads save slot summaries', async () => {
    const fetchSpy = vi.fn(async () =>
      createFakeResponse({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: {
          slots: [
            {
              slotId: 1,
              saveName: 'Slot 1',
              updatedAt: null,
              deckCardCount: null,
              leaderName: null,
              isEmpty: true,
            },
          ],
        },
      }),
    );
    const client = new SaveSlotsClient(fetchSpy);

    await expect(client.fetchSummaries()).resolves.toEqual([
      {
        slotId: 1,
        saveName: 'Slot 1',
        updatedAt: null,
        deckCardCount: null,
        leaderName: null,
        isEmpty: true,
      },
    ]);
    expect(fetchSpy).toHaveBeenCalledWith('/api/save-slots');
  });

  it('rejects invalid save slot state payloads', async () => {
    const client = new SaveSlotsClient(
      vi.fn(async () =>
        createFakeResponse({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: { slotId: 1 },
        }),
      ),
    );

    await expect(client.fetch(1)).rejects.toThrow('Invalid save slot state response');
  });

  it('saves a slot state with PUT and JSON body', async () => {
    const state = createValidSaveSlotState();
    const fetchSpy = vi.fn(async () =>
      createFakeResponse({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: state,
      }),
    );
    const client = new SaveSlotsClient(fetchSpy);

    await expect(client.save(state)).resolves.toEqual(state);
    expect(fetchSpy).toHaveBeenCalledWith('/api/save-slots/1', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    });
  });

  it('rejects invalid save slot state payloads after save', async () => {
    const state = createValidSaveSlotState();
    const client = new SaveSlotsClient(
      vi.fn(async () =>
        createFakeResponse({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: { slotId: 1 },
        }),
      ),
    );

    await expect(client.save(state)).rejects.toThrow('Invalid save slot state response');
  });

  it('loads initialized save slots', async () => {
    const client = new SaveSlotsClient(
      vi.fn(async () =>
        createFakeResponse({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: {
            state: {
              schemaVersion: SAVE_SLOT_SCHEMA_VERSION,
              slotId: 1,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
              saveName: 'Slot 1',
              deck: {
                id: 'deck-1',
                leader: createValidCardInstance({ zone: 'LEADER' }),
                cards: [],
              },
              collection: {
                cards: [],
              },
              equipment: {
                equipped: [],
              },
              stageProgress: {
                clearedStageIds: [],
                lastSelectedStageId: null,
              },
              lobby: {
                ownedBackgroundIds: ['background_01'],
                selectedBackgroundId: 'background_01',
              },
              resources: {
                gold: 0,
                manaStone: 0,
                summonTicket: 0,
              },
            },
            summary: {
              slotId: 1,
              saveName: 'Slot 1',
              updatedAt: '2024-01-01T00:00:00.000Z',
              deckCardCount: 0,
              leaderName: '미네르바',
              isEmpty: false,
            },
          },
        }),
      ),
    );

    await expect(client.initialize(1)).resolves.toMatchObject({
      state: {
        slotId: 1,
      },
      summary: {
        leaderName: '미네르바',
      },
    });
  });

  it('deletes a slot with DELETE and returns its empty summary', async () => {
    const summary = {
      slotId: 2 as const,
      saveName: null,
      updatedAt: null,
      deckCardCount: null,
      leaderName: null,
      isEmpty: true,
    };
    const fetchSpy = vi.fn(async () =>
      createFakeResponse({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: { summary },
      }),
    );
    const client = new SaveSlotsClient(fetchSpy);

    await expect(client.delete(2)).resolves.toEqual(summary);
    expect(fetchSpy).toHaveBeenCalledWith('/api/save-slots/2', {
      method: 'DELETE',
    });
  });

  it('rejects invalid delete responses', async () => {
    const client = new SaveSlotsClient(
      vi.fn(async () =>
        createFakeResponse({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: {
            summary: {
              slotId: 1,
              saveName: 'Still occupied',
              updatedAt: '2024-01-01T00:00:00.000Z',
              deckCardCount: 1,
              leaderName: '미네르바',
              isEmpty: false,
            },
          },
        }),
      ),
    );

    await expect(client.delete(1)).rejects.toThrow('Invalid delete save slot response');
  });
});
