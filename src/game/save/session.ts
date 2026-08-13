import { createGameSessionFromSaveInstances, type GameSession } from './session-core';
import type { SaveSlotState } from './types';

/**
 * 저장 인스턴스에서 카드 정의를 만들어 세션을 연다.
 *
 * 규칙과 변환은 `session-core.ts`에 있다. 브라우저는 카드 JSON을 번들에 넣지 않고,
 * 서버가 맞춰 둔 인스턴스 필드만 화면 정의로 쓴다. 번들 밖에서 도는 서버는 이 모듈 대신
 * `session-core.ts`를 직접 쓰고 카탈로그 정의를 넘긴다.
 */
export function createGameSession(state: SaveSlotState): GameSession {
  return createGameSessionFromSaveInstances(state);
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
