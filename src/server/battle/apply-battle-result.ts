import type { CardDefinition } from '../../game/save/card-catalog';
import {
  createGameSession,
  createSaveSlotStateFromGameSession,
} from '../../game/save/session-core';
import type { SaveSlotState } from '../../game/save/types';
import { applyStageBattleResultToSession } from '../../game/stage/result';
import type { StageBattleResult } from '../../game/stage/types';

/**
 * 서버가 만든 전투 결과를 저장 슬롯 상태에 반영한다.
 *
 * 보상 카드와 참여 EXP를 실제로 적는 지점이다. 예전에는 브라우저가 이 일을 하고 저장 API로 보냈다.
 * 승패도 보상도 서버가 정하는데 장부만 브라우저가 적을 이유가 없어 서버로 옮겼다.
 */
export function applyBattleResultToSaveSlot(options: {
  state: SaveSlotState;
  result: StageBattleResult;
  cardDefinitions: readonly CardDefinition[];
  now?: Date;
}): SaveSlotState {
  const session = createGameSession(options.state, options.cardDefinitions);

  return createSaveSlotStateFromGameSession(
    applyStageBattleResultToSession(session, options.result),
    options.now ? { now: options.now } : {},
  );
}
