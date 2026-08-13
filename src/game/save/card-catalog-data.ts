import darkDeckDefinitionData from '../../../cards/deck_dark.json';
import deckDefinitionData from '../../../cards/deck_test.json';
import { mergeCardDefinitions, type CardDefinition, type CardDefinitionFile } from './card-catalog';

/**
 * 스타터 덱과 테스트용 적 덱 JSON을 값으로 읽는다.
 *
 * 브라우저 번들에는 넣지 않는다. 초기 저장 생성과 서버·테스트만 이 모듈을 import 한다.
 */
const deckDefinition = deckDefinitionData as unknown as CardDefinitionFile;
const darkDeckDefinition = darkDeckDefinitionData as unknown as CardDefinitionFile;

export const CARD_DEFINITIONS: CardDefinition[] = deckDefinition.cards;
export const KNOWN_CARD_DEFINITIONS: CardDefinition[] = mergeCardDefinitions([
  deckDefinition.cards,
  darkDeckDefinition.cards,
]);
