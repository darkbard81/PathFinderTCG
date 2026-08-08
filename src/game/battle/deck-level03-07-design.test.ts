import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import deckLevel01Data from '../../../cards/deck_level01.json';
import deckLevel02Data from '../../../cards/deck_level02.json';
import deckLevel03Data from '../../../cards/deck_level03.json';
import deckLevel04Data from '../../../cards/deck_level04.json';
import deckLevel05Data from '../../../cards/deck_level05.json';
import deckLevel06Data from '../../../cards/deck_level06.json';
import deckLevel07Data from '../../../cards/deck_level07.json';
import { describe, expect, it } from 'vitest';
import { requireCardDefinition, type CardDefinitionFile } from '../save/card-catalog';
import { ALL_CARD_DEFINITIONS } from '../save/auto-card-catalog';
import { hasMonsterCoreData, loadMonsterCoreData } from './__fixtures__/monster-core';

/** PF2E 원본 자산은 git 추적 대상이 아니므로 없는 환경에서는 출처 검증을 건너뛴다. */
const itWithMonsterCore = it.skipIf(!hasMonsterCoreData);

const DECKS = [
  deckLevel01Data,
  deckLevel02Data,
  deckLevel03Data,
  deckLevel04Data,
  deckLevel05Data,
  deckLevel06Data,
  deckLevel07Data,
] as unknown as CardDefinitionFile[];

const NEW_DECKS = DECKS.slice(2);
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

const NUMERIC_VARIANT_IDS = [
  [
    'statue_stone_shell',
    'ankhrav_burrow_rush',
    'athamaru_harpoon_entry',
    'swampseer_bog_bolt',
    'herbalist_weakening_strike',
    'cinder_rat_smoke_burst',
    'cockatrice_stone_guard',
  ],
  [
    'arboreal_bark_armor',
    'stonecaster_fault_step',
    'gargoyle_ambush_drop',
    'griffon_wind_lift',
    'minotaur_opening_gore',
    'phantom_last_oath',
    'pixie_dust_guard',
  ],
  [
    'basilisk_crystal_hide',
    'brimorak_burning_step',
    'flame_drake_eruption',
    'forest_troll_regrowth',
    'harpy_backline_gale',
    'landslide_last_shelter',
    'poltergeist_flying_debris',
  ],
  [
    'granitescale_plating',
    'ankylosaurus_tail_momentum',
    'hydra_many_maws',
    'iron_hag_cage_hex',
    'lamia_backline_curse',
    'mummy_tomb_miasma',
    'nightmare_blazing_vanguard',
  ],
  [
    'dullahan_deathless_guard',
    'frost_drake_glacial_rush',
    'giant_statue_crushing_entry',
    'greater_shadow_void_touch',
    'medusa_first_gaze',
    'naiad_parting_tide',
    'omen_dragon_mirrored_fate',
  ],
] as const;

const CREATIVE_ABILITY_IDS = [
  ['dryad_wounded_grove', 'hell_hound_finisher_aura', 'unicorn_purifying_charge'],
  ['grenadier_underdog_mix', 'shadow_dominance_drain', 'werebear_wounded_fury'],
  ['redcap_bully_support', 'witchwarg_chilling_pressure', 'yeti_size_hunt'],
  ['revenant_wounded_vengeance', 'wisp_unmoved_dread', 'wyvern_opposing_dive'],
  ['quetzalcoatlus_wing_command', 'skeletal_hulk_bone_bulwark', 'stegosaurus_guarded_swing'],
] as const;

