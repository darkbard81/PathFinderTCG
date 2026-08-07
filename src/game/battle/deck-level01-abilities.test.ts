import deckLevel01Data from '../../../cards/deck_level01.json';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyActiveSkillAction,
  applyAttackAction,
  applyMoveAction,
  applyPlaceAction,
  applyTurnEnd,
  getEffectiveAttack,
  getEffectiveHp,
  listActiveSkillActions,
  listAttackActions,
  listMoveActions,
  listPlaceActions,
} from './battle-engine';
import { requireCardDefinition, type CardDefinitionFile } from '../save/card-catalog';
import { ALL_CARD_DEFINITIONS } from '../save/auto-card-catalog';
import type { CardInstance } from '../save/types';
import type {
  BattleCardRuntimeState,
  BattleParticipantRuntimeState,
  BattleRuntimeState,
  BattleRuntimeZone,
  BattleSide,
  BattleSlotId,
} from './types';

const LEVEL01_DECK = deckLevel01Data as unknown as CardDefinitionFile;
const LEVEL01_DEFINITIONS = new Map(
  LEVEL01_DECK.cards.map((definition) => [definition.id, definition]),
);
const LEADER_ID = 'oaxKg1yQDmK2PWXG';
let nextInstanceNumber = 1;

describe('deck_level01 abilities', () => {
  beforeEach(() => {
    nextInstanceNumber = 1;
  });

  it('registers every deck_*.json definition in the shared card catalog', () => {
    expect(
      ALL_CARD_DEFINITIONS.map((card) => requireCardDefinition(card.id, ALL_CARD_DEFINITIONS)),
    ).toHaveLength(ALL_CARD_DEFINITIONS.length);
  });

  it('reduces damage received by Animated Broom by 1', () => {
    const runtime = createRuntime();
    const broom = addBattlefieldCard(runtime, 'ybkelAOtSIA06fnj', 'player', 'player:FC');
    const wolf = addBattlefieldCard(runtime, 'BN5Lb6IsQ9Wyu3rL', 'enemy', 'enemy:FC');
    runtime.currentSide = 'enemy';
    const broomHpBefore = broom.card.instance.hp ?? 0;
    const action = requireAttackAction(runtime, wolf, broom);

    applyAttackAction(runtime, action);

    expect(action.attack).toBe(3);
    expect(broom.card.instance.hp).toBe(broomHpBefore - 2);
  });

  it('keeps Eagle move bonus until its next attack and consumes it after damage resolves', () => {
    const runtime = createRuntime();
    const eagle = addBattlefieldCard(runtime, 'WBPEvEqIGvxeQKlp', 'player', 'player:FC');
    const moveAction = listMoveActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === eagle.card.instance.instanceId &&
        candidate.toSlotId === 'player:FR',
    );
    if (!moveAction) {
      throw new Error('Expected a legal Eagle move action');
    }

    applyMoveAction(runtime, moveAction);
    expect(getEffectiveAttack(runtime, eagle)).toBe((eagle.card.instance.attack ?? 0) + 1);

    applyTurnEnd(runtime);
    applyTurnEnd(runtime);
    expect(getEffectiveAttack(runtime, eagle)).toBe((eagle.card.instance.attack ?? 0) + 1);

    const secondMoveAction = listMoveActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === eagle.card.instance.instanceId &&
        candidate.toSlotId === 'player:FC',
    );
    if (!secondMoveAction) {
      throw new Error('Expected a second legal Eagle move action');
    }
    applyMoveAction(runtime, secondMoveAction);
    expect(getEffectiveAttack(runtime, eagle)).toBe((eagle.card.instance.attack ?? 0) + 1);

    const action = requireAttackAction(runtime, eagle, runtime.enemy.leader);
    applyAttackAction(runtime, action);

    expect(action.attack).toBe((eagle.card.instance.attack ?? 0) + 1);
    expect(getEffectiveAttack(runtime, eagle)).toBe(eagle.card.instance.attack);
  });

  it('weakens the directly opposing enemy when Flash Beetle is summoned until that enemy turn ends', () => {
    const runtime = createRuntime();
    const sharpshooter = addBattlefieldCard(runtime, 'Ytp0kRaG8iexmPfN', 'enemy', 'enemy:FC');
    const beetle = addHandCard(runtime, 'E2XL2egIA3QaSDBM', 'player');
    const baseAttack = sharpshooter.card.instance.attack ?? 0;
    const placeAction = listPlaceActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === beetle.card.instance.instanceId &&
        candidate.toSlotId === 'player:FC',
    );
    if (!placeAction) {
      throw new Error('Expected a legal Flash Beetle place action');
    }

    applyPlaceAction(runtime, placeAction);

    expect(getEffectiveAttack(runtime, sharpshooter)).toBe(baseAttack - 1);
    applyTurnEnd(runtime);
    expect(getEffectiveAttack(runtime, sharpshooter)).toBe(baseAttack - 1);
    applyTurnEnd(runtime);
    expect(getEffectiveAttack(runtime, sharpshooter)).toBe(baseAttack);
  });

  it('heals an allied battlefield card by 1 with Leaf Leshy active skill', () => {
    const runtime = createRuntime();
    const leshy = addBattlefieldCard(runtime, 'v1UK3IwCB8wCbL3L', 'player', 'player:FC');
    const ally = addBattlefieldCard(runtime, 'uzH85ifDz5GU525p', 'player', 'player:FR');
    ally.card.instance.hp = 1;
    const action = listActiveSkillActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === leshy.card.instance.instanceId &&
        candidate.targetInstanceId === ally.card.instance.instanceId,
    );
    if (!action) {
      throw new Error('Expected a legal Leaf Leshy active skill action');
    }

    applyActiveSkillAction(runtime, action);

    expect(action).toMatchObject({ effect: 'HEAL', value: 1 });
    expect(ally.card.instance.hp).toBe(2);
    expect(leshy.hasUsedActiveSkillThisTurn).toBe(true);
  });

  it('adds 1 attack damage when Hryngar Sharpshooter attacks a back-row target', () => {
    const runtime = createRuntime();
    const sharpshooter = addBattlefieldCard(runtime, 'Ytp0kRaG8iexmPfN', 'player', 'player:FC');
    const enemyLeaderHpBefore = runtime.enemy.leader.card.instance.hp ?? 0;
    const action = requireAttackAction(runtime, sharpshooter, runtime.enemy.leader);

    applyAttackAction(runtime, action);

    expect(action.attack).toBe((sharpshooter.card.instance.attack ?? 0) + 1);
    expect(runtime.enemy.leader.card.instance.hp).toBe(enemyLeaderHpBefore - action.attack);
  });

  it('heals the lowest-HP adjacent ally by 1 when Homunculus retreats', () => {
    const runtime = createRuntime();
    const homunculus = addBattlefieldCard(runtime, '9wNjq9BirBoxyJVH', 'player', 'player:FC');
    const ally = addBattlefieldCard(runtime, 'v1UK3IwCB8wCbL3L', 'player', 'player:FR');
    const wolf = addBattlefieldCard(runtime, 'BN5Lb6IsQ9Wyu3rL', 'enemy', 'enemy:FC');
    homunculus.card.instance.hp = 1;
    ally.card.instance.hp = 1;
    runtime.currentSide = 'enemy';
    const action = requireAttackAction(runtime, wolf, homunculus);

    applyAttackAction(runtime, action);

    expect(homunculus.zone).toBe('DROP');
    expect(ally.card.instance.hp).toBe(2);
  });

  it('applies Dwarf FRONT, Gnome BACK, and Wolf GLOBAL passives from their positions and traits', () => {
    const runtime = createRuntime();
    const dwarf = addBattlefieldCard(runtime, 'IjFlp5eVVTEg902W', 'player', 'player:FC');
    const gnome = addBattlefieldCard(runtime, '9XccneFB5DmMHig0', 'player', 'player:BR');
    const compsognathus = addBattlefieldCard(runtime, 'uzH85ifDz5GU525p', 'player', 'player:FR');
    const wolf = addBattlefieldCard(runtime, 'BN5Lb6IsQ9Wyu3rL', 'player', 'player:FL');

    expect(getEffectiveHp(runtime, dwarf)).toBe((dwarf.card.instance.hp ?? 0) + 1);
    expect(getEffectiveAttack(runtime, compsognathus)).toBe(
      (compsognathus.card.instance.attack ?? 0) + 2,
    );
    expect(getEffectiveAttack(runtime, wolf)).toBe((wolf.card.instance.attack ?? 0) + 1);
    expect(getEffectiveAttack(runtime, gnome)).toBe(gnome.card.instance.attack);

    dwarf.battlefieldSlot = 'player:BL';
    gnome.battlefieldSlot = 'player:FC';

    expect(getEffectiveHp(runtime, dwarf)).toBe(dwarf.card.instance.hp);
    expect(getEffectiveAttack(runtime, compsognathus)).toBe(
      (compsognathus.card.instance.attack ?? 0) + 1,
    );
  });
});

