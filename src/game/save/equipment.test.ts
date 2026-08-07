import { describe, expect, it } from 'vitest';
import type { CardDefinition } from './card-catalog';
import { createInitialSaveState } from './create-initial-save';
import { createCardInstanceFromDefinition } from './deck-instancing';
import {
  createRuntimeDeckWithEquipment,
  equipCollectionEquipmentToDeckUnit,
  unequipEquipmentFromDeckUnit,
} from './equipment';
import { createGameSession, createSaveSlotStateFromGameSession, type GameSession } from './session';

describe('equipment state', () => {
  it('equips and unequips collection EQUIPMENT on a deck UNIT', async () => {
    const session = await createEquipmentSession();
    const target = requireDeckCard(session, 'unit_elf_guardian_001');
    const equipment = requireCollectionCard(session, 'equipment_rapier_001');

    const equipped = equipCollectionEquipmentToDeckUnit(session, {
      targetDeckCardInstanceId: target.instance.instanceId,
      equipmentCardInstanceId: equipment.instance.instanceId,
    });

    expect(equipped.equipment.equipped).toEqual([
      {
        targetCardInstanceId: target.instance.instanceId,
        equipmentCardInstanceId: equipment.instance.instanceId,
      },
    ]);
    expect(equipped.collection.cards.map((card) => card.instance.instanceId)).toContain(
      equipment.instance.instanceId,
    );

    const unequipped = unequipEquipmentFromDeckUnit(equipped, {
      targetDeckCardInstanceId: target.instance.instanceId,
      equipmentCardInstanceId: equipment.instance.instanceId,
    });

    expect(unequipped.equipment.equipped).toEqual([]);
  });

  it('persists equipment attachments through save reload', async () => {
    const session = await createEquipmentSession();
    const target = requireDeckCard(session, 'unit_elf_guardian_001');
    const equipment = requireCollectionCard(session, 'equipment_rapier_001');
    const equipped = equipCollectionEquipmentToDeckUnit(session, {
      targetDeckCardInstanceId: target.instance.instanceId,
      equipmentCardInstanceId: equipment.instance.instanceId,
    });

    const savedState = createSaveSlotStateFromGameSession(equipped, {
      now: new Date('2024-01-02T00:00:00.000Z'),
    });
    const reloaded = createGameSession(savedState);

    expect(reloaded.equipment.equipped).toEqual(equipped.equipment.equipped);
    expect(reloaded.collection.cards.map((card) => card.definition.id)).toContain(
      'equipment_rapier_001',
    );
  });

  it('rejects slot limit overflow and duplicate ability IDs', async () => {
    const session = await createEquipmentSession();
    const slotlessTarget = requireDeckCard(session, 'unit_elf_scout_001');
    const rapier = requireCollectionCard(session, 'equipment_rapier_001');

    expect(() =>
      equipCollectionEquipmentToDeckUnit(session, {
        targetDeckCardInstanceId: slotlessTarget.instance.instanceId,
        equipmentCardInstanceId: rapier.instance.instanceId,
      }),
    ).toThrow('Equipment slot limit exceeded');

    const duplicateAbilitySession = await createEquipmentSession({
      extraEquipment: createEquipmentDefinition({
        id: 'equipment_duplicate_guardian',
        abilities: [
          {
            id: 'guardian_stance',
            category: 'FRONT',
            name: '중복 수호 태세',
            text: '중복 능력 테스트 장비.',
          },
        ],
      }),
    });
    const target = requireDeckCard(duplicateAbilitySession, 'unit_elf_guardian_001');
    const duplicateEquipment = requireCollectionCard(
      duplicateAbilitySession,
      'equipment_duplicate_guardian',
    );

    expect(() =>
      equipCollectionEquipmentToDeckUnit(duplicateAbilitySession, {
        targetDeckCardInstanceId: target.instance.instanceId,
        equipmentCardInstanceId: duplicateEquipment.instance.instanceId,
      }),
    ).toThrow('Duplicate equipment ability: guardian_stance');
  });

  it('applies equipment stats and abilities only to battle runtime deck copies', async () => {
    const session = await createEquipmentSession();
    const target = requireDeckCard(session, 'unit_elf_guardian_001');
    const equipment = requireCollectionCard(session, 'equipment_rapier_001');
    const equipped = equipCollectionEquipmentToDeckUnit(session, {
      targetDeckCardInstanceId: target.instance.instanceId,
      equipmentCardInstanceId: equipment.instance.instanceId,
    });

    const runtimeDeck = createRuntimeDeckWithEquipment(equipped);
    const runtimeTarget = runtimeDeck.cards.find(
      (card) => card.instance.instanceId === target.instance.instanceId,
    );

    expect(runtimeTarget?.instance.attack).toBe((target.instance.attack ?? 0) + 1);
    expect(runtimeTarget?.instance.abilities.map((ability) => ability.id)).toContain(
      'rapier_thrust',
    );
    expect(runtimeTarget?.definition.attack).toBe(target.definition.attack);
    expect(runtimeTarget?.definition.abilities.map((ability) => ability.id)).toContain(
      'rapier_thrust',
    );
    expect(equipped.deck.cards[0]!.instance.attack).toBe(target.instance.attack);
    expect(equipped.deck.cards[0]!.instance.abilities.map((ability) => ability.id)).not.toContain(
      'rapier_thrust',
    );
  });
});

async function createEquipmentSession(options: { extraEquipment?: CardDefinition } = {}) {
  const state = await createInitialSaveState({ slotId: 1 });
  if (options.extraEquipment) {
    state.collection.cards.push(
      createCardInstanceFromDefinition({
        definition: options.extraEquipment,
        owner: 'PLAYER',
        zone: 'COLLECTION',
        createId: () => options.extraEquipment!.id,
      }),
    );
  }

  return createGameSession(state);
}

function requireDeckCard(session: GameSession, definitionId: string) {
  const card = session.deck.cards.find((candidate) => candidate.definition.id === definitionId);
  if (!card) {
    throw new Error(`Missing deck card: ${definitionId}`);
  }

  return card;
}

function requireCollectionCard(session: GameSession, definitionId: string) {
  const card = session.collection.cards.find(
    (candidate) => candidate.definition.id === definitionId,
  );
  if (!card) {
    throw new Error(`Missing collection card: ${definitionId}`);
  }

  return card;
}

function createEquipmentDefinition(
  overrides: Partial<CardDefinition> & Pick<CardDefinition, 'id'>,
): CardDefinition {
  const { id, ...definitionOverrides } = overrides;
  return {
    id,
    name: '테스트 장비',
    rarity: 'C',
    type: 'EQUIPMENT',
    traits: [{ key: 'role', text: '테스트' }],
    slot: 0,
    cost: 0,
    dominance: 0,
    hp: 0,
    attack: 0,
    level: 1,
    exp: 0,
    abilities: [],
    description: '장비 테스트 정의.',
    note: '테스트용 장비.',
    ...definitionOverrides,
  };
}