describe('deck_level03 through deck_level07 design', () => {
  itWithMonsterCore(
    'uses globally unique PF2E IDs with matching source levels and source art',
    () => {
      const allIds = DECKS.flatMap((deck) => deck.cards.map((card) => card.id));
      const monsterById = new Map(loadMonsterCoreData().map((monster) => [monster._id, monster]));

      expect(new Set(allIds).size).toBe(allIds.length);
      NEW_DECKS.forEach((deck, deckIndex) => {
        const expectedLevel = deckIndex + 3;
        expect(deck.cards).toHaveLength(11);
        expect(deck.cards.filter((card) => card.type === 'LEADER')).toHaveLength(1);
        expect(deck.cards.filter((card) => card.type === 'UNIT')).toHaveLength(10);

        for (const card of deck.cards) {
          const monster = monsterById.get(card.id);
          expect(monster?.details.level.value).toBe(expectedLevel);
          expect(card.note.startsWith(monster?.details.safeNotes.split(/\n\n/)[0] ?? '')).toBe(
            true,
          );
          expect(existsSync(resolve('assets/pf2e/monster_core/arts', `${card.id}.png`))).toBe(true);
        }
      });
    },
  );

  it('raises HP, attack, deck power, and UNIT power by about 20% at every step', () => {
    for (let index = 2; index < DECKS.length; index += 1) {
      const previous = DECKS[index - 1];
      const next = DECKS[index];
      if (!previous || !next) {
        throw new Error(`Missing deck at progression index ${index}`);
      }

      const previousDeckPower = calculatePower(previous.cards);
      const nextDeckPower = calculatePower(next.cards);
      const previousUnitPower = calculatePower(
        previous.cards.filter((card) => card.type === 'UNIT'),
      );
      const nextUnitPower = calculatePower(next.cards.filter((card) => card.type === 'UNIT'));

      expect(nextDeckPower.hp / previousDeckPower.hp).toBeCloseTo(1.2, 1);
      expect(nextDeckPower.attack / previousDeckPower.attack).toBeCloseTo(1.2, 1);
      expect(nextDeckPower.total / previousDeckPower.total).toBeCloseTo(1.2, 1);
      expect(nextUnitPower.hp / previousUnitPower.hp).toBeCloseTo(1.2, 1);
      expect(nextUnitPower.attack / previousUnitPower.attack).toBeCloseTo(1.2, 1);
      expect(nextUnitPower.total / previousUnitPower.total).toBeCloseTo(1.2, 1);
    }
  });

  it('keeps all categories balanced with exactly 70% numeric variants and 30% creative abilities', () => {
    NEW_DECKS.forEach((deck, index) => {
      const abilities = deck.cards.flatMap((card) => card.abilities);
      const numericIds = NUMERIC_VARIANT_IDS[index];
      const creativeIds = CREATIVE_ABILITY_IDS[index];
      if (!numericIds || !creativeIds) {
        throw new Error(`Missing ability classification at index ${index}`);
      }

      const counts = new Map(
        ABILITY_CATEGORIES.map((category) => [
          category,
          abilities.filter((ability) => ability.category === category).length,
        ]),
      );
      const categoryCounts = [...counts.values()];
      const classifiedIds = [...numericIds, ...creativeIds].sort();

      expect(abilities).toHaveLength(10);
      expect(Math.max(...categoryCounts) - Math.min(...categoryCounts)).toBeLessThanOrEqual(1);
      expect(classifiedIds).toEqual(abilities.map((ability) => ability.id).sort());
      expect(numericIds).toHaveLength(7);
      expect(creativeIds).toHaveLength(3);
    });
  });

  it('registers all 55 new definitions through the automatic deck glob', () => {
    const newCards = NEW_DECKS.flatMap((deck) => deck.cards);

    expect(
      newCards.map((card) => requireCardDefinition(card.id, ALL_CARD_DEFINITIONS)),
    ).toHaveLength(55);
  });
});

function calculatePower(cards: CardDefinitionFile['cards']): {
  hp: number;
  attack: number;
  total: number;
} {
  return cards.reduce(
    (total, card) => ({
      hp: total.hp + (card.hp ?? 0),
      attack: total.attack + (card.attack ?? 0),
      total: total.total + (card.hp ?? 0) + (card.attack ?? 0),
    }),
    { hp: 0, attack: 0, total: 0 },
  );
}
