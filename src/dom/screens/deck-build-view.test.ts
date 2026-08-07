import { describe, expect, it } from 'vitest';
import type { CardDefinition } from '../../game/save/card-catalog';
import type { RuntimeCardInstance } from '../../game/save/session';
import {
  buildCostFilters,
  filterCardsByCost,
  pruneCostFilters,
  toDeckBuildCardTile,
  toggleCostFilter,
  type DeckBuildCardTile,
} from './deck-build-view';

function tile(instanceId: string, cost: number | null): DeckBuildCardTile {
  return {
    instanceId,
    cardId: instanceId,
    name: instanceId,
    cost,
    dominance: null,
    attack: null,
    hp: null,
    artUrl: '',
    selectable: true,
  };
}

function runtimeCard(definition: Partial<CardDefinition>): RuntimeCardInstance {
  return {
    instance: {
      instanceId: 'instance-1',
      cardId: definition.id ?? 'card-1',
      type: definition.type ?? 'UNIT',
      owner: 'PLAYER',
      zone: 'DECK',
    },
    definition: {
      id: 'card-1',
      name: 'Card One',
      rarity: 'C',
      type: 'UNIT',
      traits: [],
      abilities: [],
      description: '',
      note: '',
      ...definition,
    },
  } as unknown as RuntimeCardInstance;
}

describe('toDeckBuildCardTile', () => {
  it('정의에 없는 스탯은 null로 두고 카드 아트 URL을 만든다', () => {
    const result = toDeckBuildCardTile(
      runtimeCard({ id: 'unit_elf_archer_001', name: '엘프 궁수', cost: 3, attack: 2 }),
      '/tcg',
      true,
    );

    expect(result.cost).toBe(3);
    expect(result.attack).toBe(2);
    expect(result.hp).toBeNull();
    expect(result.dominance).toBeNull();
    expect(result.artUrl).toBe('/tcg/cards/webp/unit_elf_archer_001.webp');
    expect(result.selectable).toBe(true);
  });

  it('assetBaseUrl 끝의 슬래시가 중복되지 않는다', () => {
    const result = toDeckBuildCardTile(runtimeCard({ id: 'leader_minerva' }), '/tcg/', true);

    expect(result.artUrl).toBe('/tcg/cards/webp/leader_minerva.webp');
  });
});

describe('buildCostFilters', () => {
  it('실제로 존재하는 코스트만 오름차순으로 만든다', () => {
    const filters = buildCostFilters([tile('a', 3), tile('b', 1), tile('c', 3)], new Set([3]));

    expect(filters).toEqual([
      { cost: 1, active: false },
      { cost: 3, active: true },
    ]);
  });

  it('코스트가 없는 카드는 후보에 넣지 않는다', () => {
    expect(buildCostFilters([tile('a', null)], new Set())).toEqual([]);
  });
});

describe('filterCardsByCost', () => {
  it('선택이 없으면 전체를 돌려준다', () => {
    const cards = [tile('a', 1), tile('b', null)];

    expect(filterCardsByCost(cards, new Set()).map((card) => card.instanceId)).toEqual(['a', 'b']);
  });

  it('필터가 걸리면 코스트 없는 카드는 숨긴다', () => {
    const cards = [tile('a', 1), tile('b', 2), tile('c', null)];

    expect(filterCardsByCost(cards, new Set([1])).map((card) => card.instanceId)).toEqual(['a']);
  });
});

describe('toggleCostFilter', () => {
  it('없으면 켜고 있으면 끈다', () => {
    expect([...toggleCostFilter(new Set(), 2)]).toEqual([2]);
    expect([...toggleCostFilter(new Set([2]), 2)]).toEqual([]);
  });

  it('원본 Set을 바꾸지 않는다', () => {
    const original = new Set([1]);
    toggleCostFilter(original, 2);

    expect([...original]).toEqual([1]);
  });
});

describe('pruneCostFilters', () => {
  it('남은 카드에 없는 코스트는 활성 필터에서 뺀다', () => {
    const result = pruneCostFilters(new Set([1, 5]), [tile('a', 1)]);

    expect([...result]).toEqual([1]);
  });

  it('카드가 모두 사라지면 필터도 비운다', () => {
    expect([...pruneCostFilters(new Set([1, 2]), [])]).toEqual([]);
  });
});
