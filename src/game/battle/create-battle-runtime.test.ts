import { describe, expect, it } from 'vitest';
import { requireCardDefinition } from '../save/card-catalog';
import { createInitialSaveState } from '../save/create-initial-save';
import { createCardInstanceFromDefinition } from '../save/deck-instancing';
import {
  changeDeckLeaderWithCollectionLeader,
  moveCollectionUnitToDeck,
} from '../save/deck-building';
import { equipCollectionEquipmentToDeckUnit } from '../save/equipment';
import { createGameSession } from '../save/session';
import { requireStageDefinition } from '../stage/stage-definitions';
import { createInitialBattleRuntime } from './create-battle-runtime';
import { ENEMY_INITIAL_LEADER_SLOT, INITIAL_HAND_SIZE, PLAYER_INITIAL_LEADER_SLOT } from './types';

const TEST_STAGE_DEFINITION = requireStageDefinition('test-stage-dark');
const LEVEL01_STAGE_DEFINITION = requireStageDefinition('level01');

describe('createInitialBattleRuntime', () => {
  it('places both leaders on their center back battlefield slots', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const runtime = createInitialBattleRuntime(session, TEST_STAGE_DEFINITION);

    expect(runtime.player.leader.card.instance.instanceId).toBe(
      session.deck.leader.instance.instanceId,
    );
    expect(runtime.player.leader.zone).toBe('BATTLEFIELD');
    expect(runtime.player.leader.battlefieldSlot).toBe(PLAYER_INITIAL_LEADER_SLOT);
    expect(runtime.enemy.leader.card.definition.id).toBe('leader_dark_empress');
    expect(runtime.enemy.leader.card.instance.owner).toBe('ENEMY');
    expect(runtime.enemy.leader.zone).toBe('BATTLEFIELD');
    expect(runtime.enemy.leader.battlefieldSlot).toBe(ENEMY_INITIAL_LEADER_SLOT);
    expect(runtime.battlefield).toEqual([runtime.enemy.leader, runtime.player.leader]);
  });

  it('does not use the save-only LEADER zone in battle runtime state', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const runtime = createInitialBattleRuntime(session, TEST_STAGE_DEFINITION);
    const zones = [
      runtime.player.leader.zone,
      runtime.enemy.leader.zone,
      ...runtime.player.deck.map((card) => card.zone),
      ...runtime.enemy.deck.map((card) => card.zone),
      ...runtime.player.hand.map((card) => card.zone),
      ...runtime.enemy.hand.map((card) => card.zone),
      ...runtime.battlefield.map((card) => card.zone),
      ...runtime.drop.map((card) => card.zone),
      ...runtime.exile.map((card) => card.zone),
      ...runtime.player.drop.map((card) => card.zone),
      ...runtime.enemy.drop.map((card) => card.zone),
      ...runtime.player.exile.map((card) => card.zone),
      ...runtime.enemy.exile.map((card) => card.zone),
    ];

    expect(zones).not.toContain('LEADER');
  });

  it('draws the initial hand from a temporary shuffle without changing the saved deck order', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const savedOrder = session.deck.cards.map((card) => card.instance.instanceId);
    const runtime = createInitialBattleRuntime(session, TEST_STAGE_DEFINITION, () => 0);
    const runtimeOrder = [...runtime.player.hand, ...runtime.player.deck].map(
      (card) => card.card.instance.instanceId,
    );

    expect(runtime.player.hand).toHaveLength(INITIAL_HAND_SIZE);
    expect(runtime.player.deck).toHaveLength(session.deck.cards.length - INITIAL_HAND_SIZE);
    expect(runtimeOrder).not.toEqual(savedOrder);
    expect([...runtimeOrder].sort()).toEqual([...savedOrder].sort());
    expect(session.deck.cards.map((card) => card.instance.instanceId)).toEqual(savedOrder);
  });

  it('temporarily shuffles the enemy deck before creating its initial hand', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const shuffledRuntime = createInitialBattleRuntime(session, TEST_STAGE_DEFINITION, () => 0);
    const orderedRuntime = createInitialBattleRuntime(
      session,
      TEST_STAGE_DEFINITION,
      () => 0.999_999,
    );
    const readEnemyOrder = (runtime: ReturnType<typeof createInitialBattleRuntime>) =>
      [...runtime.enemy.hand, ...runtime.enemy.deck].map((card) => card.card.definition.id);
    const shuffledOrder = readEnemyOrder(shuffledRuntime);
    const orderedOrder = readEnemyOrder(orderedRuntime);

    expect(shuffledOrder).not.toEqual(orderedOrder);
    expect([...shuffledOrder].sort()).toEqual([...orderedOrder].sort());
  });

  it('draws a collection card moved into the saved deck for the next battle', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    state.collection.cards.push(
      createCardInstanceFromDefinition({
        definition: requireCardDefinition('unit_elf_assassin_001'),
        owner: 'PLAYER',
        zone: 'COLLECTION',
        createId: () => 'collection-card-1',
      }),
    );
    const session = createGameSession(state);
    const collectionCard = session.collection.cards.find(
      (card) => card.definition.id === 'unit_elf_assassin_001',
    )!;
    const nextSession = moveCollectionUnitToDeck(session, {
      collectionCardInstanceId: collectionCard.instance.instanceId,
    });

    const runtime = createInitialBattleRuntime(nextSession, TEST_STAGE_DEFINITION);

    const playerRuntimeCards = [...runtime.player.hand, ...runtime.player.deck];

    expect(playerRuntimeCards.map((card) => card.card.instance.instanceId)).toContain(
      collectionCard.instance.instanceId,
    );
    expect(
      playerRuntimeCards.find(
        (card) => card.card.instance.instanceId === collectionCard.instance.instanceId,
      )?.card.definition.id,
    ).toBe(collectionCard.definition.id);
  });

  it('places a changed collection leader on the battlefield for the next battle', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    state.collection.cards.push(
      createCardInstanceFromDefinition({
        definition: requireCardDefinition('leader_dark_empress'),
        owner: 'PLAYER',
        zone: 'COLLECTION',
        createId: () => 'leader-reward-1',
      }),
    );
    const session = createGameSession(state);
    const nextSession = changeDeckLeaderWithCollectionLeader(session, {
      collectionLeaderInstanceId: 'leader-reward-1',
    });

    const runtime = createInitialBattleRuntime(nextSession, TEST_STAGE_DEFINITION);

    expect(runtime.player.leader.card.instance.instanceId).toBe('leader-reward-1');
    expect(runtime.player.leader.card.definition.id).toBe('leader_dark_empress');
    expect(runtime.player.leader.zone).toBe('BATTLEFIELD');
    expect(runtime.player.leader.battlefieldSlot).toBe(PLAYER_INITIAL_LEADER_SLOT);
  });

  it('allows battle runtime creation with no non-leader deck cards', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession({
      ...state,
      deck: {
        ...state.deck,
        cards: [],
      },
    });

    const runtime = createInitialBattleRuntime(session, TEST_STAGE_DEFINITION);

    expect(runtime.player.hand).toHaveLength(0);
    expect(runtime.player.deck).toHaveLength(0);
    expect(runtime.player.leader.card.instance.instanceId).toBe(
      session.deck.leader.instance.instanceId,
    );
  });

  it('keeps battle stat changes isolated from the source game session', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const originalLeaderStats = {
      hp: session.deck.leader.instance.hp,
      attack: session.deck.leader.instance.attack,
      cost: session.deck.leader.instance.cost,
      dominance: session.deck.leader.instance.dominance,
    };
    const originalHandCardStats = {
      hp: session.deck.cards[0]!.instance.hp,
      attack: session.deck.cards[0]!.instance.attack,
      cost: session.deck.cards[0]!.instance.cost,
      dominance: session.deck.cards[0]!.instance.dominance,
    };
    const runtime = createInitialBattleRuntime(session, TEST_STAGE_DEFINITION);

    expect(runtime.player.leader.card).not.toBe(session.deck.leader);
    expect(runtime.player.leader.card.instance).not.toBe(session.deck.leader.instance);
    expect(runtime.player.hand[0]!.card).not.toBe(session.deck.cards[0]);
    expect(runtime.player.hand[0]!.card.instance).not.toBe(session.deck.cards[0]!.instance);

    runtime.player.leader.card.instance.hp = 1;
    runtime.player.leader.card.instance.attack = 1;
    runtime.player.leader.card.instance.cost = 0;
    runtime.player.leader.card.instance.dominance = 0;
    runtime.player.hand[0]!.card.instance.hp = 1;
    runtime.player.hand[0]!.card.instance.attack = 1;
    runtime.player.hand[0]!.card.instance.cost = 0;
    runtime.player.hand[0]!.card.instance.dominance = 0;

    expect({
      hp: session.deck.leader.instance.hp,
      attack: session.deck.leader.instance.attack,
      cost: session.deck.leader.instance.cost,
      dominance: session.deck.leader.instance.dominance,
    }).toEqual(originalLeaderStats);
    expect({
      hp: session.deck.cards[0]!.instance.hp,
      attack: session.deck.cards[0]!.instance.attack,
      cost: session.deck.cards[0]!.instance.cost,
      dominance: session.deck.cards[0]!.instance.dominance,
    }).toEqual(originalHandCardStats);
  });

  it('applies equipped equipment bonuses to player battle runtime cards', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const target = session.deck.cards.find(
      (card) => card.definition.id === 'unit_elf_guardian_001',
    )!;
    const equipment = session.collection.cards.find(
      (card) => card.definition.id === 'equipment_rapier_001',
    )!;
    const equippedSession = equipCollectionEquipmentToDeckUnit(session, {
      targetDeckCardInstanceId: target.instance.instanceId,
      equipmentCardInstanceId: equipment.instance.instanceId,
    });

    const runtime = createInitialBattleRuntime(equippedSession, TEST_STAGE_DEFINITION);
    const runtimeTarget = [...runtime.player.hand, ...runtime.player.deck].find(
      (card) => card.card.instance.instanceId === target.instance.instanceId,
    );

    expect(runtimeTarget?.card.instance.attack).toBe((target.instance.attack ?? 0) + 1);
    expect(runtimeTarget?.card.instance.abilities.map((ability) => ability.id)).toContain(
      'rapier_thrust',
    );
    expect(runtimeTarget?.card.definition.attack).toBe(target.definition.attack);
    expect(target.instance.attack).toBe(state.deck.cards[0]!.attack);
  });

  it('creates enemy hand and deck from deck_dark.json as runtime card instances', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const runtime = createInitialBattleRuntime(session, TEST_STAGE_DEFINITION);

    expect(runtime.enemy.hand).toHaveLength(INITIAL_HAND_SIZE);
    expect(runtime.enemy.deck).toHaveLength(24);
    expect(runtime.enemy.hand.every((card) => card.card.instance.owner === 'ENEMY')).toBe(true);
    expect(runtime.enemy.deck.every((card) => card.card.instance.owner === 'ENEMY')).toBe(true);
    expect(
      runtime.enemy.hand.every((card) => card.card.definition.id.startsWith('unit_dark_')),
    ).toBe(true);
  });

  it('creates the Level 01 enemy runtime from deck_level01.json', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const runtime = createInitialBattleRuntime(session, LEVEL01_STAGE_DEFINITION);

    expect(runtime.enemy.leader.card.definition.id).toBe('oaxKg1yQDmK2PWXG');
    expect(runtime.enemy.hand).toHaveLength(INITIAL_HAND_SIZE);
    expect(runtime.enemy.deck).toHaveLength(24);
    expect(
      [...runtime.enemy.hand, ...runtime.enemy.deck].every((card) =>
        card.card.definition.traits.some((trait) => trait.key === 'sourceLevel'),
      ),
    ).toBe(true);
  });

  it('keeps battlefield slot data only on battlefield cards', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const runtime = createInitialBattleRuntime(session, TEST_STAGE_DEFINITION);

    expect(runtime.battlefield.every((card) => card.battlefieldSlot !== null)).toBe(true);
    expect(runtime.player.deck.every((card) => card.battlefieldSlot === null)).toBe(true);
    expect(runtime.enemy.deck.every((card) => card.battlefieldSlot === null)).toBe(true);
    expect(runtime.player.hand.every((card) => card.battlefieldSlot === null)).toBe(true);
    expect(runtime.enemy.hand.every((card) => card.battlefieldSlot === null)).toBe(true);
    expect(runtime.drop.every((card) => card.battlefieldSlot === null)).toBe(true);
    expect(runtime.exile.every((card) => card.battlefieldSlot === null)).toBe(true);
  });

  it('initializes empty drop and exile piles for both sides and shared runtime state', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const runtime = createInitialBattleRuntime(session, TEST_STAGE_DEFINITION);

    expect(runtime.drop).toHaveLength(0);
    expect(runtime.exile).toHaveLength(0);
    expect(runtime.player.drop).toHaveLength(0);
    expect(runtime.player.exile).toHaveLength(0);
    expect(runtime.enemy.drop).toHaveLength(0);
    expect(runtime.enemy.exile).toHaveLength(0);
  });

  it('initializes turn state and per-card action flags', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const runtime = createInitialBattleRuntime(session, TEST_STAGE_DEFINITION);
    const cards = [
      runtime.player.leader,
      runtime.enemy.leader,
      ...runtime.player.hand,
      ...runtime.player.deck,
      ...runtime.enemy.hand,
      ...runtime.enemy.deck,
    ];

    expect(runtime.currentSide).toBe('player');
    expect(runtime.turnNumber).toBe(1);
    expect(runtime.phase).toBe('MAIN');
    expect(runtime.outcome).toBeNull();
    expect(cards.every((card) => !card.hasMovedThisTurn)).toBe(true);
    expect(cards.every((card) => !card.hasAttackedThisTurn)).toBe(true);
    expect(cards.every((card) => !card.hasUsedActiveSkillThisTurn)).toBe(true);
    expect(runtime.player.leader.enteredBattlefieldTurnNumber).toBe(1);
    expect(runtime.enemy.leader.enteredBattlefieldTurnNumber).toBe(1);
    expect(
      [
        ...runtime.player.hand,
        ...runtime.player.deck,
        ...runtime.enemy.hand,
        ...runtime.enemy.deck,
      ].every((card) => card.enteredBattlefieldTurnNumber === null),
    ).toBe(true);
  });

  it('initializes empty ability effect state on every battle runtime card', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const runtime = createInitialBattleRuntime(session, TEST_STAGE_DEFINITION);
    const cards = [
      runtime.player.leader,
      runtime.enemy.leader,
      ...runtime.player.hand,
      ...runtime.player.deck,
      ...runtime.enemy.hand,
      ...runtime.enemy.deck,
    ];

    expect(cards.every((card) => Array.isArray(card.abilityEffects))).toBe(true);
    expect(cards.every((card) => card.abilityEffects.length === 0)).toBe(true);
  });
});
