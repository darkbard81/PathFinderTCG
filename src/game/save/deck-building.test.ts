import { describe, expect, it } from 'vitest';
import { requireCardDefinition, type CardDefinition } from './card-catalog';
import { createCardInstanceFromDefinition } from './deck-instancing';
import { createInitialSaveState } from './create-initial-save';
import {
  createGameSession,
  createSaveSlotStateFromGameSession,
  type GameSession,
  type RuntimeCardInstance,
} from './session';
import {
  changeDeckLeaderWithCollectionLeader,
  moveCollectionUnitToDeck,
  moveDeckUnitToCollection,
} from './deck-building';

describe('deck building card movement', () => {
  it('moves a collection UNIT into the deck without removing another deck card', async () => {
    const session = await createSessionWithCollectionCard('unit_dark_assassin_001', 'collection-1');
    const collectionCard = session.collection.cards[0]!;

    const nextSession = moveCollectionUnitToDeck(session, {
      collectionCardInstanceId: collectionCard.instance.instanceId,
    });

    expect(nextSession.deck.cards).toHaveLength(session.deck.cards.length + 1);
    expect(nextSession.collection.cards).toHaveLength(session.collection.cards.length - 1);
    const addedDeckCard = nextSession.deck.cards[nextSession.deck.cards.length - 1]!;

    expect(addedDeckCard.instance.instanceId).toBe(collectionCard.instance.instanceId);
    expect(addedDeckCard.definition.id).toBe(collectionCard.definition.id);
    expect(addedDeckCard.definition.type).toBe('UNIT');
    expect(addedDeckCard.instance.zone).toBe('DECK');
    expect(nextSession.collection.cards).toEqual([]);
  });

  it('moves a deck UNIT into the collection and allows an empty non-leader deck', async () => {
    const session = await createSingleCardDeckSession();
    const deckCard = session.deck.cards[0]!;

    const nextSession = moveDeckUnitToCollection(session, {
      deckCardInstanceId: deckCard.instance.instanceId,
    });

    expect(nextSession.deck.cards).toHaveLength(0);
    expect(nextSession.collection.cards).toHaveLength(1);
    expect(nextSession.collection.cards[0]!.instance.instanceId).toBe(deckCard.instance.instanceId);
    expect(nextSession.collection.cards[0]!.definition.id).toBe(deckCard.definition.id);
    expect(nextSession.collection.cards[0]!.definition.type).toBe('UNIT');
    expect(nextSession.collection.cards[0]!.instance.zone).toBe('COLLECTION');
  });

  it('changes the deck LEADER with a collection LEADER only', async () => {
    const session = await createSessionWithCollectionCard('leader_dark_empress', 'leader-reward-1');
    const currentLeader = session.deck.leader;
    const collectionLeader = session.collection.cards[0]!;

    const nextSession = changeDeckLeaderWithCollectionLeader(session, {
      collectionLeaderInstanceId: collectionLeader.instance.instanceId,
    });

    expect(nextSession.deck.leader.instance.instanceId).toBe(collectionLeader.instance.instanceId);
    expect(nextSession.deck.leader.definition.id).toBe('leader_dark_empress');
    expect(nextSession.deck.leader.definition.type).toBe('LEADER');
    expect(nextSession.deck.leader.instance.zone).toBe('LEADER');
    expect(nextSession.collection.cards).toHaveLength(1);
    expect(nextSession.collection.cards[0]!.instance.instanceId).toBe(
      currentLeader.instance.instanceId,
    );
    expect(nextSession.collection.cards[0]!.definition.id).toBe(currentLeader.definition.id);
    expect(nextSession.collection.cards[0]!.instance.zone).toBe('COLLECTION');
  });

  it('rejects missing IDs, wrong zones, and mismatched types', async () => {
    const session = await createSessionWithCollectionCard('unit_dark_assassin_001', 'collection-1');

    expect(() =>
      moveCollectionUnitToDeck(session, {
        collectionCardInstanceId: 'missing-collection-card',
      }),
    ).toThrow('Collection card not found: missing-collection-card');
    expect(() =>
      moveDeckUnitToCollection(session, {
        deckCardInstanceId: 'missing-deck-card',
      }),
    ).toThrow('Deck card not found: missing-deck-card');
    expect(() =>
      changeDeckLeaderWithCollectionLeader(session, {
        collectionLeaderInstanceId: 'missing-leader',
      }),
    ).toThrow('Collection leader not found: missing-leader');

    const collectionLeaderSession = await createSessionWithCollectionCard(
      'leader_dark_empress',
      'leader-reward-1',
    );
    expect(() =>
      moveCollectionUnitToDeck(collectionLeaderSession, {
        collectionCardInstanceId: 'leader-reward-1',
      }),
    ).toThrow('Collection card must be a UNIT card: leader-reward-1');
    expect(() =>
      changeDeckLeaderWithCollectionLeader(session, {
        collectionLeaderInstanceId: 'collection-1',
      }),
    ).toThrow('Collection card must be a LEADER card: collection-1');

    const itemSession = {
      ...session,
      collection: {
        cards: [createRuntimeCard(createItemDefinition(), 'collection-item', 'COLLECTION')],
      },
    };
    expect(() =>
      moveCollectionUnitToDeck(itemSession, {
        collectionCardInstanceId: 'collection-item',
      }),
    ).toThrow('Collection card must be a UNIT card: collection-item');

    const deckWithWrongZone = {
      ...session,
      deck: {
        ...session.deck,
        cards: [
          {
            ...session.deck.cards[0]!,
            instance: {
              ...session.deck.cards[0]!.instance,
              zone: 'COLLECTION' as const,
            },
          },
        ],
      },
    };
    expect(() =>
      moveDeckUnitToCollection(deckWithWrongZone, {
        deckCardInstanceId: session.deck.cards[0]!.instance.instanceId,
      }),
    ).toThrow('Deck card must be in DECK zone');
  });

  it('persists changed LEADER and free UNIT deck counts through save reload', async () => {
    const session = await createSingleCardDeckSession();
    const withLeaderReward = {
      ...session,
      collection: {
        cards: [
          createRuntimeCard(
            requireCardDefinition('leader_dark_empress'),
            'leader-reward-1',
            'COLLECTION',
          ),
        ],
      },
    };
    const leaderChanged = changeDeckLeaderWithCollectionLeader(withLeaderReward, {
      collectionLeaderInstanceId: 'leader-reward-1',
    });
    const deckCard = leaderChanged.deck.cards[0]!;
    const nextSession = moveDeckUnitToCollection(leaderChanged, {
      deckCardInstanceId: deckCard.instance.instanceId,
    });
    const savedState = createSaveSlotStateFromGameSession(nextSession, {
      now: new Date('2024-01-02T00:00:00.000Z'),
    });
    const reloadedSession = createGameSession(savedState);

    expect(savedState.deck.leader.instanceId).toBe('leader-reward-1');
    expect(savedState.deck.leader.zone).toBe('LEADER');
    expect(savedState.deck.cards).toHaveLength(0);
    expect(savedState.collection.cards).toHaveLength(2);
    expect(reloadedSession.deck.leader.definition.id).toBe('leader_dark_empress');
    expect(reloadedSession.deck.cards).toHaveLength(0);
    expect(reloadedSession.collection.cards.map((card) => card.definition.type)).toEqual([
      'LEADER',
      'UNIT',
    ]);
  });
});

