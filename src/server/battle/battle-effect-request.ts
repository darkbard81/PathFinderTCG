import type { BattleEffectRequest } from '../../game/battle/protocol';
import type { ActiveSkillBattleEffect, BattleTurnEvent } from '../../game/battle/types';

const SKILL_EFFECT_KINDS: Record<ActiveSkillBattleEffect, BattleEffectRequest['kind']> = {
  HEAL: 'heal',
  DAMAGE: 'damage',
  BUFF_ATTACK: 'buff',
};

/**
 * 이벤트가 낼 연출을 정한다.
 *
 * 배치와 이동은 카드가 나타나거나 자리를 옮기는 것 자체가 이미 피드백이라 연출을 내지 않는다.
 * 막힌 공격은 원래 대상이 아니라 막은 칸에서 나야 하므로 여기서 칸을 바꿔 준다.
 */
export function toBattleEffectRequests(events: readonly BattleTurnEvent[]): BattleEffectRequest[] {
  // 막힌 공격은 선언과 방어가 함께 들어온다. 선언 쪽 연출을 빼야 한 대만 맞는다.
  const blockedAttacks = new Set(
    events.flatMap((event) => (event.type === 'BLOCK' ? [event.action.attackAction] : [])),
  );

  return events.flatMap((event): BattleEffectRequest[] => {
    if (event.type === 'ACTION' && event.action.type === 'ATTACK') {
      if (blockedAttacks.has(event.action)) {
        return [];
      }

      return [{ kind: 'damage', slotId: event.action.toSlotId, value: event.action.attack }];
    }

    if (event.type === 'ACTIVE_SKILL') {
      return [
        {
          kind: SKILL_EFFECT_KINDS[event.action.effect],
          slotId: event.action.targetSlotId,
          value: event.action.value,
        },
      ];
    }

    if (event.type === 'BLOCK') {
      return [
        {
          kind: 'damage',
          slotId: event.action.blockerSlotId,
          value: event.action.attackAction.attack,
        },
      ];
    }

    return [];
  });
}
