import deckLevel01Data from '../../../cards/deck_level01.json';
import deckLevel02Data from '../../../cards/deck_level02.json';
import { beforeEach, describe, expect, it } from 'vitest';
import { requireCardDefinition, type CardDefinitionFile } from '../save/card-catalog';
import { ALL_CARD_DEFINITIONS } from '../save/auto-card-catalog';
import { hasMonsterCoreData, loadMonsterCoreData } from './__fixtures__/monster-core';
import type { CardInstance } from '../save/types';
import {
  applyActiveSkillAction,
  applyAttackAction,
  applyMoveAction,
  applyPlaceAction,
  getEffectiveAttack,
  listActiveSkillActions,
  listAttackActions,
  listMoveActions,
  listPlaceActions,
} from './battle-engine';
import type {
  BattleCardRuntimeState,
  BattleParticipantRuntimeState,
  BattleRuntimeState,
  BattleRuntimeZone,
  BattleSide,
  BattleSlotId,
} from './types';

const LEVEL01_DECK = deckLevel01Data as unknown as CardDefinitionFile;
const LEVEL02_DECK = deckLevel02Data as unknown as CardDefinitionFile;
const LEVEL02_DEFINITIONS = new Map(
  LEVEL02_DECK.cards.map((definition) => [definition.id, definition]),
);
const LEVEL02_LEADER_ID = 'PLZk6zY5iwccPTPS';
const ABILITY_CATEGORIES = [
  'SPECIAL',
  'MOVE',
  'SUMMON',
  'ACTION',
  'ATTACK',
  'RETREAT',
  'FRONT',
  'BACK',
  'GLOBAL',
] as const;
let nextInstanceNumber = 1;

/** PF2E 원본 자산은 git 추적 대상이 아니므로 없는 환경에서는 출처 검증을 건너뛴다. */
const itWithMonsterCore = it.skipIf(!hasMonsterCoreData);

