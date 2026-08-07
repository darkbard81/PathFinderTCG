import { describe, expect, it } from 'vitest';
import { requireCardDefinition } from './card-catalog';
import {
  BATTLE_PARTICIPATION_EXP,
  applyBattleParticipationExpToSession,
  applyExpToRuntimeCard,
  calculateCardLevelFromExp,
  calculateMaterialExp,
  consumeCollectionMaterialsForDeckGrowth,
} from './card-growth';
import { createCardInstanceFromDefinition } from './deck-instancing';
import { createInitialSaveState } from './create-initial-save';
import { createGameSession, createSaveSlotStateFromGameSession, type GameSession } from './session';

describe('card growth', () => {
  it('calculates card level from cumulative exp with the schema level cap', () => {
    expect(calculateCardLevelFromExp(0)).toBe(1);
    expect(calculateCardLevelFromExp(99)).toBe(1);
    expect(calculateCardLevelFromExp(100)).toBe(2);
    expect(calculateCardLevelFromExp(499)).toBe(3);
    expect(calculateCardLevelFromExp(500)).toBe(4);
    expect(calculateCardLevelFromExp(8000)).toBe(9);
    expect(calculateCardLevelFromExp(20000)).toBe(9);
  });

  it('applies newly reached level growth to the saved card instance only', async () => {
    const session = await createSession();
    const card = session.deck.cards[0]!;
    const originalHp = card.instance.hp ?? 0;
    const originalAttack = card.instance.attack ?? 0;

    const grown = applyExpToRuntimeCard(card, 500);

    expect(grown.card.instance.exp).toBe(500);
    expect(grown.card.instance.level).toBe(4);
    expect(grown.card.instance.hp).toBe(originalHp + 2);
    expect(grown.card.instance.attack).toBe(originalAttack + 2);
    expect(grown.result.appliedGrowth).toEqual([
      { level: 2, stat: 'hp', value: 1 },
      { level: 3, stat: 'hp', value: 1 },
      { level: 3, stat: 'attack', value: 1 },
      { level: 4, stat: 'attack', value: 1 },
    ]);
    expect(card.instance.exp).toBe(0);
    expect(card.instance.level).toBe(1);
    expect(card.instance.hp).toBe(originalHp);
    expect(card.instance.attack).toBe(originalAttack);
  });

  it('grants battle participation exp to matching leader and deck cards', async () => {
    const session = await createSession();
    const targetIds = [
      session.deck.leader.instance.instanceId,
      session.deck.cards[0]!.instance.instanceId,
      session.deck.cards[1]!.instance.instanceId,
    ];

    const result = applyBattleParticipationExpToSession(session, targetIds);

    expect(result.entries).toHaveLength(3);
    expect(result.entries.every((entry) => entry.gainedExp === BATTLE_PARTICIPATION_EXP)).toBe(
      true,
    );
    expect(result.session.deck.leader.instance.exp).toBe(BATTLE_PARTICIPATION_EXP);
    expect(result.session.deck.leader.instance.level).toBe(2);
    expect(result.session.deck.cards[0]!.instance.exp).toBe(BATTLE_PARTICIPATION_EXP);
    expect(result.session.deck.cards[1]!.instance.exp).toBe(BATTLE_PARTICIPATION_EXP);
    expect(result.session.deck.cards[2]!.instance.exp).toBe(0);
    expect(session.deck.leader.instance.exp).toBe(0);
    expect(session.deck.cards[0]!.instance.exp).toBe(0);
  });

  it('calculates material exp with same-card bonus', async () => {
    const session = await createSessionWithCollectionCards([
      ['unit_elf_guardian_001', 'collection-material-same'],
      ['unit_elf_archer_001', 'collection-material-other'],
    ]);
    const target = session.deck.cards.find(
      (card) => card.definition.id === 'unit_elf_guardian_001',
    )!;
    const sameMaterial = session.collection.cards.find(
      (card) => card.definition.id === target.definition.id,
    )!;
    const otherMaterial = session.collection.cards.find(
      (card) => card.definition.id !== target.definition.id,
    )!;

    expect(calculateMaterialExp(target, sameMaterial)).toBe(100);
    expect(calculateMaterialExp(target, otherMaterial)).toBe(10);
  });

  it('grows a current deck target by consuming collection materials and persists it', async () => {
    const session = await createSessionWithCollectionCards([
      ['unit_elf_guardian_001', 'collection-material-same'],
      ['unit_elf_archer_001', 'collection-material-other'],
    ]);
    const target = session.deck.cards.find(
      (card) => card.definition.id === 'unit_elf_guardian_001',
    )!;
    const sameMaterial = session.collection.cards.find(
      (card) => card.definition.id === target.definition.id,
    )!;
    const otherMaterial = session.collection.cards.find(
      (card) => card.definition.id !== target.definition.id,
    )!;

    const result = consumeCollectionMaterialsForDeckGrowth(session, {
      targetDeckCardInstanceId: target.instance.instanceId,
      materialCollectionCardInstanceIds: [
        sameMaterial.instance.instanceId,
        otherMaterial.instance.instanceId,
      ],
    });
    const savedState = createSaveSlotStateFromGameSession(result.session, {
      now: new Date('2024-01-02T00:00:00.000Z'),
    });
    const reloadedSession = createGameSession(savedState);
    const reloadedTarget = reloadedSession.deck.cards.find(
      (card) => card.instance.instanceId === target.instance.instanceId,
    );

    expect(result.totalMaterialExp).toBe(110);
    expect(result.nextExp).toBe(110);
    expect(result.nextLevel).toBe(2);
    expect(result.appliedGrowth).toEqual([{ level: 2, stat: 'hp', value: 1 }]);
    expect(result.session.deck.cards.map((card) => card.instance.instanceId)).toContain(
      target.instance.instanceId,
    );
    expect(result.session.collection.cards.map((card) => card.instance.instanceId)).not.toContain(
      sameMaterial.instance.instanceId,
    );
    expect(result.session.collection.cards.map((card) => card.instance.instanceId)).not.toContain(
      otherMaterial.instance.instanceId,
    );
    expect(reloadedTarget?.instance.exp).toBe(110);
    expect(reloadedTarget?.instance.level).toBe(2);
    expect(reloadedTarget?.instance.hp).toBe((target.instance.hp ?? 0) + 1);
  });

  it('rejects invalid material growth requests', async () => {
    const session = await createSessionWithCollectionCards([
      ['unit_elf_guardian_001', 'collection-material'],
    ]);
    const target = session.deck.cards[0]!;
    const material = session.collection.cards[0]!;

    expect(() =>
      consumeCollectionMaterialsForDeckGrowth(session, {
        targetDeckCardInstanceId: target.instance.instanceId,
        materialCollectionCardInstanceIds: [],
      }),
    ).toThrow('At least one material card is required');
    expect(() =>
      consumeCollectionMaterialsForDeckGrowth(session, {
        targetDeckCardInstanceId: target.instance.instanceId,
        materialCollectionCardInstanceIds: [
          material.instance.instanceId,
          material.instance.instanceId,
        ],
      }),
    ).toThrow('Material cards must be unique');
    expect(() =>
      consumeCollectionMaterialsForDeckGrowth(session, {
        targetDeckCardInstanceId: 'missing-target',
        materialCollectionCardInstanceIds: [material.instance.instanceId],
      }),
    ).toThrow('Deck growth target not found: missing-target');
    expect(() =>
      consumeCollectionMaterialsForDeckGrowth(session, {
        targetDeckCardInstanceId: target.instance.instanceId,
        materialCollectionCardInstanceIds: ['missing-material'],
      }),
    ).toThrow('Collection material card not found: missing-material');
  });
});

async function createSession(): Promise<GameSession> {
  return createGameSession(await createInitialSaveState({ slotId: 1 }));
}

async function createSessionWithCollectionCards(
  cards: Array<[definitionId: string, instanceId: string]>,
): Promise<GameSession> {
  const state = await createInitialSaveState({ slotId: 1 });
  state.collection.cards = cards.map(([definitionId, instanceId]) =>
    createCardInstanceFromDefinition({
      definition: requireCardDefinition(definitionId),
      owner: 'PLAYER',
      zone: 'COLLECTION',
      createId: () => instanceId,
    }),
  );
  state.equipment = {
    equipped: [],
  };

  return createGameSession(state);
}
