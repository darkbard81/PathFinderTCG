import type { CardAbility } from './card-catalog';
import type { GameSession, RuntimeCardInstance, RuntimeDeckInstance } from './session';
import type { CardInstance, CardInstanceZone, EquipmentAttachment, EquipmentState } from './types';

export type EquipCollectionEquipmentToDeckUnitOptions = {
  targetDeckCardInstanceId: string;
  equipmentCardInstanceId: string;
};

export type UnequipEquipmentFromDeckUnitOptions = {
  targetDeckCardInstanceId: string;
  equipmentCardInstanceId: string;
};

/**
 * 보유 컬렉션의 EQUIPMENT 카드 1장을 현재 덱의 UNIT 카드에 장착한다.
 * 장착은 카드 이동이 아니라 SaveSlot의 장착표 변경이며, slot 용량과 능력 중복을 통과해야 한다.
 */
export function equipCollectionEquipmentToDeckUnit(
  session: GameSession,
  options: EquipCollectionEquipmentToDeckUnitOptions,
): GameSession {
  const target = requireDeckUnit(session, options.targetDeckCardInstanceId);
  const equipment = requireCollectionEquipment(session, options.equipmentCardInstanceId);
  assertEquipmentIsNotAlreadyEquipped(session.equipment, equipment.instance.instanceId);
  assertCanEquip(session, target, equipment);

  return cloneGameSession(session, {
    equipment: {
      equipped: [
        ...session.equipment.equipped.map(cloneEquipmentAttachment),
        {
          targetCardInstanceId: target.instance.instanceId,
          equipmentCardInstanceId: equipment.instance.instanceId,
        },
      ],
    },
  });
}

/**
 * 현재 덱 UNIT 카드에서 지정한 EQUIPMENT 장착 관계를 제거한다.
 * 장비 카드는 컬렉션에 계속 남아 있으므로 SaveSlot의 장착표만 갱신한다.
 */
export function unequipEquipmentFromDeckUnit(
  session: GameSession,
  options: UnequipEquipmentFromDeckUnitOptions,
): GameSession {
  const attachmentIndex = session.equipment.equipped.findIndex(
    (attachment) =>
      attachment.targetCardInstanceId === options.targetDeckCardInstanceId &&
      attachment.equipmentCardInstanceId === options.equipmentCardInstanceId,
  );
  if (attachmentIndex < 0) {
    throw new Error(`Equipment attachment not found: ${options.equipmentCardInstanceId}`);
  }

  return cloneGameSession(session, {
    equipment: {
      equipped: session.equipment.equipped
        .filter((_, index) => index !== attachmentIndex)
        .map(cloneEquipmentAttachment),
    },
  });
}

/**
 * 덱 카드 제거 등으로 더 이상 유효하지 않은 대상의 장착 관계를 제거한다.
 * 장착표만 정리하고 카드 컬렉션 자체는 변경하지 않는다.
 */
export function removeEquipmentAttachmentsForTargets(
  session: GameSession,
  targetCardInstanceIds: readonly string[],
): EquipmentState {
  const removedTargetIds = new Set(targetCardInstanceIds);

  return {
    equipped: session.equipment.equipped
      .filter((attachment) => !removedTargetIds.has(attachment.targetCardInstanceId))
      .map(cloneEquipmentAttachment),
  };
}

/**
 * 세션의 덱 카드에 저장된 장비 보정을 반영한 전투용 덱을 만든다.
 * 반환값은 전투 런타임 전용 복제본이며, 원본 세션의 카드 인스턴스와 definition은 변경하지 않는다.
 */
export function createRuntimeDeckWithEquipment(session: GameSession): RuntimeDeckInstance {
  const equipmentByTarget = groupEquipmentByTarget(session);

  return {
    id: session.deck.id,
    leader: cloneRuntimeCard(session.deck.leader, 'LEADER'),
    cards: session.deck.cards.map((card) =>
      applyEquipmentToRuntimeCard(card, equipmentByTarget.get(card.instance.instanceId) ?? []),
    ),
  };
}

function assertCanEquip(
  session: GameSession,
  target: RuntimeCardInstance,
  nextEquipment: RuntimeCardInstance,
): void {
  const equippedCards = listEquippedCardsForTarget(session, target.instance.instanceId);
  const usedSlot = equippedCards.reduce((total, equipment) => total + readSlotUsage(equipment), 0);
  const nextSlot = readSlotUsage(nextEquipment);
  const capacity = readSlotCapacity(target);
  if (usedSlot + nextSlot > capacity) {
    throw new Error(
      `Equipment slot limit exceeded for ${target.instance.instanceId}: ${usedSlot + nextSlot}/${capacity}`,
    );
  }

  assertNoDuplicateEquipmentAbilities(target, [...equippedCards, nextEquipment]);
}

function assertNoDuplicateEquipmentAbilities(
  target: RuntimeCardInstance,
  equipmentCards: RuntimeCardInstance[],
): void {
  const abilityIds = new Set(target.instance.abilities.map((ability) => ability.id));
  for (const equipment of equipmentCards) {
    assertCardType(equipment, 'EQUIPMENT', 'Equipment card');
    for (const ability of equipment.instance.abilities) {
      if (abilityIds.has(ability.id)) {
        throw new Error(`Duplicate equipment ability: ${ability.id}`);
      }
      abilityIds.add(ability.id);
    }
  }
}