async function createSessionWithCollectionCard(
  definitionId: string,
  instanceId: string,
): Promise<GameSession> {
  const state = await createInitialSaveState({ slotId: 1 });
  const definition = requireCardDefinition(definitionId);
  state.collection.cards = [
    createCardInstanceFromDefinition({
      definition,
      owner: 'PLAYER',
      zone: 'COLLECTION',
      createId: () => instanceId,
    }),
  ];
  state.equipment = { equipped: [] };

  return createGameSession(state);
}

async function createSingleCardDeckSession(): Promise<GameSession> {
  const state = await createInitialSaveState({ slotId: 1 });
  state.deck.cards = [state.deck.cards[0]!];
  state.collection.cards = [];
  state.equipment = { equipped: [] };

  return createGameSession(state);
}

function createRuntimeCard(
  definition: CardDefinition,
  instanceId: string,
  zone: RuntimeCardInstance['instance']['zone'],
): RuntimeCardInstance {
  const instance = createCardInstanceFromDefinition({
    definition,
    owner: 'PLAYER',
    zone,
    createId: () => instanceId,
  });

  return {
    instance,
    definition,
  };
}

function createItemDefinition(): CardDefinition {
  return {
    id: 'item-test',
    name: '테스트 아이템',
    type: 'ITEM',
    traits: [],
    hp: 0,
    attack: 0,
    abilities: [],
    description: '',
    note: '',
  };
}
