import type { CardDefinition } from './card-catalog';
import { MAX_CARD_LEVEL, calculateCardLevelFromExp } from './card-growth';
import type { CardInstance } from './types';

/** 레벨에 따라 자라는 수치다. 성장표(`CardGrowthValue.stat`)가 건드릴 수 있는 값과 같다. */
export const CARD_STAT_KEYS = ['hp', 'attack', 'dominance', 'slot'] as const;

export type CardStatKey = (typeof CARD_STAT_KEYS)[number];

export type CardStats = Partial<Record<CardStatKey, number | undefined>>;

/**
 * 카드 정의의 기본 수치에 지정한 레벨까지의 성장을 더한다.
 *
 * 성장표는 정의에서만 읽는다. 저장본이 들고 있는 성장표는 쓰지 않는다.
 * 그 표까지 저장본을 믿으면 수치를 검사하는 의미가 없다.
 */
export function calculateCardStatsAtLevel(definition: CardDefinition, level: number): CardStats {
  const stats: CardStats = {
    hp: definition.hp,
    attack: definition.attack,
    dominance: definition.dominance,
    slot: definition.slot,
  };

  const targetLevel = Math.min(Math.max(1, level), MAX_CARD_LEVEL);
  for (let current = 2; current <= targetLevel; current += 1) {
    for (const growth of definition.growth?.[`lv${current}` as keyof typeof definition.growth] ??
      []) {
      stats[growth.stat] = (stats[growth.stat] ?? 0) + growth.value;
    }
  }

  return stats;
}

/**
 * 저장된 카드 한 장을 카탈로그 정의 기준으로 되돌린다.
 *
 * 소유자가 정하는 값은 `instanceId`·`owner`·`zone`·`exp`뿐이다. 레벨은 EXP에서 나오고,
 * 수치·이름·특성·능력·코스트·성장표는 전부 정의에서 나온다. 저장본이 다른 값을 들고 와도 여기서 덮인다.
 *
 * 검사해서 거절하지 않고 다시 계산해 덮는 이유는 두 가지다. 카드 데이터를 고치면 기존 저장본이
 * 정당하게 어긋나는데 그때마다 저장을 막으면 판을 못 이어 간다. 그리고 이미 조작된 저장본도
 * 다음 저장에서 저절로 제자리로 돌아온다.
 */
export function canonicalizeCardInstance(
  instance: CardInstance,
  definition: CardDefinition,
): CardInstance {
  const exp = readNonNegativeInteger(instance.exp, definition.exp ?? 0);
  const level = calculateCardLevelFromExp(exp);
  const stats = calculateCardStatsAtLevel(definition, level);

  const canonical: CardInstance = {
    ...structuredClone(definition),
    level,
    exp,
    // 카드 인스턴스는 hp와 attack을 항상 정수로 들고 있다. 정의에 없으면 0이다.
    hp: stats.hp ?? 0,
    attack: stats.attack ?? 0,
    instanceId: instance.instanceId,
    owner: instance.owner,
    zone: instance.zone,
  };

  // 지배력과 슬롯은 없는 카드가 있다. 정의에도 성장에도 없으면 필드를 만들지 않는다.
  assignOptionalStat(canonical, 'dominance', stats.dominance);
  assignOptionalStat(canonical, 'slot', stats.slot);

  return canonical;
}

function assignOptionalStat(
  instance: CardInstance,
  key: 'dominance' | 'slot',
  value: number | undefined,
): void {
  if (value === undefined) {
    delete instance[key];
    return;
  }

  instance[key] = value;
}

function readNonNegativeInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : fallback;
}
