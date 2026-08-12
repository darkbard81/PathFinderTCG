import { ALL_CARD_DEFINITIONS } from './auto-card-catalog';
import type { CardDefinition } from './card-catalog';
import {
  createGameSession as createGameSessionWithCatalog,
  type GameSession,
} from './session-core';
import type { SaveSlotState } from './types';

/**
 * 번들러가 모은 카드 정의를 기본값으로 쓰는 세션 생성기다.
 *
 * 규칙과 변환은 전부 `session-core.ts`에 있고 여기서는 기본 카탈로그만 붙인다.
 * 번들 밖에서 도는 서버는 이 모듈 대신 `session-core.ts`를 직접 쓰고 정의를 넘긴다.
 */
export function createGameSession(
  state: SaveSlotState,
  cardDefinitions: readonly CardDefinition[] = ALL_CARD_DEFINITIONS,
): GameSession {
  return createGameSessionWithCatalog(state, cardDefinitions);
}

export { createSaveSlotStateFromGameSession, findSessionCard } from './session-core';
export type {
  CardCollection,
  CardDefinition,
  DeckInstance,
  EquipmentState,
  GameSession,
  RuntimeCardCollection,
  RuntimeCardInstance,
  RuntimeDeckInstance,
  SaveSlotState,
} from './session-core';
