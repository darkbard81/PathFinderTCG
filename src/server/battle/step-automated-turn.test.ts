import { describe, expect, it } from 'vitest';
import { createInitialSaveState } from '../../game/save/create-initial-save';
import { createGameSession, type GameSession } from '../../game/save/session';
import { requireStageDefinition } from '../../game/stage/stage-definitions';
import {
  applyTurnEnd,
  runAutomatedTurnUntilBlockDecision,
  stepAutomatedTurn,
} from './battle-engine';
import { createTestBattleRuntime } from './__fixtures__/create-test-battle-runtime';
import type { BattleRuntimeState, BattleTurnEvent } from '../../game/battle/types';

const TEST_STAGE_DEFINITION = requireStageDefinition('test-stage-dark');
const PRESERVE_DECK_ORDER = () => 0.999_999;

async function createSession(): Promise<GameSession> {
  return createGameSession(await createInitialSaveState({ slotId: 1 }));
}

/**
 * 같은 세션에서 만들어야 두 런타임의 instanceId가 같다.
 * 세션을 새로 만들면 카드마다 새 id가 붙어 이벤트 비교가 id 차이만으로 어긋난다.
 */
function createEnemyTurnRuntime(session: GameSession): BattleRuntimeState {
  const runtime = createTestBattleRuntime(session, TEST_STAGE_DEFINITION, PRESERVE_DECK_ORDER);
  // 내 차례에는 자동 진행이 없다. 적 차례로 넘겨 놓고 검증한다.
  applyTurnEnd(runtime, 'MANUAL');

  return runtime;
}

/**
 * 이벤트에 박힌 instanceId를 등장 순서 토큰으로 바꾼다.
 * 적 덱은 런타임을 만들 때마다 새 id를 받으므로 id 자체는 비교할 수 없다.
 * 같은 카드를 두 번 가리키면 같은 토큰이 되어 동일성 관계는 그대로 남는다.
 */
function normalizeInstanceIds(events: readonly BattleTurnEvent[]): unknown {
  const tokens = new Map<string, string>();
  const toToken = (id: string): string => {
    const existing = tokens.get(id);
    if (existing) {
      return existing;
    }

    const token = `card-${tokens.size}`;
    tokens.set(id, token);
    return token;
  };

  return JSON.parse(
    JSON.stringify(events, (key, value: unknown) =>
      key.endsWith('InstanceId') && typeof value === 'string' ? toToken(value) : value,
    ),
  ) as unknown;
}

/** 한 수씩 진행을 턴이 끝날 때까지 반복한다. */
function runByStep(runtime: BattleRuntimeState): {
  events: BattleTurnEvent[];
  actionCount: number;
} {
  const events: BattleTurnEvent[] = [];
  let actionCount = 0;

  for (;;) {
    const step = stepAutomatedTurn(runtime, 'enemy', { initialActionCount: actionCount });
    events.push(...step.events);
    actionCount = step.actionCount;

    if (step.finished || step.blockDecision) {
      return { events, actionCount };
    }
  }
}

describe('stepAutomatedTurn', () => {
  it('한 번 부르면 행동 하나만 진행한다', async () => {
    const runtime = createEnemyTurnRuntime(await createSession());
    const step = stepAutomatedTurn(runtime, 'enemy');

    expect(step.events.filter((event) => event.type === 'ACTION')).toHaveLength(1);
    expect(step.actionCount).toBe(1);
  });

  it('턴이 끝날 때까지 반복하면 한 번에 돌린 결과와 같다', async () => {
    const session = await createSession();
    const stepped = createEnemyTurnRuntime(session);
    const bulk = createEnemyTurnRuntime(session);

    const byStep = runByStep(stepped);
    const atOnce = runAutomatedTurnUntilBlockDecision(bulk, 'enemy');

    expect(normalizeInstanceIds(byStep.events)).toEqual(normalizeInstanceIds(atOnce.events));
    expect(byStep.actionCount).toBe(atOnce.actionCount);
    expect(stepped.currentSide).toBe(bulk.currentSide);
    expect(stepped.turnNumber).toBe(bulk.turnNumber);
    expect(stepped.battlefield.map((card) => card.battlefieldSlot)).toEqual(
      bulk.battlefield.map((card) => card.battlefieldSlot),
    );
  });

  it('내 차례에는 아무것도 하지 않고 끝났다고 알린다', async () => {
    const runtime = createTestBattleRuntime(
      await createSession(),
      TEST_STAGE_DEFINITION,
      PRESERVE_DECK_ORDER,
    );

    const step = stepAutomatedTurn(runtime, 'enemy');

    expect(step.finished).toBe(true);
    expect(step.events).toEqual([]);
  });

  it('턴이 넘어가면 끝났다고 알린다', async () => {
    const runtime = createEnemyTurnRuntime(await createSession());
    const { events } = runByStep(runtime);

    expect(events.at(-1)?.type).toBe('TURN_START');
    expect(runtime.currentSide).toBe('player');
  });
});
