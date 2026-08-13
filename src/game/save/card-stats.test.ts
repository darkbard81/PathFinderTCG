import { describe, expect, it } from 'vitest';
import type { CardDefinition } from './card-catalog';
import { applyExpToRuntimeCard, LEVEL_EXP_THRESHOLDS, MAX_CARD_LEVEL } from './card-growth';
import { calculateCardStatsAtLevel, canonicalizeCardInstance } from './card-stats';
import type { CardInstance } from './types';

const DEFINITION: CardDefinition = {
  id: 'unit_test_001',
  name: '시험 유닛',
  type: 'UNIT',
  traits: ['trait_test'],
  hp: 7,
  attack: 2,
  dominance: 1,
  cost: 2,
  slot: 1,
  level: 1,
  exp: 0,
  abilities: [{ id: 'test_ability', category: 'FRONT', name: '시험', text: '' }],
  growth: {
    lv2: [{ stat: 'hp', value: 1 }],
    lv3: [{ stat: 'attack', value: 1 }],
    lv4: [],
    lv5: [{ stat: 'dominance', value: 1 }],
    lv6: [],
    lv7: [],
    lv8: [],
    lv9: [{ stat: 'slot', value: 1 }],
  },
  description: '',
  note: '',
};

function createInstance(overrides: Partial<CardInstance> = {}): CardInstance {
  return {
    ...structuredClone(DEFINITION),
    instanceId: 'card-1',
    owner: 'PLAYER',
    zone: 'DECK',
    ...overrides,
  };
}

describe('calculateCardStatsAtLevel', () => {
  it('레벨 1은 정의의 기본 수치 그대로다', () => {
    expect(calculateCardStatsAtLevel(DEFINITION, 1)).toEqual({
      hp: 7,
      attack: 2,
      dominance: 1,
      slot: 1,
    });
  });

  it('레벨까지의 성장을 누적한다', () => {
    expect(calculateCardStatsAtLevel(DEFINITION, 5)).toEqual({
      hp: 8,
      attack: 3,
      dominance: 2,
      slot: 1,
    });
  });

  it('최대 레벨을 넘겨 불러도 최대 레벨까지만 자란다', () => {
    expect(calculateCardStatsAtLevel(DEFINITION, MAX_CARD_LEVEL + 5)).toEqual(
      calculateCardStatsAtLevel(DEFINITION, MAX_CARD_LEVEL),
    );
  });

  it('성장이 EXP로 실제로 자란 결과와 같은 값을 낸다', () => {
    // 성장 계산기와 이 함수가 갈라지면 정상 성장이 조작으로 보인다.
    const grown = applyExpToRuntimeCard(
      { instance: createInstance(), definition: DEFINITION },
      LEVEL_EXP_THRESHOLDS[3]!,
    );
    const stats = calculateCardStatsAtLevel(DEFINITION, grown.result.nextLevel);

    expect({
      hp: grown.card.instance.hp,
      attack: grown.card.instance.attack,
      dominance: grown.card.instance.dominance,
      slot: grown.card.instance.slot,
    }).toEqual(stats);
  });
});

describe('canonicalizeCardInstance', () => {
  it('조작한 수치를 정의와 레벨에서 다시 계산한 값으로 덮는다', () => {
    const tampered = createInstance({ hp: 9999, attack: 9999, dominance: 99, slot: 99 });

    expect(canonicalizeCardInstance(tampered, DEFINITION)).toMatchObject({
      hp: 7,
      attack: 2,
      dominance: 1,
      slot: 1,
      level: 1,
    });
  });

  it('조작한 성장표를 쓰지 않고 정의의 성장표를 쓴다', () => {
    const tampered = createInstance({
      exp: LEVEL_EXP_THRESHOLDS[0],
      growth: { ...DEFINITION.growth!, lv2: [{ stat: 'attack', value: 500 }] },
    });
    const canonical = canonicalizeCardInstance(tampered, DEFINITION);

    expect(canonical.level).toBe(2);
    expect(canonical.attack).toBe(2);
    expect(canonical.hp).toBe(8);
    expect(canonical.growth).toEqual(DEFINITION.growth);
  });

  it('이름·특성·능력·코스트도 정의에서 다시 가져온다', () => {
    const tampered = createInstance({
      name: '내가 지은 이름',
      cost: 0,
      traits: ['trait_forged'],
      abilities: [{ id: 'guardian_block', category: 'GLOBAL', name: '훔친 능력', text: '' }],
    });

    expect(canonicalizeCardInstance(tampered, DEFINITION)).toMatchObject({
      name: '시험 유닛',
      cost: 2,
      traits: ['trait_test'],
      abilities: DEFINITION.abilities,
    });
  });

  it('레벨은 저장본 값이 아니라 EXP에서 나온다', () => {
    const tampered = createInstance({ exp: 0, level: MAX_CARD_LEVEL });

    expect(canonicalizeCardInstance(tampered, DEFINITION).level).toBe(1);
  });

  it('소유자가 정하는 값은 그대로 둔다', () => {
    const instance = createInstance({
      instanceId: 'card-42',
      zone: 'COLLECTION',
      exp: LEVEL_EXP_THRESHOLDS[0],
    });
    const canonical = canonicalizeCardInstance(instance, DEFINITION);

    expect(canonical.instanceId).toBe('card-42');
    expect(canonical.owner).toBe('PLAYER');
    expect(canonical.zone).toBe('COLLECTION');
    expect(canonical.exp).toBe(LEVEL_EXP_THRESHOLDS[0]);
  });

  it('EXP가 정수가 아니거나 음수면 정의 기본값으로 되돌린다', () => {
    expect(canonicalizeCardInstance(createInstance({ exp: -5 }), DEFINITION).exp).toBe(0);
    expect(
      canonicalizeCardInstance(createInstance({ exp: 1.5 as unknown as number }), DEFINITION).exp,
    ).toBe(0);
  });

  it('정의에도 성장에도 없는 수치는 필드를 만들지 않는다', () => {
    const { dominance, slot, growth, ...leaderLike } = DEFINITION;
    const definition: CardDefinition = { ...leaderLike, type: 'LEADER' };
    const canonical = canonicalizeCardInstance(createInstance({ dominance: 9 }), definition);

    expect(canonical).not.toHaveProperty('dominance');
    expect(canonical).not.toHaveProperty('slot');
    // 사용하지 않는 구조 분해 결과를 참조해 린트 경고를 피한다.
    expect([dominance, slot, growth]).toHaveLength(3);
  });
});
