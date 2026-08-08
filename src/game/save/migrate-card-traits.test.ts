import { describe, expect, it } from 'vitest';
import { migrateLegacyCardTraits, needsCardTraitMigration } from './migrate-card-traits';

describe('migrateLegacyCardTraits', () => {
  it('absorbs the legacy rarity code into a RARITY trait', () => {
    expect(migrateLegacyCardTraits([], 'C')).toEqual(['common']);
    expect(migrateLegacyCardTraits([], 'UC')).toEqual(['uncommon']);
    expect(migrateLegacyCardTraits([], 'R')).toEqual(['rare']);
    expect(migrateLegacyCardTraits([], 'SR')).toEqual(['rare']);
    expect(migrateLegacyCardTraits([], 'EU')).toEqual(['unique']);
  });

  it('expands the comma separated creatureType token list', () => {
    expect(
      migrateLegacyCardTraits([{ key: 'creatureType', text: 'beast, fiend, fire, unholy' }]),
    ).toEqual(['beast', 'fiend', 'fire', 'unholy']);
  });

  it('maps the legacy size abbreviations', () => {
    expect(migrateLegacyCardTraits([{ key: 'size', text: 'med' }])).toEqual(['medium']);
    expect(migrateLegacyCardTraits([{ key: 'size', text: 'lg' }])).toEqual(['large']);
    expect(migrateLegacyCardTraits([{ key: 'size', text: 'grg' }])).toEqual(['gargantuan']);
  });

  it('drops the keys that left the trait system', () => {
    expect(
      migrateLegacyCardTraits([
        { key: 'role', text: '지휘관' },
        { key: 'race', text: '엘프' },
        { key: 'gender', text: '여성' },
        { key: 'sourceLevel', text: '3' },
      ]),
    ).toEqual([]);
  });

  it('drops trait ids that are not in the catalog', () => {
    expect(
      migrateLegacyCardTraits([{ key: 'creatureType', text: 'humanoid, nonexistent' }]),
    ).toEqual(['humanoid']);
  });

  it('sorts by catalog order and removes duplicates', () => {
    expect(
      migrateLegacyCardTraits(
        [
          { key: 'creatureType', text: 'humanoid, elf' },
          { key: 'size', text: 'med' },
          { key: 'creatureType', text: 'elf' },
        ],
        'UC',
      ),
    ).toEqual(['medium', 'uncommon', 'humanoid', 'elf']);
  });

  it('leaves an already migrated trait list untouched', () => {
    const migrated = ['medium', 'common', 'humanoid', 'elf'];
    expect(migrateLegacyCardTraits(migrated)).toEqual(migrated);
    expect(migrateLegacyCardTraits(migrateLegacyCardTraits(migrated))).toEqual(migrated);
  });
});

describe('needsCardTraitMigration', () => {
  it('detects a leftover rarity field', () => {
    expect(needsCardTraitMigration({ rarity: 'C', traits: ['common'] })).toBe(true);
  });

  it('detects legacy trait objects', () => {
    expect(needsCardTraitMigration({ traits: [{ key: 'race', text: '엘프' }] })).toBe(true);
  });

  it('passes an already migrated card through', () => {
    expect(needsCardTraitMigration({ traits: ['common', 'humanoid'] })).toBe(false);
  });
});
