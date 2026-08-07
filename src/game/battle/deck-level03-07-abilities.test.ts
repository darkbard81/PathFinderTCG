import deckLevel02Data from '../../../cards/deck_level02.json';
import deckLevel03Data from '../../../cards/deck_level03.json';
import deckLevel04Data from '../../../cards/deck_level04.json';
import deckLevel05Data from '../../../cards/deck_level05.json';
import deckLevel06Data from '../../../cards/deck_level06.json';
import deckLevel07Data from '../../../cards/deck_level07.json';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CardDefinitionFile } from '../save/card-catalog';
import type { CardInstance } from '../save/types';
import {
  applyActiveSkillAction,
  applyAttackAction,
  applyMoveAction,
  applyPlaceAction,
  applyTurnEnd,
  getEffectiveAttack,
  getEffectiveDominance,
  getEffectiveHp,
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

const DECK_FILES = [
  deckLevel02Data,
  deckLevel03Data,
  deckLevel04Data,
  deckLevel05Data,
  deckLevel06Data,
  deckLevel07Data,
] as unknown as CardDefinitionFile[];
const DEFINITIONS = new Map(
  DECK_FILES.flatMap((deck) => deck.cards).map((definition) => [definition.id, definition]),
);
const LEADER_ID = 'PLZk6zY5iwccPTPS';
const NEUTRAL_UNIT_ID = 'PvYl5kItb7xoE8Is';
let nextInstanceNumber = 1;

describe('deck_level03 through deck_level07 numeric ability variants', () => {
  beforeEach(() => {
    nextInstanceNumber = 1;
  });

  it.each([
    ['yQ2mosomuAPiLMkU', 2],
    ['0rm0UDbXvwg4sSxQ', 3],
    ['mX47c0W9rizbmMBM', 3],
    ['MXSKccQqbQqQ77Ii', 3],
    ['GNwLVbfFx8EPz7xO', 4],
  ])('applies the configured SPECIAL reduction for %s', (cardId, reduction) => {
    const runtime = createRuntime();
    const target = addBattlefieldCard(runtime, cardId, 'player', 'player:FC');
    const attacker = addBattlefieldCard(runtime, 'qtJ36jlcRQw5sBnr', 'enemy', 'enemy:FC');
    runtime.currentSide = 'enemy';
    const hpBefore = target.card.instance.hp ?? 0;

    applyAttackAction(runtime, requireAttackAction(runtime, attacker, target));

    expect(target.card.instance.hp).toBe(
      hpBefore - ((attacker.card.instance.attack ?? 0) - reduction),
    );
  });

  it('does not apply the Basilisk threshold reduction below 4 damage', () => {
    const runtime = createRuntime();
    const basilisk = addBattlefieldCard(runtime, 'mX47c0W9rizbmMBM', 'player', 'player:FC');
    const attacker = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FC');
    runtime.currentSide = 'enemy';
    const hpBefore = basilisk.card.instance.hp ?? 0;

    applyAttackAction(runtime, requireAttackAction(runtime, attacker, basilisk));

    expect(basilisk.card.instance.hp).toBe(hpBefore - (attacker.card.instance.attack ?? 0));
  });

  it.each([
    ['V1Kr5aiPaTM0mDFu', 2],
    ['nEB0UekUmP5L8Tj8', 3],
    ['6UrgCT8MwC8CeGbu', 3],
    ['CYt04IKRQeiC9Ly9', 4],
    ['2SixuEUfKpEyfOEY', 5],
  ])('grants the configured next-attack MOVE bonus for %s', (cardId, bonus) => {
    const runtime = createRuntime();
    const card = addBattlefieldCard(runtime, cardId, 'player', 'player:BR');
    const baseAttack = card.card.instance.attack ?? 0;

    expect(getEffectiveAttack(runtime, card)).toBe(baseAttack);
    applyMoveAction(runtime, requireMoveAction(runtime, card, 'player:FR'));
    expect(getEffectiveAttack(runtime, card)).toBe(baseAttack + bonus);
  });

  it.each([
    ['pzQhR0mc8HEhXLOZ', 2],
    ['cvfIkEF6xmWn2soN', 3],
    ['qlxVPpwVFw5qIVQM', 3],
    ['Bkr0soTDhQq1qjWx', 4],
    ['I00S3LWnDJfCn4zv', 5],
  ])('damages only the opposing front card with SUMMON ability on %s', (cardId, damage) => {
    const runtime = createRuntime();
    const target = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FC');
    const card = addHandCard(runtime, cardId, 'player');
    const hpBefore = target.card.instance.hp ?? 0;

    applyPlaceAction(runtime, requirePlaceAction(runtime, card, 'player:FC'));
    expect(target.card.instance.hp).toBe(hpBefore - damage);

    const controlRuntime = createRuntime();
    const controlTarget = addBattlefieldCard(controlRuntime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FL');
    const controlCard = addHandCard(controlRuntime, cardId, 'player');
    const controlHp = controlTarget.card.instance.hp ?? 0;
    applyPlaceAction(controlRuntime, requirePlaceAction(controlRuntime, controlCard, 'player:BL'));
    expect(controlTarget.card.instance.hp).toBe(controlHp);
  });

  it.each([
    ['F2Xhn4rqPAj55w3O', 'enemy', 'DAMAGE', 3],
    ['gWgMg7cARqOe82O6', 'ally', 'BUFF_ATTACK', 2],
    ['htK4dElL6YvFCLkz', 'ally', 'HEAL', 3],
    ['lfUUnFazGLAtqRsP', 'enemy', 'DAMAGE', 4],
    ['5meW7DytYnF7Iq2V', 'enemy', 'DAMAGE', 5],
  ] as const)(
    'executes the configured ACTION effect for %s and blocks entry-turn use',
    (cardId, targetSide, effect, value) => {
      const runtime = createRuntime();
      const source = addBattlefieldCard(runtime, cardId, 'player', 'player:FC');
      const target =
        targetSide === 'ally'
          ? addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'player', 'player:FR')
          : runtime.enemy.leader;
      if (effect === 'HEAL') {
        target.card.instance.hp = (target.card.instance.hp ?? 0) - 1;
      }
      const hpBefore = target.card.instance.hp ?? 0;
      const attackBefore = getEffectiveAttack(runtime, target);
      const action = listActiveSkillActions(runtime).find(
        (candidate) =>
          candidate.cardInstanceId === source.card.instance.instanceId &&
          candidate.targetInstanceId === target.card.instance.instanceId,
      );
      expect(action).toMatchObject({ effect, value });
      if (!action) {
        throw new Error(`Missing active skill action for ${cardId}`);
      }

      applyActiveSkillAction(runtime, action);
      if (effect === 'DAMAGE') {
        expect(target.card.instance.hp).toBe(hpBefore - value);
      } else if (effect === 'HEAL') {
        expect(target.card.instance.hp).toBe(hpBefore + value);
      } else {
        expect(getEffectiveAttack(runtime, target)).toBe(attackBefore + value);
      }

      const entryRuntime = createRuntime();
      const entrySource = addBattlefieldCard(entryRuntime, cardId, 'player', 'player:FC');
      entrySource.enteredBattlefieldTurnNumber = entryRuntime.turnNumber;
      expect(
        listActiveSkillActions(entryRuntime).some(
          (candidate) => candidate.cardInstanceId === entrySource.card.instance.instanceId,
        ),
      ).toBe(false);
    },
  );

  it.each([
    ['Q1qjdG3i8TZuEOq6', 2],
    ['vN2alMciNlKpBpKN', 3],
    ['QCPpQya5TEUuIxQn', 5],
  ])('adds full-health ATTACK damage only for %s', (cardId, bonus) => {
    const runtime = createRuntime();
    const attacker = addBattlefieldCard(runtime, cardId, 'player', 'player:FC');
    const target = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FC');

    expect(requireAttackAction(runtime, attacker, target).attack).toBe(
      (attacker.card.instance.attack ?? 0) + bonus,
    );
    target.card.instance.hp = (target.card.instance.hp ?? 0) - 1;
    expect(requireAttackAction(runtime, attacker, target).attack).toBe(
      attacker.card.instance.attack,
    );
  });

  it.each([
    ['uBNm3R9wbLTPrM9i', 3],
    ['vqYrJ33XgoeQUUle', 4],
  ])('adds back-row ATTACK damage only for %s', (cardId, bonus) => {
    const runtime = createRuntime();
    const attacker = addBattlefieldCard(runtime, cardId, 'player', 'player:FC');
    const backTarget = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:BR');
    const frontTarget = addBattlefieldCard(runtime, 'Ky5eNRvN71O0tY9l', 'enemy', 'enemy:FL');

    expect(requireAttackAction(runtime, attacker, backTarget).attack).toBe(
      (attacker.card.instance.attack ?? 0) + bonus,
    );
    expect(requireAttackAction(runtime, attacker, frontTarget).attack).toBe(
      attacker.card.instance.attack,
    );
  });

  it.each([
    ['xN5J9S485LxFZMkL', 2],
    ['9VMoTqyVaKc4ZR4H', 3],
    ['XZWUQklzWF6YFPmG', 4],
  ])('damages enemy UNITs but not the leader when %s retreats', (cardId, damage) => {
    const runtime = createRuntime();
    const retreating = addBattlefieldCard(runtime, cardId, 'player', 'player:FC');
    const attacker = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FC');
    const secondEnemy = addBattlefieldCard(runtime, 'Ky5eNRvN71O0tY9l', 'enemy', 'enemy:FR');
    retreating.card.instance.hp = 1;
    runtime.currentSide = 'enemy';
    const attackerHp = attacker.card.instance.hp ?? 0;
    const secondHp = secondEnemy.card.instance.hp ?? 0;
    const leaderHp = runtime.enemy.leader.card.instance.hp ?? 0;

    applyAttackAction(runtime, requireAttackAction(runtime, attacker, retreating));

    expect(attacker.card.instance.hp).toBe(attackerHp - damage);
    expect(secondEnemy.card.instance.hp).toBe(secondHp - damage);
    expect(runtime.enemy.leader.card.instance.hp).toBe(leaderHp);
  });

  it.each([
    ['4Ejgj6p1LAu1RAN3', 3],
    ['H8lGFF3PKUv2yRL2', 5],
  ])('heals only the lowest-HP adjacent ally when %s retreats', (cardId, healing) => {
    const runtime = createRuntime();
    const retreating = addBattlefieldCard(runtime, cardId, 'player', 'player:FC');
    const adjacent = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'player', 'player:FR');
    const distant = addBattlefieldCard(runtime, 'Ky5eNRvN71O0tY9l', 'player', 'player:BL');
    const attacker = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FC');
    retreating.card.instance.hp = 1;
    adjacent.card.instance.hp = 1;
    distant.card.instance.hp = 1;
    runtime.currentSide = 'enemy';

    applyAttackAction(runtime, requireAttackAction(runtime, attacker, retreating));

    expect(adjacent.card.instance.hp).toBe(1 + healing);
    expect(distant.card.instance.hp).toBe(1);
  });

  it.each([
    ['MrzlaE7k1PEsd3iQ', 'hp', 2],
    ['Ehtm5k9iBYTvSUcZ', 'hp', 3],
    ['zpd6b6UPP72ZELCj', 'attack', 2],
    ['qRUqoezeEnQ2KdyT', 'attack', 3],
    ['7Uf4Q9w3dCDEV30e', 'hp', 4],
  ] as const)('applies the configured FRONT stat only in front for %s', (cardId, stat, bonus) => {
    const runtime = createRuntime();
    const card = addBattlefieldCard(runtime, cardId, 'player', 'player:FR');
    const readStat = stat === 'hp' ? getEffectiveHp : getEffectiveAttack;
    const base = stat === 'hp' ? (card.card.instance.hp ?? 0) : (card.card.instance.attack ?? 0);

    expect(readStat(runtime, card)).toBe(base + bonus);
    card.battlefieldSlot = 'player:BR';
    expect(readStat(runtime, card)).toBe(base);
  });
});

