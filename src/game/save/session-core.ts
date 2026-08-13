import type { LobbyState } from '../lobby/lobby-state';
import type { ResourceState } from '../resources/resource-state';
import {
  SAVE_SLOT_SCHEMA_VERSION,
  type CardCollection,
  type CardInstance,
  type DeckInstance,
  type EquipmentState,
  type SaveSlotState,
  type SaveSlotId,
} from './types';
import { createCardDefinitionMap, type CardDefinition } from './card-catalog';
import type { StageProgressState } from '../stage/types';

export type RuntimeCardInstance = {
  instance: CardInstance;
  definition: CardDefinition;
};

export type RuntimeDeckInstance = {
  id: string;
  leader: RuntimeCardInstance;
  cards: RuntimeCardInstance[];
};

export type RuntimeCardCollection = {
  cards: RuntimeCardInstance[];
};

export type GameSession = {
  schemaVersion: typeof SAVE_SLOT_SCHEMA_VERSION;
  slotId: SaveSlotId;
  createdAt: string;
  updatedAt: string;
  saveName: string;
  deck: RuntimeDeckInstance;
  collection: RuntimeCardCollection;
  equipment: EquipmentState;
  stageProgress: StageProgressState;
  lobby: LobbyState;
  resources: ResourceState;
};

/**
 * 저장 슬롯 상태를 화면과 전투가 쓰는 런타임 세션으로 만든다.
 *
 * 카드 정의를 받아서 쓴다. 어디서 모은 정의인지는 부르는 쪽이 정한다.
 * 브라우저는 저장 인스턴스에서 만든 정의를, 서버는 카탈로그에서 읽은 정의를 넘긴다.
 */
export function createGameSession(
  state: SaveSlotState,
  cardDefinitions: readonly CardDefinition[],
): GameSession {
  const cardDefinitionMap = createCardDefinitionMap(cardDefinitions);

  return {
    schemaVersion: state.schemaVersion,
    slotId: state.slotId,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    saveName: state.saveName,
    deck: {
      id: state.deck.id,
      leader: createRuntimeCardInstance(state.deck.leader, cardDefinitionMap),
      cards: state.deck.cards.map((instance) =>
        createRuntimeCardInstance(instance, cardDefinitionMap),
      ),
    },
    collection: {
      cards: state.collection.cards.map((instance) =>
        createRuntimeCollectionCardInstance(instance, cardDefinitionMap),
      ),
    },
    equipment: structuredClone(state.equipment),
    stageProgress: structuredClone(state.stageProgress),
    lobby: structuredClone(state.lobby),
    resources: structuredClone(state.resources),
  };
}

/**
 * 전투 런타임이 들고 있는 카드 definition을 제거하고 저장 슬롯 스키마로 되돌린다.
 * 현재 저장 스키마는 전투 덱, 보유 컬렉션, 장착표만 보존하므로 손패, 전장 배치, 드롭존 같은 전투 Zone은 포함하지 않는다.
 */
export function createSaveSlotStateFromGameSession(
  session: GameSession,
  options: { now?: Date } = {},
): SaveSlotState {
  return {
    schemaVersion: session.schemaVersion,
    slotId: session.slotId,
    createdAt: session.createdAt,
    updatedAt: (options.now ?? new Date()).toISOString(),
    saveName: session.saveName,
    deck: {
      id: session.deck.id,
      leader: createSavedCardInstance(session.deck.leader.instance, 'LEADER'),
      cards: session.deck.cards.map((card) => createSavedCardInstance(card.instance, 'DECK')),
    },
    collection: {
      cards: session.collection.cards.map((card) =>
        createSavedCardInstance(card.instance, 'COLLECTION'),
      ),
    },
    equipment: structuredClone(session.equipment),
    stageProgress: structuredClone(session.stageProgress),
    lobby: structuredClone(session.lobby),
    resources: structuredClone(session.resources),
  };
}

