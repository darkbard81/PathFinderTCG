import type { GameSession } from '../../../game/save/session';
import { resolveStageEnemyDeck } from '../../../game/stage/stage-definitions';
import type { StageDefinition } from '../../../game/stage/types';
import type { BattleRuntimeState } from '../../../game/battle/types';
import { createInitialBattleRuntime } from '../create-battle-runtime';

/**
 * Stage 정의만 주면 전투 런타임을 만드는 테스트용 지름길이다.
 *
 * 서버 런타임은 적 덱을 직접 넣어 받는다. Stage 카탈로그를 읽는 일은 서버 쪽 카탈로그가 맡고
 * 테스트는 번들러가 모아 둔 카탈로그를 쓸 수 있어, 그 차이만 여기서 흡수한다.
 */
export function createTestBattleRuntime(
  session: GameSession,
  stageDefinition: StageDefinition,
  random?: () => number,
): BattleRuntimeState {
  return createInitialBattleRuntime({
    session,
    enemyDeck: resolveStageEnemyDeck(stageDefinition),
    random,
  });
}