function createRuntime(): BattleRuntimeState {
  const playerLeader = createBattleCard(LEADER_ID, 'player', 'BATTLEFIELD', 'player:BC');
  const enemyLeader = createBattleCard(LEADER_ID, 'enemy', 'BATTLEFIELD', 'enemy:BC');
  const player = createParticipant('player', playerLeader);
  const enemy = createParticipant('enemy', enemyLeader);

  return {
    currentSide: 'player',
    turnNumber: 2,
    phase: 'MAIN',
    outcome: null,
    player,
    enemy,
    battlefield: [playerLeader, enemyLeader],
    drop: [],
    exile: [],
  };
}

function createParticipant(
  side: BattleSide,
  leader: BattleCardRuntimeState,
): BattleParticipantRuntimeState {
  return {
    side,
    leader,
    deck: [],
    hand: [],
    drop: [],
    exile: [],
  };
}

function createBattleCard(
  definitionId: string,
  side: BattleSide,
  zone: BattleRuntimeZone,
  battlefieldSlot: BattleSlotId | null,
): BattleCardRuntimeState {
  const definition = LEVEL01_DEFINITIONS.get(definitionId);
  if (!definition) {
    throw new Error(`Missing level01 definition: ${definitionId}`);
  }

  const instance: CardInstance = {
    ...structuredClone(definition),
    instanceId: `${side}-${definitionId}-${nextInstanceNumber++}`,
    owner: side === 'player' ? 'PLAYER' : 'ENEMY',
    zone: definition.type === 'LEADER' ? 'LEADER' : 'DECK',
  };

  return {
    card: { instance, definition },
    side,
    zone,
    battlefieldSlot,
    enteredBattlefieldTurnNumber: zone === 'BATTLEFIELD' ? 1 : null,
    handIndex: null,
    deckIndex: null,
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasUsedActiveSkillThisTurn: false,
    abilityEffects: [],
  };
}

function addBattlefieldCard(
  runtime: BattleRuntimeState,
  definitionId: string,
  side: BattleSide,
  slotId: BattleSlotId,
): BattleCardRuntimeState {
  const card = createBattleCard(definitionId, side, 'BATTLEFIELD', slotId);
  runtime.battlefield.push(card);
  return card;
}

function addHandCard(
  runtime: BattleRuntimeState,
  definitionId: string,
  side: BattleSide,
): BattleCardRuntimeState {
  const participant = side === 'player' ? runtime.player : runtime.enemy;
  const card = createBattleCard(definitionId, side, 'HAND', null);
  card.handIndex = participant.hand.length;
  participant.hand.push(card);
  return card;
}

function requireAttackAction(
  runtime: BattleRuntimeState,
  attacker: BattleCardRuntimeState,
  target: BattleCardRuntimeState,
): ReturnType<typeof listAttackActions>[number] {
  const action = listAttackActions(runtime, attacker.side).find(
    (candidate) =>
      candidate.attackerInstanceId === attacker.card.instance.instanceId &&
      candidate.targetInstanceId === target.card.instance.instanceId,
  );
  if (!action) {
    throw new Error(`Expected a legal attack from ${attacker.card.definition.id}`);
  }

  return action;
}
