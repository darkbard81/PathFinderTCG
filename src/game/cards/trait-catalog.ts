import traitCatalogData from '../../../cards/traits/trait-catalog.json';

export type TraitCategoryId =
  'SIZE' | 'RARITY' | 'TYPE' | 'ANCESTRY / FAMILY' | 'ELEMENT' | 'SPECIAL';

export type TraitCategoryDefinition = {
  id: TraitCategoryId;
  title: string;
  sortOrder: number;
  description: string;
};

export type TraitDefinition = {
  id: string;
  category: TraitCategoryId;
  label: string;
  sortOrder: number;
  description: string;
};

export type TraitCatalogFile = {
  version: string;
  categories: TraitCategoryDefinition[];
  traits: TraitDefinition[];
};

const traitCatalog = traitCatalogData as unknown as TraitCatalogFile;

export const TRAIT_CATALOG_VERSION = traitCatalog.version;
export const TRAIT_CATEGORIES: readonly TraitCategoryDefinition[] = traitCatalog.categories;
export const TRAIT_DEFINITIONS: readonly TraitDefinition[] = traitCatalog.traits;

const TRAIT_DEFINITION_BY_ID = new Map(
  TRAIT_DEFINITIONS.map((definition) => [definition.id, definition]),
);

const CATEGORY_SORT_ORDER = new Map(
  TRAIT_CATEGORIES.map((category) => [category.id, category.sortOrder]),
);

/** 카탈로그에 등록된 특성 정의를 찾는다. 등록되지 않은 ID면 null이다. */
export function findTraitDefinition(traitId: string): TraitDefinition | null {
  return TRAIT_DEFINITION_BY_ID.get(traitId) ?? null;
}

export function isKnownTraitId(traitId: string): boolean {
  return TRAIT_DEFINITION_BY_ID.has(traitId);
}

export function hasTrait(traits: readonly string[], traitId: string): boolean {
  return traits.includes(traitId);
}

export function hasAllTraits(traits: readonly string[], traitIds: readonly string[]): boolean {
  return traitIds.every((traitId) => traits.includes(traitId));
}

export function hasAnyTrait(traits: readonly string[], traitIds: readonly string[]): boolean {
  return traitIds.some((traitId) => traits.includes(traitId));
}

/** 카드의 특성 중 지정한 분류에 속하는 것만 카탈로그 순서대로 돌려준다. */
export function readTraitsByCategory(
  traits: readonly string[],
  category: TraitCategoryId,
): TraitDefinition[] {
  return traits
    .map((traitId) => TRAIT_DEFINITION_BY_ID.get(traitId))
    .filter(
      (definition): definition is TraitDefinition =>
        definition !== undefined && definition.category === category,
    )
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

/**
 * SIZE 특성의 카탈로그 순서를 크기 등급으로 사용한다.
 * 크기 특성이 없으면 -1이라 어떤 크기와 비교해도 작은 쪽이 된다.
 */
export function readSizeRank(traits: readonly string[]): number {
  return readTraitsByCategory(traits, 'SIZE')[0]?.sortOrder ?? -1;
}

/** 특성 ID를 카탈로그가 정한 분류 순서, 분류 내 순서로 정렬한다. */
export function sortTraitIds(traits: readonly string[]): string[] {
  return [...traits].sort((left, right) => readTraitSortKey(left) - readTraitSortKey(right));
}

function readTraitSortKey(traitId: string): number {
  const definition = TRAIT_DEFINITION_BY_ID.get(traitId);
  if (!definition) {
    return Number.MAX_SAFE_INTEGER;
  }

  return (CATEGORY_SORT_ORDER.get(definition.category) ?? 0) * 1000 + definition.sortOrder;
}