describe('deck_level03 through deck_level07 creative abilities', () => {
  beforeEach(() => {
    nextInstanceNumber = 1;
  });

  it('supports only wounded allies with Dryad wounded grove', () => {
    const runtime = createRuntime();
    addBattlefieldCard(runtime, '4MoqBCDQA6FR1sPw', 'player', 'player:BR');
    const wounded = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'player', 'player:FR');
    const full = addBattlefieldCard(runtime, 'Ky5eNRvN71O0tY9l', 'player', 'player:FL');
    wounded.card.instance.hp = (wounded.card.instance.hp ?? 0) - 1;

    expect(getEffectiveHp(runtime, wounded)).toBe((wounded.card.instance.hp ?? 0) + 1);
    expect(getEffectiveHp(runtime, full)).toBe(full.card.instance.hp);
  });

  it('buffs only low-base-attack allies with Ratfolk Grenadier support', () => {
    const runtime = createRuntime();
    addBattlefieldCard(runtime, 'C1gYuDSwTkTIkAcC', 'player', 'player:BR');
    const weak = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'player', 'player:FR');
    const strong = addBattlefieldCard(runtime, '6UrgCT8MwC8CeGbu', 'player', 'player:FL');

    expect(getEffectiveAttack(runtime, weak)).toBe((weak.card.instance.attack ?? 0) + 1);
    expect(getEffectiveAttack(runtime, strong)).toBe(strong.card.instance.attack);
  });

  it('buffs only stronger allies with Redcap bully support', () => {
    const runtime = createRuntime();
    addBattlefieldCard(runtime, 'fWAjkhQ0y50Eh2BT', 'player', 'player:BR');
    const stronger = addBattlefieldCard(runtime, '6UrgCT8MwC8CeGbu', 'player', 'player:FR');
    const weaker = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'player', 'player:FL');

    expect(getEffectiveAttack(runtime, stronger)).toBe((stronger.card.instance.attack ?? 0) + 1);
    expect(getEffectiveAttack(runtime, weaker)).toBe(weaker.card.instance.attack);
  });

  it('buffs only wounded undead allies with Revenant vengeance', () => {
    const runtime = createRuntime();
    addBattlefieldCard(runtime, 'bsrQp0pLgvjJr6mC', 'player', 'player:BR');
    const woundedUndead = addBattlefieldCard(runtime, 'XZWUQklzWF6YFPmG', 'player', 'player:FR');
    const living = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'player', 'player:FL');
    woundedUndead.card.instance.hp = (woundedUndead.card.instance.hp ?? 0) - 1;
    living.card.instance.hp = (living.card.instance.hp ?? 0) - 1;

    expect(getEffectiveAttack(runtime, woundedUndead)).toBe(
      (woundedUndead.card.instance.attack ?? 0) + 2,
    );
    expect(getEffectiveAttack(runtime, living)).toBe(living.card.instance.attack);
  });

  it('adds dominance only to front allies with Quetzalcoatlus wing command', () => {
    const runtime = createRuntime();
    addBattlefieldCard(runtime, 'a4LgD3NrgkiINvru', 'player', 'player:BR');
    const target = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'player', 'player:FR');
    const base = target.card.instance.dominance ?? 0;

    expect(getEffectiveDominance(runtime, target)).toBe(base + 2);
    target.battlefieldSlot = 'player:BL';
    expect(getEffectiveDominance(runtime, target)).toBe(base);
  });

  it('weakens only half-HP enemies with Hell Hound finisher aura', () => {
    const runtime = createRuntime();
    addBattlefieldCard(runtime, 'RTviEfjYnsXa0wkT', 'player', 'player:FR');
    const wounded = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FR');
    const full = addBattlefieldCard(runtime, 'Ky5eNRvN71O0tY9l', 'enemy', 'enemy:FL');
    wounded.card.instance.hp = Math.floor((wounded.card.definition.hp ?? 0) / 2);

    expect(getEffectiveAttack(runtime, wounded)).toBe((wounded.card.instance.attack ?? 0) - 1);
    expect(getEffectiveAttack(runtime, full)).toBe(full.card.instance.attack);
  });

  it('drains only enemy UNIT dominance with Shadow aura', () => {
    const runtime = createRuntime();
    addBattlefieldCard(runtime, 'VotlWUsFKdOrHWF6', 'player', 'player:FR');
    const enemy = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FR');
    const ally = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'player', 'player:FL');

    expect(getEffectiveDominance(runtime, enemy)).toBe((enemy.card.instance.dominance ?? 0) - 1);
    expect(getEffectiveDominance(runtime, ally)).toBe(ally.card.instance.dominance);
  });

  it('weakens only high-base-attack enemies with Witchwarg pressure', () => {
    const runtime = createRuntime();
    addBattlefieldCard(runtime, 'diU0V2M3LiMDMsS0', 'player', 'player:FR');
    const strong = addBattlefieldCard(runtime, '6UrgCT8MwC8CeGbu', 'enemy', 'enemy:FR');
    const weak = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FL');

    expect(getEffectiveAttack(runtime, strong)).toBe((strong.card.instance.attack ?? 0) - 1);
    expect(getEffectiveAttack(runtime, weak)).toBe(weak.card.instance.attack);
  });

  it('weakens only enemies that have neither moved nor attacked with Will-o-Wisp dread', () => {
    const runtime = createRuntime();
    addBattlefieldCard(runtime, 'KgJq51AeYrENo3Db', 'player', 'player:FR');
    const idle = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FR');
    const active = addBattlefieldCard(runtime, 'Ky5eNRvN71O0tY9l', 'enemy', 'enemy:FL');
    active.hasMovedThisTurn = true;

    expect(getEffectiveAttack(runtime, idle)).toBe((idle.card.instance.attack ?? 0) - 1);
    expect(getEffectiveAttack(runtime, active)).toBe(active.card.instance.attack);
  });

  it('protects only lower-base-HP allies with Skeletal Hulk bulwark', () => {
    const runtime = createRuntime();
    addBattlefieldCard(runtime, 'V4rVnbjJbcOIdC4Z', 'player', 'player:FR');
    const smaller = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'player', 'player:FL');
    const equal = addBattlefieldCard(runtime, 'a4LgD3NrgkiINvru', 'player', 'player:BL');

    expect(getEffectiveHp(runtime, smaller)).toBe((smaller.card.instance.hp ?? 0) + 2);
    expect(getEffectiveHp(runtime, equal)).toBe(equal.card.instance.hp);
  });

  it('heals Unicorn only after it attacks', () => {
    const runtime = createRuntime();
    const unicorn = addBattlefieldCard(runtime, 'lYoAwofYGbhWL75Q', 'player', 'player:FC');
    const target = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FC');
    unicorn.card.instance.hp = (unicorn.card.instance.hp ?? 0) - 2;
    const hpBefore = unicorn.card.instance.hp ?? 0;

    expect(unicorn.card.instance.hp).toBe(hpBefore);
    applyAttackAction(runtime, requireAttackAction(runtime, unicorn, target));
    expect(unicorn.card.instance.hp).toBe(hpBefore + 1);
  });

  it('adds Werebear fury only at half HP or lower', () => {
    const runtime = createRuntime();
    const werebear = addBattlefieldCard(runtime, 'h3JksV9Idr9eZLkE', 'player', 'player:FC');
    const target = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FC');

    expect(requireAttackAction(runtime, werebear, target).attack).toBe(
      werebear.card.instance.attack,
    );
    werebear.card.instance.hp = Math.floor((werebear.card.definition.hp ?? 0) / 2);
    expect(requireAttackAction(runtime, werebear, target).attack).toBe(
      (werebear.card.instance.attack ?? 0) + 2,
    );
  });

  it('adds Yeti hunt damage only against a smaller target', () => {
    const runtime = createRuntime();
    const yeti = addBattlefieldCard(runtime, 'alPZcKVrHTcMdtIU', 'player', 'player:FC');
    const small = addBattlefieldCard(runtime, 'Ehtm5k9iBYTvSUcZ', 'enemy', 'enemy:FC');
    const large = addBattlefieldCard(runtime, '0rm0UDbXvwg4sSxQ', 'enemy', 'enemy:FR');

    expect(requireAttackAction(runtime, yeti, small).attack).toBe(
      (yeti.card.instance.attack ?? 0) + 2,
    );
    expect(requireAttackAction(runtime, yeti, large).attack).toBe(yeti.card.instance.attack);
  });

  it('adds Wyvern dive damage only against an enemy in the same column', () => {
    const runtime = createRuntime();
    const wyvern = addBattlefieldCard(runtime, '5iqkL9Me5164H7NY', 'player', 'player:FC');
    const sameColumn = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FC');
    const otherColumn = addBattlefieldCard(runtime, 'Ky5eNRvN71O0tY9l', 'enemy', 'enemy:FR');

    expect(requireAttackAction(runtime, wyvern, sameColumn).attack).toBe(
      (wyvern.card.instance.attack ?? 0) + 3,
    );
    expect(requireAttackAction(runtime, wyvern, otherColumn).attack).toBe(
      wyvern.card.instance.attack,
    );
  });

  it('grants Stegosaurus temporary HP only after attacking and expires it on schedule', () => {
    const runtime = createRuntime();
    const stegosaurus = addBattlefieldCard(runtime, 'qtJ36jlcRQw5sBnr', 'player', 'player:FC');
    const target = addBattlefieldCard(runtime, NEUTRAL_UNIT_ID, 'enemy', 'enemy:FC');
    const baseHp = stegosaurus.card.instance.hp ?? 0;

    expect(getEffectiveHp(runtime, stegosaurus)).toBe(baseHp);
    applyAttackAction(runtime, requireAttackAction(runtime, stegosaurus, target));
    expect(getEffectiveHp(runtime, stegosaurus)).toBe(baseHp + 2);

    applyTurnEnd(runtime);
    applyTurnEnd(runtime);
    applyTurnEnd(runtime);
    expect(getEffectiveHp(runtime, stegosaurus)).toBe(baseHp);
  });
});

