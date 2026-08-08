import { isKnownTraitId, sortTraitIds } from '../cards/trait-catalog';

/** card-json-v0.3 이전 카드가 쓰던 `{key, text}` 특성 표현이다. */
type LegacyCardTrait = {
  key: string;
  text: string;
};

/** 구 rarity 코드는 RARITY 특성으로 흡수한다. 미사용이던 SR/EU도 대응 값을 남긴다. */
const LEGACY_RARITY_TRAIT_IDS: Readonly<Record<string, string>> = {
  C: 'common',
  UC: 'uncommon',
  R: 'rare',
  SR: 'rare',
  EU: 'unique',
};

const LEGACY_SIZE_TRAIT_IDS: Readonly<Record<string, string>> = {
  tiny: 'tiny',
  sm: 'small',
  med: 'medium',
  lg: 'large',
  huge: 'huge',
  grg: 'gargantuan',
};

/** PF2e 정본에 없어 특성 체계에서 제외한 구 key다. */
const DROPPED_LEGACY_TRAIT_KEYS = new Set(['role', 'race', 'gender', 'sourceLevel']);

/**
 * 구 특성 표현과 rarity 필드를 canonical trait ID 배열로 옮긴다.
 * 이미 ID 배열인 값에는 정렬과 중복 제거만 적용하므로 반복 호출해도 안전하다.
 */
export function migrateLegacyCardTraits(traits: unknown, rarity?: unknown): string[] {
  const traitIds: string[] = [];

  if (typeof rarity === 'string' && LEGACY_RARITY_TRAIT_IDS[rarity]) {
    traitIds.push(LEGACY_RARITY_TRAIT_IDS[rarity]);
  }

  if (Array.isArray(traits)) {
    for (const trait of traits) {
      traitIds.push(...readTraitIds(trait));
    }
  }

  return sortTraitIds([...new Set(traitIds.filter((traitId) => isKnownTraitId(traitId)))]);
}

/** 저장된 카드가 아직 구 특성 표현이나 rarity 필드를 들고 있는지 판정한다. */
export function needsCardTraitMigration(value: Record<string, unknown>): boolean {
  return (
    'rarity' in value ||
    (Array.isArray(value.traits) && value.traits.some((trait) => typeof trait !== 'string'))
  );
}

function readTraitIds(trait: unknown): string[] {
  if (typeof trait === 'string') {
    return [trait];
  }

  if (!isLegacyCardTrait(trait)) {
    return [];
  }

  if (DROPPED_LEGACY_TRAIT_KEYS.has(trait.key)) {
    return [];
  }

  if (trait.key === 'size') {
    const sizeTraitId = LEGACY_SIZE_TRAIT_IDS[trait.text];
    return sizeTraitId ? [sizeTraitId] : [];
  }

  // creatureType은 쉼표로 이어 붙인 토큰 목록이었다.
  return trait.text.split(',').map((token) => token.trim().toLowerCase());
}

function isLegacyCardTrait(value: unknown): value is LegacyCardTrait {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LegacyCardTrait).key === 'string' &&
    typeof (value as LegacyCardTrait).text === 'string'
  );
}
