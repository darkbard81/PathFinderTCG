import { describe, expect, it } from 'vitest';
import type { BattleRuntimeState, BattleTurnEvent } from '../../game/battle/types';
import { MAX_BATTLE_LOG_LINES, appendBattleLogLines, formatBattleTurnEvents } from './battle-log';
import { formatSlotLabel } from '../../dom/screens/battlefield-layout';

/** 이름 조회만 하면 되므로 필요한 Zone 배열만 갖춘 최소 런타임을 만든다. */
function createRuntime(cards: Record<string, string>): BattleRuntimeState {
  const battlefield = Object.entries(cards).map(([instanceId, name]) => ({
    card: { instance: { instanceId, name } },
  }));

  return {
    battlefield,
    drop: [],
    exile: [],
    player: { hand: [], deck: [] },
    enemy: { hand: [], deck: [] },
  } as unknown as BattleRuntimeState;
}

describe('formatSlotLabel', () => {
  it('진영과 줄과 화면상 열 위치를 우리말로 적는다', () => {
    expect(formatSlotLabel('player:FR')).toBe('내 전위 왼쪽');
    expect(formatSlotLabel('player:FC')).toBe('내 전위 가운데');
    expect(formatSlotLabel('player:FL')).toBe('내 전위 오른쪽');
    expect(formatSlotLabel('enemy:BC')).toBe('적 후위 가운데');
  });
});

describe('formatBattleTurnEvents', () => {
  it('턴 시작에 뽑은 카드 이름과 남은 덱을 적는다', () => {
    const runtime = createRuntime({ 'card-1': '숲의 감시자' });
    const event: BattleTurnEvent = {
      type: 'TURN_START',
      side: 'player',
      drewCardInstanceId: 'card-1',
      deckRemaining: 18,
    };

    expect(formatBattleTurnEvents(runtime, [event])[0]).toBe(
      '나 차례 시작 · 숲의 감시자을(를) 뽑았다 (덱 18)',
    );
  });

  it('덱이 비었으면 뽑지 못했다고 적는다', () => {
    const runtime = createRuntime({});
    const event: BattleTurnEvent = {
      type: 'TURN_START',
      side: 'enemy',
      drewCardInstanceId: null,
      deckRemaining: 0,
    };

    expect(formatBattleTurnEvents(runtime, [event])[0]).toBe(
      '적 차례 시작 · 뽑을 카드가 없다 (덱 0)',
    );
  });

  it('배치와 이동은 대상 칸을 우리말로 적는다', () => {
    const runtime = createRuntime({ 'card-1': '잉걸불 기사' });
    const events: BattleTurnEvent[] = [
      {
        type: 'ACTION',
        side: 'enemy',
        action: {
          type: 'PLACE',
          cardInstanceId: 'card-1',
          fromHandIndex: 0,
          toSlotId: 'enemy:FC',
          dominance: 3,
          cost: 2,
        },
      },
      {
        type: 'ACTION',
        side: 'enemy',
        action: {
          type: 'MOVE',
          cardInstanceId: 'card-1',
          fromSlotId: 'enemy:FC',
          toSlotId: 'enemy:FL',
        },
      },
    ];

    expect(formatBattleTurnEvents(runtime, events)).toEqual([
      '적: 잉걸불 기사을(를) 적 전위 가운데에 냈다',
      '적: 잉걸불 기사을(를) 적 전위 오른쪽(으)로 옮겼다',
    ]);
  });

  it('공격은 양쪽 이름과 피해량을 적는다', () => {
    const runtime = createRuntime({ 'card-1': '그림자 발톱', 'card-2': '철벽 수호자' });
    const event: BattleTurnEvent = {
      type: 'ACTION',
      side: 'enemy',
      action: {
        type: 'ATTACK',
        attackerInstanceId: 'card-1',
        targetInstanceId: 'card-2',
        fromSlotId: 'enemy:FC',
        toSlotId: 'player:FC',
        attack: 4,
      },
    };

    expect(formatBattleTurnEvents(runtime, [event])[0]).toBe(
      '적: 그림자 발톱이(가) 철벽 수호자을(를) 4 피해로 쳤다',
    );
  });

  it('턴 종료 이유를 구분해 적는다', () => {
    const runtime = createRuntime({});
    const events: BattleTurnEvent[] = [
      { type: 'TURN_END', side: 'player', nextSide: 'enemy', reason: 'MANUAL' },
      { type: 'TURN_END', side: 'enemy', nextSide: 'player', reason: 'STALLED' },
      { type: 'ACTION_LIMIT', side: 'enemy', actionCount: 20 },
    ];

    expect(formatBattleTurnEvents(runtime, events)).toEqual([
      '나: 턴을 넘겼다',
      '적: 할 수 있는 행동이 없어 턴이 넘어갔다',
      '적: 한 턴 행동 20회에 도달했다',
    ]);
  });

  it('어느 Zone에서도 못 찾은 카드는 일반 이름으로 적는다', () => {
    const runtime = createRuntime({});
    const event: BattleTurnEvent = {
      type: 'TURN_START',
      side: 'player',
      drewCardInstanceId: 'missing',
      deckRemaining: 1,
    };

    expect(formatBattleTurnEvents(runtime, [event])[0]).toContain('카드을(를) 뽑았다');
  });
});

describe('battle log trimming', () => {
  const line = (n: number): string => `${n}번째 줄`;

  it('keeps every line while under the cap', () => {
    const log = appendBattleLogLines([], [line(1), line(2)]);

    expect(log).toEqual([line(1), line(2)]);
  });

  it('drops the oldest lines once the cap is passed', () => {
    const full = Array.from({ length: MAX_BATTLE_LOG_LINES }, (_, index) => line(index + 1));
    const log = appendBattleLogLines(full, [line(MAX_BATTLE_LOG_LINES + 1)]);

    expect(log).toHaveLength(MAX_BATTLE_LOG_LINES);
    // 가장 오래된 줄이 빠지고 새 줄이 끝에 남는다. 최신 줄이 화면 아래에 쌓이는 순서다.
    expect(log[0]).toBe(line(2));
    expect(log.at(-1)).toBe(line(MAX_BATTLE_LOG_LINES + 1));
  });

  it('keeps only the newest lines when one call overflows the cap', () => {
    const burst = Array.from({ length: MAX_BATTLE_LOG_LINES + 30 }, (_, index) => line(index + 1));
    const log = appendBattleLogLines([line(0)], burst);

    expect(log).toHaveLength(MAX_BATTLE_LOG_LINES);
    expect(log.at(-1)).toBe(line(MAX_BATTLE_LOG_LINES + 30));
  });

  it('does not change the array it was given', () => {
    const original = [line(1)];
    appendBattleLogLines(original, [line(2)]);

    expect(original).toEqual([line(1)]);
  });
});