describe('deck_level02 design and abilities', () => {
  beforeEach(() => {
    nextInstanceNumber = 1;
  });

  itWithMonsterCore(
    'uses unique PF2E level -1 through 2 cards with balanced categories and 20% combat growth',
    () => {
      const level01Ids = new Set(LEVEL01_DECK.cards.map((card) => card.id));
      const monsterLevels = new Map(
        loadMonsterCoreData().map((monster) => [monster._id, monster.details.level.value]),
      );
      const categories = LEVEL02_DECK.cards.flatMap((card) =>
        card.abilities.map((ability) => ability.category),
      );
      const level01Power = calculateUnitPower(LEVEL01_DECK);
      const level02Power = calculateUnitPower(LEVEL02_DECK);
      const level01DeckPower = calculateDeckPower(LEVEL01_DECK);
      const level02DeckPower = calculateDeckPower(LEVEL02_DECK);

      expect(LEVEL02_DECK.cards).toHaveLength(11);
      expect(LEVEL02_DECK.cards.filter((card) => card.type === 'LEADER')).toHaveLength(1);
      expect(LEVEL02_DECK.cards.filter((card) => card.type === 'UNIT')).toHaveLength(10);
      expect(LEVEL02_DECK.cards.every((card) => !level01Ids.has(card.id))).toBe(true);
      expect(
        LEVEL02_DECK.cards.every((card) => {
          const level = monsterLevels.get(card.id);
          return level !== undefined && level >= -1 && level <= 2;
        }),
      ).toBe(true);
      expect([...categories].sort()).toEqual([...ABILITY_CATEGORIES].sort());
      expect(level02Power.hp / level01Power.hp).toBeCloseTo(1.2, 1);
      expect(level02Power.attack / level01Power.attack).toBeCloseTo(1.2, 1);
      expect(
        (level02Power.hp + level02Power.attack) / (level01Power.hp + level01Power.attack),
      ).toBeCloseTo(1.2, 2);
      expect(
        (level02DeckPower.hp + level02DeckPower.attack) /
          (level01DeckPower.hp + level01DeckPower.attack),
      ).toBeCloseTo(1.2, 1);
      expect(
        LEVEL02_DECK.cards.map((card) => requireCardDefinition(card.id, ALL_CARD_DEFINITIONS)),
      ).toHaveLength(11);
    },
  );

  it('reduces only incoming damage of 3 or more with Animated Armor plating', () => {
    const runtime = createRuntime();
    const armor = addBattlefieldCard(runtime, 'CFlx1tkRxKC9qAC7', 'player', 'player:FC');
    const dog = addBattlefieldCard(runtime, 'ECe2DkOgSSqXHBqv', 'enemy', 'enemy:FC');
    runtime.currentSide = 'enemy';
    const hpBefore = armor.card.instance.hp ?? 0;

    applyAttackAction(runtime, requireAttackAction(runtime, dog, armor));

    expect(armor.card.instance.hp).toBe(hpBefore - 1);
  });

  it('grants Catfolk Pouncer +2 until its next attack only after moving to the front row', () => {
    const runtime = createRuntime();
    const pouncer = addBattlefieldCard(runtime, 'PvYl5kItb7xoE8Is', 'player', 'player:BR');
    const move = requireMoveAction(runtime, pouncer, 'player:FR');

    applyMoveAction(runtime, move);

    expect(getEffectiveAttack(runtime, pouncer)).toBe((pouncer.card.instance.attack ?? 0) + 2);
    const attack = requireAttackAction(runtime, pouncer, runtime.enemy.leader);
    applyAttackAction(runtime, attack);
    expect(attack.attack).toBe((pouncer.card.instance.attack ?? 0) + 2);
    expect(getEffectiveAttack(runtime, pouncer)).toBe(pouncer.card.instance.attack);
  });

  it('damages the directly opposing enemy when Goblin Pyro enters the front row', () => {
    const runtime = createRuntime();
    const target = addBattlefieldCard(runtime, 'ECe2DkOgSSqXHBqv', 'enemy', 'enemy:FC');
    const pyro = addHandCard(runtime, 'Ky5eNRvN71O0tY9l', 'player');
    const hpBefore = target.card.instance.hp ?? 0;
    const place = listPlaceActions(runtime).find(
      (action) =>
        action.cardInstanceId === pyro.card.instance.instanceId && action.toSlotId === 'player:FC',
    );
    if (!place) {
      throw new Error('Expected a legal Goblin Pyro place action');
    }

    applyPlaceAction(runtime, place);

    expect(target.card.instance.hp).toBe(hpBefore - 1);
  });

  it('deals 2 damage with the Aiuvarin Elementalist active skill', () => {
    const runtime = createRuntime();
    const elementalist = addBattlefieldCard(runtime, 'C9a1JvKRo43I1nx3', 'player', 'player:FC');
    const target = addBattlefieldCard(runtime, 'ECe2DkOgSSqXHBqv', 'enemy', 'enemy:FC');
    const hpBefore = target.card.instance.hp ?? 0;
    const action = listActiveSkillActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === elementalist.card.instance.instanceId &&
        candidate.targetInstanceId === target.card.instance.instanceId,
    );
    if (!action) {
      throw new Error('Expected a legal Aiuvarin Elementalist active skill');
    }

    applyActiveSkillAction(runtime, action);

    expect(action).toMatchObject({ effect: 'DAMAGE', value: 2 });
    expect(target.card.instance.hp).toBe(hpBefore - 2);
  });

  it('adds Bugbear Prowler damage only against an undamaged target', () => {
    const runtime = createRuntime();
    const prowler = addBattlefieldCard(runtime, '9cBuzDV8seJqhNKJ', 'player', 'player:FC');
    const target = addBattlefieldCard(runtime, 'ECe2DkOgSSqXHBqv', 'enemy', 'enemy:FC');
    const firstAttack = requireAttackAction(runtime, prowler, target);

    applyAttackAction(runtime, firstAttack);

    expect(firstAttack.attack).toBe((prowler.card.instance.attack ?? 0) + 1);
    prowler.hasAttackedThisTurn = false;
    runtime.phase = 'MAIN';
    const secondAttack = requireAttackAction(runtime, prowler, target);
    expect(secondAttack.attack).toBe(prowler.card.instance.attack);
  });

  it('damages every enemy UNIT when Caligni Dancer retreats without damaging the leader', () => {
    const runtime = createRuntime();
    const dancer = addBattlefieldCard(runtime, 'SZCf0IZkf36plwVd', 'player', 'player:FC');
    const attacker = addBattlefieldCard(runtime, 'ECe2DkOgSSqXHBqv', 'enemy', 'enemy:FC');
    const secondEnemy = addBattlefieldCard(runtime, 'NW68bxCLC6oDHxL9', 'enemy', 'enemy:FR');
    dancer.card.instance.hp = 1;
    runtime.currentSide = 'enemy';
    const attackerHpBefore = attacker.card.instance.hp ?? 0;
    const secondEnemyHpBefore = secondEnemy.card.instance.hp ?? 0;
    const leaderHpBefore = runtime.enemy.leader.card.instance.hp ?? 0;

    applyAttackAction(runtime, requireAttackAction(runtime, attacker, dancer));

    expect(dancer.zone).toBe('DROP');
    expect(attacker.card.instance.hp).toBe(attackerHpBefore - 1);
    expect(secondEnemy.card.instance.hp).toBe(secondEnemyHpBefore - 1);
    expect(runtime.enemy.leader.card.instance.hp).toBe(leaderHpBefore);
  });

  it('applies the Hobgoblin FRONT, War Chanter BACK, and Rat Swarm GLOBAL passives', () => {
    const runtime = createRuntime();
    const soldier = addBattlefieldCard(runtime, 'NW68bxCLC6oDHxL9', 'player', 'player:FC');
    const pyro = addBattlefieldCard(runtime, 'Ky5eNRvN71O0tY9l', 'player', 'player:FR');
    const chanter = addBattlefieldCard(runtime, 'wepiUEi2Lxl8j1BH', 'player', 'player:BR');
    addBattlefieldCard(runtime, '6wPW2dvpt86Ou6bL', 'enemy', 'enemy:FC');

    expect(getEffectiveAttack(runtime, soldier)).toBe((soldier.card.instance.attack ?? 0) + 1);
    expect(getEffectiveAttack(runtime, pyro)).toBe(pyro.card.instance.attack);
    expect(getEffectiveAttack(runtime, chanter)).toBe(chanter.card.instance.attack);

    soldier.battlefieldSlot = 'player:BL';
    expect(getEffectiveAttack(runtime, soldier)).toBe((soldier.card.instance.attack ?? 0) + 1);
  });
});

