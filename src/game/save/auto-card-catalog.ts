import { mergeCardDefinitions, type CardDefinition, type CardDefinitionFile } from './card-catalog';

type ViteGlobImportMeta = ImportMeta & {
  glob<T>(pattern: string, options: { eager: true; import: 'default' }): Record<string, T>;
};

/**
 * 덱 파일을 모으는 일은 번들러가 한다.
 *
 * 그래서 이 모듈은 브라우저 번들 안에서만 import 할 수 있다. 번들 밖의 Node 서버는
 * `src/server/card-definition-catalog.ts`가 같은 파일들을 디스크에서 읽어 같은 규칙으로 합친다.
 */
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
