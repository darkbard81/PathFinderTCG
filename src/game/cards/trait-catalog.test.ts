import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TRAIT_CATEGORIES,
  TRAIT_DEFINITIONS,
  hasAllTraits,
  hasAnyTrait,
  hasTrait,
  isKnownTraitId,
  readSizeRank,
  readTraitsByCategory,
  sortTraitIds,
} from './trait-catalog';

type TraitSchema = {
  $defs: {
    category: { enum: string[] };
    traitId: { enum: string[] };
  };
};

type DeckFile = {
  version: string;
  cards: { id: string; traits: string[] }[];
};

const TRAIT_SCHEMA = JSON.parse(
  readFileSync(resolve('cards/traits/trait.schema.json'), 'utf8'),
) as TraitSchema;

const DECK_FILES = readdirSync(resolve('cards'))
  .filter((name) => name.startsWith('deck_') && name.endsWith('.json'))
  .map((name) => ({
    name,
    deck: JSON.parse(readFileSync(resolve('cards', name), 'utf8')) as DeckFile,
  }));

describe('trait catalog', () => {
  it('gives every trait a unique id', () => {
    const ids = TRAIT_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the schema traitId enum and the catalog in sync', () => {
    expect([...TRAIT_SCHEMA.$defs.traitId.enum].sort()).toEqual(
      TRAIT_DEFINITIONS.map((definition) => definition.id).sort(),
    );
  });

  it('keeps the schema category enum and the catalog in sync', () => {
    expect(TRAIT_SCHEMA.$defs.category.enum).toEqual(
      TRAIT_CATEGORIES.map((category) => category.id),
    );
  });

  it('assigns every trait to a declared category', () => {
    const categoryIds = new Set(TRAIT_CATEGORIES.map((category) => category.id));
    for (const definition of TRAIT_DEFINITIONS) {
      expect(categoryIds.has(definition.category)).toBe(true);
    }
  });
});

describe('deck card traits', () => {
  it('finds every deck file', () => {
    expect(DECK_FILES.length).toBeGreaterThan(0);
  });

  it('uses the card-json-v0.4 version', () => {
    for (const { name, deck } of DECK_FILES) {
      expect(`${name}:${deck.version}`).toBe(`${name}:card-json-v0.4`);
    }
  });

  it('stores only canonical trait ids', () => {
    for (const { name, deck } of DECK_FILES) {
      for (const card of deck.cards) {
        for (const traitId of card.traits) {
          expect(`${name}:${card.id}:${traitId}`).toBe(
            `${name}:${card.id}:${isKnownTraitId(traitId) ? traitId : 'UNKNOWN'}`,
          );
        }
      }
    }
  });

  it('no longer carries a separate rarity field', () => {
    for (const { deck } of DECK_FILES) {
      for (const card of deck.cards) {
        expect(card).not.toHaveProperty('rarity');
      }
    }
  });

  it('gives every card exactly one rarity trait and at most one size trait', () => {
    for (const { deck } of DECK_FILES) {
      for (const card of deck.cards) {
        expect(readTraitsByCategory(card.traits, 'RARITY')).toHaveLength(1);
        expect(readTraitsByCategory(card.traits, 'SIZE').length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never repeats a trait on the same card', () => {
    for (const { deck } of DECK_FILES) {
      for (const card of deck.cards) {
        expect(new Set(card.traits).size).toBe(card.traits.length);
      }
    }
  });
});

describe('trait helpers', () => {
  const traits = ['common', 'humanoid', 'elf', 'medium'];

  it('matches a single trait', () => {
    expect(hasTrait(traits, 'elf')).toBe(true);
    expect(hasTrait(traits, 'dwarf')).toBe(false);
  });

  it('requires every trait for hasAllTraits', () => {
    expect(hasAllTraits(traits, ['elf', 'humanoid'])).toBe(true);
    expect(hasAllTraits(traits, ['elf', 'undead'])).toBe(false);
    expect(hasAllTraits(traits, [])).toBe(true);
  });

  it('requires any trait for hasAnyTrait', () => {
    expect(hasAnyTrait(traits, ['goblin', 'elf'])).toBe(true);
    expect(hasAnyTrait(traits, ['goblin', 'hobgoblin'])).toBe(false);
    expect(hasAnyTrait(traits, [])).toBe(false);
  });

  it('ranks sizes by catalog order and returns -1 without a size trait', () => {
    expect(readSizeRank(['tiny'])).toBeLessThan(readSizeRank(['gargantuan']));
    expect(readSizeRank(['medium'])).toBeLessThan(readSizeRank(['large']));
    expect(readSizeRank(['common', 'humanoid'])).toBe(-1);
  });

  it('sorts trait ids by category then by in-category order', () => {
    expect(sortTraitIds(['elf', 'unholy', 'common', 'humanoid', 'medium'])).toEqual([
      'medium',
      'common',
      'humanoid',
      'elf',
      'unholy',
    ]);
  });
});
