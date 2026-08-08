import { describe, expect, it } from 'vitest';
import type { CardTile } from './card-tile';
import {
  buildCostFilters,
  filterTilesByCost,
  pruneCostFilters,
  toggleCostFilter,
} from './card-workbench';

function tile(instanceId: string, cost: number | null): CardTile {
  return {
    instanceId,
    cardId: instanceId,
    name: instanceId,
    cost,
    dominance: null,
    attack: null,
    hp: null,
    level: null,
    artUrl: '',
    badgeBaseUrl: '',
  };
}

function entry(instanceId: string, cost: number | null): { tile: CardTile } {
  return { tile: tile(instanceId, cost) };
}

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

describe('filterTilesByCost', () => {
  it('선택이 없으면 전체를 돌려준다', () => {
    const entries = [entry('a', 1), entry('b', null)];

    expect(filterTilesByCost(entries, new Set()).map((item) => item.tile.instanceId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('필터가 걸리면 코스트 없는 카드는 숨긴다', () => {
    const entries = [entry('a', 1), entry('b', 2), entry('c', null)];

    expect(filterTilesByCost(entries, new Set([1])).map((item) => item.tile.instanceId)).toEqual([
      'a',
    ]);
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
    expect([...pruneCostFilters(new Set([1, 5]), [tile('a', 1)])]).toEqual([1]);
  });

  it('카드가 모두 사라지면 필터도 비운다', () => {
    expect([...pruneCostFilters(new Set([1, 2]), [])]).toEqual([]);
  });
});
