import type { GameSession, RuntimeCardInstance } from './session';
import type { CardInstance, CardInstanceZone } from './types';
import { removeEquipmentAttachmentsForTargets } from './equipment';

export type MoveDeckUnitToCollectionOptions = {
  deckCardInstanceId: string;
};

export type MoveCollectionUnitToDeckOptions = {
  collectionCardInstanceId: string;
};

export type ChangeDeckLeaderWithCollectionLeaderOptions = {
  collectionLeaderInstanceId: string;
};

/**
 * 보유 컬렉션 UNIT 1장을 전투 덱의 마지막 위치로 이동한다.
 * 덱 구성 화면에서 UNIT 모드는 UNIT 타입만 다루며, 최소 덱 장수 제한은 두지 않는다.
 */
export function moveCollectionUnitToDeck(
  session: GameSession,
  options: MoveCollectionUnitToDeckOptions,
): GameSession {
  const collectionCardIndex = session.collection.cards.findIndex(
    (card) => card.instance.instanceId === options.collectionCardInstanceId,
  );
  if (collectionCardIndex < 0) {
    throw new Error(`Collection card not found: ${options.collectionCardInstanceId}`);
  }

  const collectionCard = session.collection.cards[collectionCardIndex]!;
  assertCollectionCard(collectionCard);
  assertCardType(collectionCard, 'UNIT', 'Collection card');

  return {
    ...session,
    deck: {
      id: session.deck.id,
      leader: cloneRuntimeCard(session.deck.leader, 'LEADER'),
      cards: [
        ...session.deck.cards.map((card) => cloneRuntimeCard(card, 'DECK')),
        cloneRuntimeCard(collectionCard, 'DECK'),
      ],
    },
    collection: {
      cards: session.collection.cards
        .filter((_, index) => index !== collectionCardIndex)
        .map((card) => cloneRuntimeCard(card, 'COLLECTION')),
    },
    equipment: {
      equipped: session.equipment.equipped.map((attachment) => ({ ...attachment })),
    },
    stageProgress: structuredClone(session.stageProgress),
  };
}

/**
 * 전투 덱 UNIT 1장을 보유 컬렉션의 마지막 위치로 이동한다.
 * 마지막 UNIT도 제거할 수 있으며, 리더 교체는 별도의 LEADER 모드 함수에서만 처리한다.
 */
export function moveDeckUnitToCollection(
  session: GameSession,
  options: MoveDeckUnitToCollectionOptions,
): GameSession {
  const deckCardIndex = session.deck.cards.findIndex(
    (card) => card.instance.instanceId === options.deckCardInstanceId,
  );
  if (deckCardIndex < 0) {
    throw new Error(`Deck card not found: ${options.deckCardInstanceId}`);
  }

  const deckCard = session.deck.cards[deckCardIndex]!;
  assertDeckCard(deckCard);
  assertCardType(deckCard, 'UNIT', 'Deck card');

  return {
    ...session,
    deck: {
      id: session.deck.id,
      leader: cloneRuntimeCard(session.deck.leader, 'LEADER'),
      cards: session.deck.cards
        .filter((_, index) => index !== deckCardIndex)
        .map((card) => cloneRuntimeCard(card, 'DECK')),
    },
    collection: {
      cards: [
        ...session.collection.cards.map((card) => cloneRuntimeCard(card, 'COLLECTION')),
        cloneRuntimeCard(deckCard, 'COLLECTION'),
      ],
    },
    equipment: removeEquipmentAttachmentsForTargets(session, [deckCard.instance.instanceId]),
    stageProgress: structuredClone(session.stageProgress),
  };
}

/**
 * 현재 리더와 보유 컬렉션의 LEADER 카드 1장을 교체한다.
 * 리더 슬롯은 항상 LEADER 타입만 받을 수 있고, 기존 리더는 컬렉션으로 돌아간다.
 */
export function changeDeckLeaderWithCollectionLeader(
  session: GameSession,
  options: ChangeDeckLeaderWithCollectionLeaderOptions,
): GameSession {
  const collectionLeaderIndex = session.collection.cards.findIndex(
    (card) => card.instance.instanceId === options.collectionLeaderInstanceId,
  );
  if (collectionLeaderIndex < 0) {
    throw new Error(`Collection leader not found: ${options.collectionLeaderInstanceId}`);
  }

  const currentLeader = session.deck.leader;
  const nextLeader = session.collection.cards[collectionLeaderIndex]!;
  assertDeckLeader(currentLeader);
  assertCollectionCard(nextLeader);
  assertCardType(nextLeader, 'LEADER', 'Collection card');

  return {
    ...session,
    deck: {
      id: session.deck.id,
      leader: cloneRuntimeCard(nextLeader, 'LEADER'),
      cards: session.deck.cards.map((card) => cloneRuntimeCard(card, 'DECK')),
    },
    collection: {
      cards: session.collection.cards.map((card, index) =>
        index === collectionLeaderIndex
          ? cloneRuntimeCard(currentLeader, 'COLLECTION')
          : cloneRuntimeCard(card, 'COLLECTION'),
      ),
    },
    equipment: {
      equipped: session.equipment.equipped.map((attachment) => ({ ...attachment })),
    },
    stageProgress: structuredClone(session.stageProgress),
  };
}

function assertDeckLeader(card: RuntimeCardInstance): void {
  if (card.instance.zone !== 'LEADER') {
    throw new Error(`Deck leader must be in LEADER zone: ${card.instance.instanceId}`);
  }
  assertCardType(card, 'LEADER', 'Deck leader');
}

function assertDeckCard(card: RuntimeCardInstance): void {
  if (card.instance.zone !== 'DECK') {
    throw new Error(`Deck card must be in DECK zone: ${card.instance.instanceId}`);
  }
}

function assertCollectionCard(card: RuntimeCardInstance): void {
  if (card.instance.zone !== 'COLLECTION') {
    throw new Error(`Collection card must be in COLLECTION zone: ${card.instance.instanceId}`);
  }
}

function assertCardType(
  card: RuntimeCardInstance,
  expectedType: CardInstance['type'],
  label: string,
): void {
  if (card.definition.type !== expectedType || card.instance.type !== expectedType) {
    throw new Error(`${label} must be a ${expectedType} card: ${card.instance.instanceId}`);
  }
}

function cloneRuntimeCard(card: RuntimeCardInstance, zone: CardInstanceZone): RuntimeCardInstance {
  const instance: CardInstance = {
    ...structuredClone(card.instance),
    zone,
  };

  return {
    instance,
    definition: card.definition,
  };
}