function createRuntime(): BattleRuntimeState {
  const playerLeader = createBattleCard(LEADER_ID, 'player', 'BATTLEFIELD', 'player:BC');
  const enemyLeader = createBattleCard(LEADER_ID, 'enemy', 'BATTLEFIELD', 'enemy:BC');
  playerLeader.card.instance.dominance = 99;
  enemyLeader.card.instance.dominance = 99;
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
  return { side, leader, deck: [], hand: [], drop: [], exile: [] };
}

function createBattleCard(
  definitionId: string,
  side: BattleSide,
  zone: BattleRuntimeZone,
  battlefieldSlot: BattleSlotId | null,
): BattleCardRuntimeState {
  const definition = DEFINITIONS.get(definitionId);
  if (!definition) {
    throw new Error(`Missing test definition: ${definitionId}`);
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

function requirePlaceAction(
  runtime: BattleRuntimeState,
  card: BattleCardRuntimeState,
  toSlotId: BattleSlotId,
): ReturnType<typeof listPlaceActions>[number] {
  const action = listPlaceActions(runtime, card.side).find(
    (candidate) =>
      candidate.cardInstanceId === card.card.instance.instanceId && candidate.toSlotId === toSlotId,
  );
  if (!action) {
    throw new Error(`Expected a legal place for ${card.card.definition.id} at ${toSlotId}`);
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
    throw new Error(
      `Expected a legal attack from ${attacker.card.definition.id} to ${target.card.definition.id}`,
    );
  }
  return action;
}
