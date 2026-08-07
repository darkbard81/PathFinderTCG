import type { CardDefinition, CardDefinitionFile } from './card-catalog';

type ViteGlobImportMeta = ImportMeta & {
  glob<T>(pattern: string, options: { eager: true; import: 'default' }): Record<string, T>;
};

const deckDefinitionData = (import.meta as ViteGlobImportMeta).glob<unknown>(
  '../../../cards/deck_*.json',
  {
    eager: true,
    import: 'default',
  },
);

/** cards/deck_*.json에서 자동 발견한 전체 카드 정의다. */
export const ALL_CARD_DEFINITIONS: readonly CardDefinition[] = mergeCardDefinitions(
  Object.entries(deckDefinitionData)
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
    .map(([, definition]) => (definition as CardDefinitionFile).cards),
);

/** 여러 덱의 카드 정의를 ID 기준으로 합치고 뒤에 발견된 정의를 우선한다. */
function mergeCardDefinitions(definitionGroups: CardDefinition[][]): CardDefinition[] {
  const definitions = new Map<string, CardDefinition>();
  for (const group of definitionGroups) {
    for (const definition of group) {
      definitions.set(definition.id, definition);
    }
  }

  return Array.from(definitions.values());
}
