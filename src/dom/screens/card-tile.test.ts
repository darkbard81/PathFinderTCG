import { describe, expect, it } from 'vitest';
import type { CardDefinition } from '../../game/save/card-catalog';
import type { RuntimeCardInstance } from '../../game/save/session';
import { formatCardTileLabel, toCardTile, type CardTile } from './card-tile';

function runtimeCard(
  definition: Partial<CardDefinition>,
  instanceOverrides: Partial<CardDefinition> = {},
): RuntimeCardInstance {
  const base: CardDefinition = {
    id: 'card-1',
    name: 'Card One',
    type: 'UNIT',
    traits: [],
    abilities: [],
    description: '',
    note: '',
    ...definition,
  };

  return {
    instance: {
      ...base,
      ...instanceOverrides,
      instanceId: 'instance-1',
      owner: 'PLAYER',
      zone: 'DECK',
    },
    definition: base,
  } as unknown as RuntimeCardInstance;
}

describe('toCardTile', () => {
  it('정의에 없는 수치는 null로 두고 카드 이미지 URL을 만든다', () => {
    const result = toCardTile(
      runtimeCard({ id: 'unit_elf_archer_001', name: '달그늘 궁수', cost: 1, attack: 3 }),
      '/tcg',
    );

    expect(result.cost).toBe(1);
    expect(result.attack).toBe(3);
    expect(result.hp).toBeNull();
    expect(result.dominance).toBeNull();
    expect(result.artUrl).toBe('/tcg/cards/webp/unit_elf_archer_001.webp');
  });

  it('성장으로 오른 인스턴스 수치를 정의값보다 우선한다', () => {
    const result = toCardTile(runtimeCard({ hp: 3, level: 1 }, { hp: 7, level: 3 }), '/tcg');

    expect(result.hp).toBe(7);
    expect(result.level).toBe(3);
  });

  it('assetBaseUrl 끝의 슬래시가 중복되지 않는다', () => {
    expect(toCardTile(runtimeCard({ id: 'leader_minerva' }), '/tcg/').artUrl).toBe(
      '/tcg/cards/webp/leader_minerva.webp',
    );
  });
});

describe('formatCardTileLabel', () => {
  const tile: CardTile = {
    instanceId: 'i1',
    cardId: 'c1',
    name: '달그늘 궁수',
    cost: 1,
    dominance: 1,
    attack: 3,
    hp: null,
    level: 2,
    artUrl: '',
  };

  it('이름과 네 수치를 한 줄로 만든다', () => {
    expect(formatCardTileLabel(tile)).toBe('달그늘 궁수 · 코스트 1 · 지배력 1 · 공격 3 · 체력 -');
  });

  it('부가 설명이 있으면 뒤에 붙인다', () => {
    expect(formatCardTileLabel(tile, '장착 중')).toContain('· 장착 중');
  });
});
