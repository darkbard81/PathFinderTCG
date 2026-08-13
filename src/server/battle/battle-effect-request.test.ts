import { describe, expect, it } from 'vitest';
import type { AttackBattleAction, BattleTurnEvent } from '../../game/battle/types';
import { toBattleEffectRequests } from './battle-effect-request';

describe('toBattleEffectRequests', () => {
  const attackAction: AttackBattleAction = {
    type: 'ATTACK',
    attackerInstanceId: 'a',
    targetInstanceId: 'b',
    fromSlotId: 'player:FC',
    toSlotId: 'enemy:FC',
    attack: 4,
  };

  it('공격은 맞은 칸에서 피해 연출을 낸다', () => {
    expect(
      toBattleEffectRequests([{ type: 'ACTION', side: 'player', action: attackAction }]),
    ).toEqual([{ kind: 'damage', slotId: 'enemy:FC', value: 4 }]);
  });

  it('활성 스킬은 효과 종류에 맞는 연출을 대상 칸에서 낸다', () => {
    const base = {
      type: 'ACTIVE_SKILL',
      cardInstanceId: 'a',
      skillId: 'starlight_mend',
      targetInstanceId: 'b',
      targetSlotId: 'player:FR',
    } as const;

    const kinds = (['HEAL', 'DAMAGE', 'BUFF_ATTACK'] as const).map(
      (effect) =>
        toBattleEffectRequests([
          { type: 'ACTIVE_SKILL', side: 'player', action: { ...base, effect, value: 2 } },
        ])[0],
    );

    expect(kinds).toEqual([
      { kind: 'heal', slotId: 'player:FR', value: 2 },
      { kind: 'damage', slotId: 'player:FR', value: 2 },
      { kind: 'buff', slotId: 'player:FR', value: 2 },
    ]);
  });

  it('배치와 이동은 연출을 내지 않는다', () => {
    // 카드가 나타나거나 자리를 옮기는 것 자체가 이미 피드백이다.
    const events: BattleTurnEvent[] = [
      {
        type: 'ACTION',
        side: 'player',
        action: {
          type: 'PLACE',
          cardInstanceId: 'a',
          fromHandIndex: 0,
          toSlotId: 'player:FC',
          dominance: 3,
          cost: 2,
        },
      },
      {
        type: 'ACTION',
        side: 'player',
        action: {
          type: 'MOVE',
          cardInstanceId: 'a',
          fromSlotId: 'player:FC',
          toSlotId: 'player:FL',
        },
      },
    ];

    expect(toBattleEffectRequests(events)).toEqual([]);
  });

  it('턴 경계 이벤트만 있으면 연출이 없다', () => {
    const events: BattleTurnEvent[] = [
      { type: 'TURN_END', side: 'enemy', nextSide: 'player', reason: 'NO_ACTION' },
      { type: 'TURN_START', side: 'player', drewCardInstanceId: null, deckRemaining: 0 },
    ];

    expect(toBattleEffectRequests(events)).toEqual([]);
  });

  it('막힌 공격은 원래 대상이 아니라 막은 칸에서 한 번만 난다', () => {
    const events: BattleTurnEvent[] = [
      { type: 'ACTION', side: 'player', action: attackAction },
      {
        type: 'BLOCK',
        side: 'enemy',
        action: {
          type: 'BLOCK',
          attackAction,
          blockerInstanceId: 'c',
          blockerSlotId: 'enemy:FL',
        },
      },
    ];

    expect(toBattleEffectRequests(events)).toEqual([
      { kind: 'damage', slotId: 'enemy:FL', value: 4 },
    ]);
  });
});
