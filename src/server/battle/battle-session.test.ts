import { describe, expect, it } from 'vitest';
import type { BattlePublicState } from '../../game/battle/protocol';
import type { BattleRuntimeState, BattleSlotId } from '../../game/battle/types';
import { createInitialSaveState } from '../../game/save/create-initial-save';
import { createGameSession, type GameSession } from '../../game/save/session';
import { requireStageDefinition, resolveStageEnemyDeck } from '../../game/stage/stage-definitions';
import { createTestBattleRuntime } from './__fixtures__/create-test-battle-runtime';
import { BattleCommandError, BattleSession } from './battle-session';

const STAGE_ID = 'level01';

async function createSession(): Promise<GameSession> {
  return createGameSession(await createInitialSaveState({ slotId: 1 }));
}

function createBattleSession(
  session: GameSession,
  prepare?: (runtime: BattleRuntimeState) => void,
): BattleSession {
  const stageDefinition = requireStageDefinition(STAGE_ID);
  const runtime = createTestBattleRuntime(session, stageDefinition, () => 0);
  prepare?.(runtime);

  return new BattleSession({
    battleId: 'battle-1',
    session,
    stageDefinition,
    enemyDeck: resolveStageEnemyDeck(stageDefinition),
    runtime,
  });
}

function findSlot(state: BattlePublicState, slotId: BattleSlotId) {
  return state.slots.find((slot) => slot.slotId === slotId);
}

describe('BattleSession 공개 상태', () => {
  it('적 손패 내용은 장수만 알려 주고 카드는 담지 않는다', async () => {
    const { state } = createBattleSession(await createSession()).start();

    expect(state.enemy.handCount).toBeGreaterThan(0);
    // 손패는 내 것만 실린다. 적 손패가 실리면 무엇을 들고 있는지 브라우저에서 읽을 수 있다.
    expect(state.hand.every((entry) => entry.card.side === 'player')).toBe(true);
    expect(JSON.stringify(state)).not.toContain('"side":"enemy","zone":"HAND"');
  });

  it('합법 행동을 칸마다 붙여 주므로 클라이언트가 규칙을 다시 세지 않아도 된다', async () => {
    const { state } = createBattleSession(await createSession()).start();
    const leaderSlot = findSlot(state, 'player:BC');

    expect(leaderSlot?.moveSlotIds.length).toBeGreaterThan(0);
    expect(leaderSlot?.ready).toBe(true);
    expect(state.hand.some((entry) => entry.placeSlotIds.length > 0)).toBe(true);
  });
});

describe('BattleSession 합법성 재계산', () => {
  it('후보에 없는 칸으로 옮기려 하면 거절하고 상태를 바꾸지 않는다', async () => {
    const battle = createBattleSession(await createSession());
    const { state } = battle.start();
    const leaderId = findSlot(state, 'player:BC')?.card?.instanceId ?? '';

    // player:BC에서 player:FL은 대각선이라 인접이 아니다.
    expect(() =>
      battle.apply({ type: 'MOVE', cardInstanceId: leaderId, toSlotId: 'player:FL' }),
    ).toThrow(BattleCommandError);
    expect(findSlot(battle.state, 'player:BC')?.card?.instanceId).toBe(leaderId);
    expect(findSlot(battle.state, 'player:FL')?.card).toBeNull();
  });

  it('적 카드로는 어떤 행동도 받지 않는다', async () => {
    const battle = createBattleSession(await createSession());
    const { state } = battle.start();
    const enemyLeaderId = findSlot(state, 'enemy:BC')?.card?.instanceId ?? '';

    expect(() =>
      battle.apply({ type: 'MOVE', cardInstanceId: enemyLeaderId, toSlotId: 'enemy:FC' }),
    ).toThrow(BattleCommandError);
  });

  it('내 차례가 아니면 행동을 받지 않는다', async () => {
    const battle = createBattleSession(await createSession());
    const { state } = battle.start();
    const leaderId = findSlot(state, 'player:BC')?.card?.instanceId ?? '';
    battle.apply({ type: 'END_TURN' });

    expect(() =>
      battle.apply({ type: 'MOVE', cardInstanceId: leaderId, toSlotId: 'player:FC' }),
    ).toThrow(BattleCommandError);
  });

  it('등장 턴에는 공격을 받지 않는다', async () => {
    const battle = createBattleSession(await createSession());
    const { state } = battle.start();
    const leaderId = findSlot(state, 'player:BC')?.card?.instanceId ?? '';

    expect(() =>
      battle.apply({ type: 'ATTACK', attackerInstanceId: leaderId, toSlotId: 'enemy:BC' }),
    ).toThrow(BattleCommandError);
  });

  it('방어를 고를 차례가 아니면 방어 명령을 받지 않는다', async () => {
    const battle = createBattleSession(await createSession());
    battle.start();

    expect(() => battle.apply({ type: 'RESOLVE_BLOCK', blockerInstanceId: null })).toThrow(
      BattleCommandError,
    );
  });
});

