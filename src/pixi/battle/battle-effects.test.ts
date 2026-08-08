import { describe, expect, it } from 'vitest';
import type { BattleTurnEvent } from '../../game/battle/types';
import { readBattleEffectRequest, toBattleEffectRequest } from './battle-effects';

describe('toBattleEffectRequest', () => {
  it('공격은 맞은 칸에서 피해 연출을 낸다', () => {
    expect(
      toBattleEffectRequest({
        type: 'ATTACK',
        attackerInstanceId: 'a',
        targetInstanceId: 'b',
        fromSlotId: 'player:FC',
        toSlotId: 'enemy:FC',
        attack: 4,
      }),
    ).toEqual({ kind: 'damage', slotId: 'enemy:FC', value: 4 });
  });

  it('활성 스킬은 효과 종류에 맞는 연출을 대상 칸에서 낸다', () => {
    const base = {
      type: 'ACTIVE_SKILL',
      cardInstanceId: 'a',
      skillId: 'starlight_mend',
      targetInstanceId: 'b',
      targetSlotId: 'player:FR',
    } as const;

    expect(toBattleEffectRequest({ ...base, effect: 'HEAL', value: 2 })).toEqual({
      kind: 'heal',
      slotId: 'player:FR',
      value: 2,
    });
    expect(toBattleEffectRequest({ ...base, effect: 'DAMAGE', value: 3 })).toEqual({
      kind: 'damage',
      slotId: 'player:FR',
      value: 3,
    });
    expect(toBattleEffectRequest({ ...base, effect: 'BUFF_ATTACK', value: 1 })).toEqual({
      kind: 'buff',
      slotId: 'player:FR',
      value: 1,
    });
  });

  it('배치와 이동은 연출을 내지 않는다', () => {
    // 카드가 나타나거나 자리를 옮기는 것 자체가 이미 피드백이다.
    expect(
      toBattleEffectRequest({
        type: 'PLACE',
        cardInstanceId: 'a',
        fromHandIndex: 0,
        toSlotId: 'player:FC',
        dominance: 3,
        cost: 2,
      }),
    ).toBeNull();
    expect(
      toBattleEffectRequest({
        type: 'MOVE',
        cardInstanceId: 'a',
        fromSlotId: 'player:FC',
        toSlotId: 'player:FL',
      }),
    ).toBeNull();
  });
});

describe('readBattleEffectRequest', () => {
  const attack: BattleTurnEvent = {
    type: 'ACTION',
    side: 'enemy',
    action: {
      type: 'ATTACK',
      attackerInstanceId: 'a',
      targetInstanceId: 'b',
      fromSlotId: 'enemy:FC',
      toSlotId: 'player:FC',
      attack: 5,
    },
  };

  it('행동 이벤트에서 연출을 뽑는다', () => {
    expect(readBattleEffectRequest([attack])).toEqual({
      kind: 'damage',
      slotId: 'player:FC',
      value: 5,
    });
  });

  it('턴 경계 이벤트만 있으면 연출이 없다', () => {
    const events: BattleTurnEvent[] = [
      { type: 'TURN_END', side: 'enemy', nextSide: 'player', reason: 'NO_ACTION' },
      { type: 'TURN_START', side: 'player', drewCardInstanceId: null, deckRemaining: 0 },
    ];

    expect(readBattleEffectRequest(events)).toBeNull();
  });

  it('연출이 없는 행동만 있으면 null이다', () => {
    const events: BattleTurnEvent[] = [
      {
        type: 'ACTION',
        side: 'enemy',
        action: {
          type: 'MOVE',
          cardInstanceId: 'a',
          fromSlotId: 'enemy:FC',
          toSlotId: 'enemy:FL',
        },
      },
    ];

    expect(readBattleEffectRequest(events)).toBeNull();
  });
});