function applyEquipmentToRuntimeCard(
  card: RuntimeCardInstance,
  equipmentCards: RuntimeCardInstance[],
): RuntimeCardInstance {
  const instance = structuredClone(card.instance);
  const definition = structuredClone(card.definition);
  for (const equipment of equipmentCards) {
    instance.cost = addCardNumber(instance.cost, equipment.instance.cost);
    instance.dominance = addCardNumber(instance.dominance, equipment.instance.dominance);
    instance.hp = addCardNumber(instance.hp, equipment.instance.hp);
    instance.attack = addCardNumber(instance.attack, equipment.instance.attack);
    instance.abilities.push(...cloneAbilities(equipment.instance.abilities));
    definition.abilities.push(...cloneAbilities(equipment.definition.abilities));
  }

  return {
    instance,
    definition,
  };
}

function groupEquipmentByTarget(session: GameSession): Map<string, RuntimeCardInstance[]> {
  const equipmentByTarget = new Map<string, RuntimeCardInstance[]>();
  const usedEquipmentIds = new Set<string>();
  for (const attachment of session.equipment.equipped) {
    const target = requireDeckUnit(session, attachment.targetCardInstanceId);
    const equipment = requireCollectionEquipment(session, attachment.equipmentCardInstanceId);
    if (usedEquipmentIds.has(equipment.instance.instanceId)) {
      throw new Error(`Equipment already equipped: ${equipment.instance.instanceId}`);
    }
    usedEquipmentIds.add(equipment.instance.instanceId);

    const group = equipmentByTarget.get(target.instance.instanceId);
    if (group) {
      group.push(equipment);
    } else {
      equipmentByTarget.set(target.instance.instanceId, [equipment]);
    }
  }

  equipmentByTarget.forEach((equipmentCards, targetCardInstanceId) => {
    const target = requireDeckUnit(session, targetCardInstanceId);
    const usedSlot = equipmentCards.reduce(
      (total, equipment) => total + readSlotUsage(equipment),
      0,
    );
    const capacity = readSlotCapacity(target);
    if (usedSlot > capacity) {
      throw new Error(
        `Equipment slot limit exceeded for ${target.instance.instanceId}: ${usedSlot}/${capacity}`,
      );
    }
    assertNoDuplicateEquipmentAbilities(target, equipmentCards);
  });

  return equipmentByTarget;
}

function listEquippedCardsForTarget(
  session: GameSession,
  targetCardInstanceId: string,
): RuntimeCardInstance[] {
  return session.equipment.equipped
    .filter((attachment) => attachment.targetCardInstanceId === targetCardInstanceId)
    .map((attachment) => requireCollectionEquipment(session, attachment.equipmentCardInstanceId));
}

function assertEquipmentIsNotAlreadyEquipped(
  equipment: EquipmentState,
  equipmentCardInstanceId: string,
): void {
  if (
    equipment.equipped.some(
      (attachment) => attachment.equipmentCardInstanceId === equipmentCardInstanceId,
    )
  ) {
    throw new Error(`Equipment already equipped: ${equipmentCardInstanceId}`);
  }
}

function requireDeckUnit(session: GameSession, cardInstanceId: string): RuntimeCardInstance {
  const card = session.deck.cards.find(
    (candidate) => candidate.instance.instanceId === cardInstanceId,
  );
  if (!card) {
    throw new Error(`Deck UNIT not found: ${cardInstanceId}`);
  }
  assertDeckCard(card);
  assertCardType(card, 'UNIT', 'Deck card');

  return card;
}

function requireCollectionEquipment(
  session: GameSession,
  cardInstanceId: string,
): RuntimeCardInstance {
  const card = session.collection.cards.find(
    (candidate) => candidate.instance.instanceId === cardInstanceId,
  );
  if (!card) {
    throw new Error(`Collection equipment not found: ${cardInstanceId}`);
  }
  assertCollectionCard(card);
  assertCardType(card, 'EQUIPMENT', 'Collection card');

  return card;
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

function cloneGameSession(
  session: GameSession,
  overrides: {
    equipment?: EquipmentState;
  } = {},
): GameSession {
  return {
    ...session,
    deck: {
      id: session.deck.id,
      leader: cloneRuntimeCard(session.deck.leader, 'LEADER'),
      cards: session.deck.cards.map((card) => cloneRuntimeCard(card, 'DECK')),
    },
    collection: {
      cards: session.collection.cards.map((card) => cloneRuntimeCard(card, 'COLLECTION')),
    },
    equipment: overrides.equipment ?? {
      equipped: session.equipment.equipped.map(cloneEquipmentAttachment),
    },
    stageProgress: structuredClone(session.stageProgress),
  };
}

function cloneRuntimeCard(card: RuntimeCardInstance, zone: CardInstanceZone): RuntimeCardInstance {
  return {
    instance: {
      ...structuredClone(card.instance),
      zone,
    },
    definition: card.definition,
  };
}

function cloneEquipmentAttachment(attachment: EquipmentAttachment): EquipmentAttachment {
  return {
    targetCardInstanceId: attachment.targetCardInstanceId,
    equipmentCardInstanceId: attachment.equipmentCardInstanceId,
  };
}

function cloneAbilities(abilities: readonly CardAbility[]): CardAbility[] {
  return abilities.map((ability) => structuredClone(ability));
}

function readSlotCapacity(card: RuntimeCardInstance): number {
  return Math.max(0, card.instance.slot ?? card.definition.slot ?? 0);
}

function readSlotUsage(card: RuntimeCardInstance): number {
  return Math.max(0, card.instance.slot ?? card.definition.slot ?? 0);
}

function addCardNumber(left: number | undefined, right: number | undefined): number {
  return Math.max(0, (left ?? 0) + (right ?? 0));
}