describe('BattleSession 자동 진행', () => {
  it('내 차례에 둘 수 있는 수가 없으면 열자마자 턴을 넘기고 자동 진행을 예약한다', async () => {
    const battle = createBattleSession(await createSession(), (runtime) => {
      // 낼 카드도, 옮길 수도, 칠 수도, 쓸 스킬도 없게 해 완전히 막힌 턴으로 만든다.
      runtime.player.hand = [];
      runtime.player.deck = [];
      runtime.player.leader.enteredBattlefieldTurnNumber = runtime.turnNumber;
      runtime.player.leader.hasMovedThisTurn = true;
      runtime.player.leader.hasUsedActiveSkillThisTurn = true;
    });

    const { state, events } = battle.start();

    expect(events.some((event) => event.type === 'TURN_END' && event.reason === 'STALLED')).toBe(
      true,
    );
    expect(state.automationPending).toBe(true);
  });

  it('자동 진행이 남지 않았으면 ADVANCE를 거절한다', async () => {
    const battle = createBattleSession(await createSession());
    battle.start();

    expect(() => battle.apply({ type: 'ADVANCE' })).toThrow(BattleCommandError);
  });

  it('턴을 넘기면 적 차례를 한 행동씩 내보내다가 내 차례에서 멈춘다', async () => {
    const battle = createBattleSession(await createSession());
    battle.start();

    let state = battle.apply({ type: 'END_TURN' }).state;
    expect(state.automationPending).toBe(true);

    for (let step = 0; step < 60 && state.automationPending; step += 1) {
      state = battle.apply({ type: 'ADVANCE' }).state;
    }

    expect(state.automationPending).toBe(false);
    expect(state.currentSide).toBe('player');
    expect(state.turnNumber).toBe(2);
  });
});

describe('BattleSession 승패', () => {
  it('승패가 나면 보상까지 끝난 결과를 상태에 싣고 더는 행동을 받지 않는다', async () => {
    const battle = createBattleSession(await createSession());
    let state = battle.start().state;

    // 아무것도 하지 않고 턴만 넘기면 리더가 맞아 죽어 반드시 결과가 난다.
    for (let turn = 0; turn < 200 && !state.result; turn += 1) {
      if (state.blockPrompt) {
        state = battle.apply({ type: 'RESOLVE_BLOCK', blockerInstanceId: null }).state;
        continue;
      }

      state = state.automationPending
        ? battle.apply({ type: 'ADVANCE' }).state
        : battle.apply({ type: 'END_TURN' }).state;
    }

    expect(state.result?.outcome).toBe('LOSE');
    expect(state.phase).toBe('GAME_OVER');
    expect(() => battle.apply({ type: 'END_TURN' })).toThrow(BattleCommandError);
  });

  it('결과는 한 번만 만든다', async () => {
    const battle = createBattleSession(await createSession());
    let state = battle.start().state;

    for (let turn = 0; turn < 200 && !state.result; turn += 1) {
      if (state.blockPrompt) {
        state = battle.apply({ type: 'RESOLVE_BLOCK', blockerInstanceId: null }).state;
        continue;
      }

      state = state.automationPending
        ? battle.apply({ type: 'ADVANCE' }).state
        : battle.apply({ type: 'END_TURN' }).state;
    }

    // 다시 읽어도 보상 추첨이 다시 돌면 안 된다.
    expect(battle.state.result).toBe(state.result);
  });
});
