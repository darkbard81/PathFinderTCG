import { describe, expect, it } from 'vitest';
import { readBattleCommand } from './battle-api';

describe('readBattleCommand', () => {
  it('행동 의도만 읽고 함께 실려 온 상태는 전부 버린다', () => {
    // 브라우저가 HP나 턴을 실어 보내도 서버가 읽는 자리가 없다는 것이 이 경계의 요점이다.
    const command = readBattleCommand({
      action: {
        type: 'ATTACK',
        attackerInstanceId: 'card-1',
        toSlotId: 'enemy:FC',
        attack: 9999,
        targetInstanceId: 'card-2',
        runtime: { turnNumber: 99 },
      },
    });

    expect(command).toEqual({
      type: 'ATTACK',
      attackerInstanceId: 'card-1',
      toSlotId: 'enemy:FC',
    });
  });

  it('배치와 이동도 카드와 칸만 읽는다', () => {
    expect(
      readBattleCommand({
        action: { type: 'PLACE', cardInstanceId: 'card-1', toSlotId: 'player:FC', cost: 0 },
      }),
    ).toEqual({ type: 'PLACE', cardInstanceId: 'card-1', toSlotId: 'player:FC' });
    expect(
      readBattleCommand({
        action: { type: 'MOVE', cardInstanceId: 'card-1', toSlotId: 'player:FL' },
      }),
    ).toEqual({ type: 'MOVE', cardInstanceId: 'card-1', toSlotId: 'player:FL' });
  });

  it('활성 스킬은 효과와 값을 클라이언트에서 받지 않는다', () => {
    expect(
      readBattleCommand({
        action: {
          type: 'ACTIVE_SKILL',
          cardInstanceId: 'card-1',
          skillId: 'starlight_mend',
          targetSlotId: 'player:FR',
          effect: 'DAMAGE',
          value: 99,
        },
      }),
    ).toEqual({
      type: 'ACTIVE_SKILL',
      cardInstanceId: 'card-1',
      skillId: 'starlight_mend',
      targetSlotId: 'player:FR',
    });
  });

  it('턴 종료·자동 진행·방어는 여벌 값이 없다', () => {
    expect(readBattleCommand({ action: { type: 'END_TURN' } })).toEqual({ type: 'END_TURN' });
    expect(readBattleCommand({ action: { type: 'ADVANCE' } })).toEqual({ type: 'ADVANCE' });
    expect(
      readBattleCommand({ action: { type: 'RESOLVE_BLOCK', blockerInstanceId: null } }),
    ).toEqual({ type: 'RESOLVE_BLOCK', blockerInstanceId: null });
  });

  it('전장에 없는 칸 이름은 거절한다', () => {
    expect(() =>
      readBattleCommand({
        action: { type: 'MOVE', cardInstanceId: 'card-1', toSlotId: 'player:XX' },
      }),
    ).toThrow(/Invalid battle slot id/);
  });

  it('모르는 행동 종류는 거절한다', () => {
    expect(() => readBattleCommand({ action: { type: 'SET_HP', value: 1 } })).toThrow(
      /Unsupported battle action type/,
    );
  });

  it('본문이 객체가 아니면 거절한다', () => {
    expect(() => readBattleCommand(null)).toThrow(/must be an object/);
    expect(() => readBattleCommand({ action: 'ATTACK' })).toThrow(/must be an object/);
  });
});