function calculateUnitPower(deck: CardDefinitionFile): { hp: number; attack: number } {
  return calculateCardPower(deck.cards.filter((card) => card.type === 'UNIT'));
}

function calculateDeckPower(deck: CardDefinitionFile): { hp: number; attack: number } {
  return calculateCardPower(deck.cards);
}

function calculateCardPower(cards: CardDefinitionFile['cards']): { hp: number; attack: number } {
  return cards.reduce(
    (total, card) => ({
      hp: total.hp + (card.hp ?? 0),
      attack: total.attack + (card.attack ?? 0),
    }),
    { hp: 0, attack: 0 },
  );
}

function createRuntime(): BattleRuntimeState {
  const playerLeader = createBattleCard(LEVEL02_LEADER_ID, 'player', 'BATTLEFIELD', 'player:BC');
  const enemyLeader = createBattleCard(LEVEL02_LEADER_ID, 'enemy', 'BATTLEFIELD', 'enemy:BC');
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
  const definition = LEVEL02_DEFINITIONS.get(definitionId);
  if (!definition) {
    throw new Error(`Missing level02 definition: ${definitionId}`);
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

function requireMoveAction(
  runtime: BattleRuntimeState,
  card: BattleCardRuntimeState,
  toSlotId: BattleSlotId,
): ReturnType<typeof listMoveActions>[number] {
  const action = listMoveActions(runtime, card.side).find(
    (candidate) =>
      candidate.cardInstanceId === card.card.instance.instanceId && candidate.toSlotId === toSlotId,
  );
  if (!action) {
    throw new Error(`Expected a legal move for ${card.card.definition.id}`);
  }

  return action;
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
