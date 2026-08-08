import type {
  BattleRuntimeState,
  BattleTurnEndReason,
  BattleTurnEvent,
} from '../../game/battle/types';
import { formatSlotLabel } from './battlefield-layout';

const SIDE_LABELS = { player: '나', enemy: '적' } as const;

const TURN_END_REASONS: Record<BattleTurnEndReason, string> = {
  MANUAL: '턴을 넘겼다',
  STALLED: '할 수 있는 행동이 없어 턴이 넘어갔다',
  NO_ACTION: '더 둘 수가 없어 턴이 넘어갔다',
  ACTION_LIMIT: '행동 제한에 걸려 턴이 넘어갔다',
};

/**
 * 전투 이벤트를 로그 줄로 바꾼다.
 * 카드 이름은 이벤트가 아니라 지금 런타임에서 찾는다.
 * 파괴된 카드도 묘지에 남아 있어 공격 결과까지 이름으로 읽을 수 있다.
 */
export function formatBattleTurnEvents(
  runtime: BattleRuntimeState,
  events: readonly BattleTurnEvent[],
): string[] {
  return events.map((event) => formatBattleTurnEvent(runtime, event));
}

function formatBattleTurnEvent(runtime: BattleRuntimeState, event: BattleTurnEvent): string {
  const side = SIDE_LABELS[event.side];

  if (event.type === 'TURN_START') {
    const drew = event.drewCardInstanceId
      ? `${readCardName(runtime, event.drewCardInstanceId)}을(를) 뽑았다`
      : '뽑을 카드가 없다';
    return `${side} 차례 시작 · ${drew} (덱 ${event.deckRemaining})`;
  }

  if (event.type === 'TURN_END') {
    return `${side}: ${TURN_END_REASONS[event.reason]}`;
  }

  if (event.type === 'ACTION_LIMIT') {
    return `${side}: 한 턴 행동 ${event.actionCount}회에 도달했다`;
  }

  const { action } = event;
  if (action.type === 'PLACE') {
    return `${side}: ${readCardName(runtime, action.cardInstanceId)}을(를) ${formatSlotLabel(action.toSlotId)}에 냈다`;
  }

  if (action.type === 'MOVE') {
    return `${side}: ${readCardName(runtime, action.cardInstanceId)}을(를) ${formatSlotLabel(action.toSlotId)}(으)로 옮겼다`;
  }

  return `${side}: ${readCardName(runtime, action.attackerInstanceId)}이(가) ${readCardName(runtime, action.targetInstanceId)}을(를) ${action.attack} 피해로 쳤다`;
}

/** 인스턴스 id로 카드 이름을 찾는다. 어느 Zone에 있든 찾을 수 있게 전부 훑는다. */
export function readCardName(runtime: BattleRuntimeState, instanceId: string): string {
  const pools = [
    runtime.battlefield,
    runtime.drop,
    runtime.exile,
    runtime.player.hand,
    runtime.player.deck,
    runtime.enemy.hand,
    runtime.enemy.deck,
  ];

  for (const pool of pools) {
    const found = pool.find((card) => card.card.instance.instanceId === instanceId);
    if (found) {
      return found.card.instance.name;
    }
  }

  return '카드';
}