function createRuntimeCardInstance(
  instance: CardInstance,
  cardDefinitions: Map<string, CardDefinition>,
): RuntimeCardInstance {
  const definition = cardDefinitions.get(instance.id);
  if (!definition) {
    throw new Error(`Unknown card definitionId: ${instance.id}`);
  }

  const runtimeInstance = structuredClone(instance);

  return {
    instance: runtimeInstance,
    definition,
  };
}

function createRuntimeCollectionCardInstance(
  instance: CardInstance,
  cardDefinitions: Map<string, CardDefinition>,
): RuntimeCardInstance {
  const runtimeInstance = structuredClone(instance);

  return {
    instance: runtimeInstance,
    definition: cardDefinitions.get(instance.id) ?? createCardDefinitionFromInstance(instance),
  };
}

function createSavedCardInstance(instance: CardInstance, zone: CardInstance['zone']): CardInstance {
  const saved: CardInstance = {
    id: instance.id,
    name: instance.name,
    type: instance.type,
    traits: structuredClone(instance.traits),
    abilities: structuredClone(instance.abilities),
    description: instance.description,
    note: instance.note,
    instanceId: instance.instanceId,
    owner: instance.owner,
    zone,
  };

  if (instance.slot !== undefined) {
    saved.slot = instance.slot;
  }
  if (instance.cost !== undefined) {
    saved.cost = instance.cost;
  }
  if (instance.dominance !== undefined) {
    saved.dominance = instance.dominance;
  }
  if (instance.hp !== undefined) {
    saved.hp = instance.hp;
  }
  if (instance.attack !== undefined) {
    saved.attack = instance.attack;
  }
  if (instance.level !== undefined) {
    saved.level = instance.level;
  }
  if (instance.exp !== undefined) {
    saved.exp = instance.exp;
  }
  if (instance.growth !== undefined) {
    saved.growth = structuredClone(instance.growth);
  }

  return saved;
}

/**
 * 저장 인스턴스에 이미 들어 있는 표시·수치 필드로 카드 정의를 만든다.
 *
 * 카탈로그 JSON이 없을 때 화면이 쓰는 경로다. 성장이 반영된 현재 값이므로
 * 레벨 1 기준 수치와 비교해야 하면 서버 카탈로그를 써야 한다.
 */
export function createCardDefinitionFromInstance(instance: CardInstance): CardDefinition {
  const definition: CardDefinition = {
    id: instance.id,
    name: instance.name,
    type: instance.type,
    traits: structuredClone(instance.traits),
    abilities: structuredClone(instance.abilities),
    description: instance.description,
    note: instance.note,
  };

  if (instance.slot !== undefined) {
    definition.slot = instance.slot;
  }
  if (instance.cost !== undefined) {
    definition.cost = instance.cost;
  }
  if (instance.dominance !== undefined) {
    definition.dominance = instance.dominance;
  }
  if (instance.hp !== undefined) {
    definition.hp = instance.hp;
  }
  if (instance.attack !== undefined) {
    definition.attack = instance.attack;
  }
  if (instance.level !== undefined) {
    definition.level = instance.level;
  }
  if (instance.exp !== undefined) {
    definition.exp = instance.exp;
  }
  if (instance.growth !== undefined) {
    definition.growth = structuredClone(instance.growth);
  }

  return definition;
}

export type { CardDefinition, SaveSlotState, DeckInstance, CardCollection, EquipmentState };

/**
 * 세션이 들고 있는 카드 한 장을 instanceId로 찾는다.
 * 리더·덱·컬렉션을 한 번에 훑는다. 화면마다 어느 통에 있는지 따로 알 필요가 없게 한다.
 */
export function findSessionCard(
  session: GameSession,
  instanceId: string,
): RuntimeCardInstance | null {
  if (session.deck.leader.instance.instanceId === instanceId) {
    return session.deck.leader;
  }

  return (
    [...session.deck.cards, ...session.collection.cards].find(
      (card) => card.instance.instanceId === instanceId,
    ) ?? null
  );
}
