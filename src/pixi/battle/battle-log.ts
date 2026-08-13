import type { BattleTurnEndReason, BattleTurnEvent } from '../../game/battle/types';
import { formatSlotLabel } from '../../dom/screens/battlefield-layout';

/**
 * 기록에 남기는 최대 줄 수다.
 *
 * 화면은 스크롤되지만 배열과 <li>는 판이 길어질수록 끝없이 쌓인다.
 * 오래된 줄부터 버린다. 지난 수를 되짚는 용도라 최근 것만 있으면 된다.
 */
export const MAX_BATTLE_LOG_LINES = 100;

/**
 * 이벤트에 나온 카드의 인스턴스 id에서 이름을 찾는 표다.
 * 서버가 이벤트와 함께 내려 준다. 화면은 전투 상태 전체를 갖지 않으므로 여기서만 이름을 읽는다.
 */
export type BattleCardNames = Readonly<Record<string, string>>;

const SIDE_LABELS = { player: '나', enemy: '적' } as const;

const TURN_END_REASONS: Record<BattleTurnEndReason, string> = {
  MANUAL: '턴을 넘겼다',
  STALLED: '할 수 있는 행동이 없어 턴이 넘어갔다',
  NO_ACTION: '더 둘 수가 없어 턴이 넘어갔다',
  ACTION_LIMIT: '행동 제한에 걸려 턴이 넘어갔다',
};

/** 전투 이벤트를 로그 줄로 바꾼다. */
export function formatBattleTurnEvents(
  names: BattleCardNames,
  events: readonly BattleTurnEvent[],
): string[] {
  return events.map((event) => formatBattleTurnEvent(names, event));
}

function formatBattleTurnEvent(names: BattleCardNames, event: BattleTurnEvent): string {
  const side = SIDE_LABELS[event.side];

  if (event.type === 'TURN_START') {
    const drew = event.drewCardInstanceId
      ? `${readCardName(names, event.drewCardInstanceId)}을(를) 뽑았다`
      : '뽑을 카드가 없다';
    return `${side} 차례 시작 · ${drew} (덱 ${event.deckRemaining})`;
  }

  if (event.type === 'TURN_END') {
    return `${side}: ${TURN_END_REASONS[event.reason]}`;
  }

  if (event.type === 'ACTION_LIMIT') {
    return `${side}: 한 턴 행동 ${event.actionCount}회에 도달했다`;
  }

  if (event.type === 'ACTIVE_SKILL') {
    const { action } = event;
    return `${side}: ${readCardName(names, action.cardInstanceId)}이(가) ${readCardName(names, action.targetInstanceId)}에게 스킬을 ${action.value}만큼 썼다`;
  }

  if (event.type === 'BLOCK') {
    const { action } = event;
    return `${side}: ${readCardName(names, action.blockerInstanceId)}이(가) ${readCardName(names, action.attackAction.targetInstanceId)} 대신 맞았다`;
  }

  const { action } = event;
  if (action.type === 'PLACE') {
    return `${side}: ${readCardName(names, action.cardInstanceId)}을(를) ${formatSlotLabel(action.toSlotId)}에 냈다`;
  }

  if (action.type === 'MOVE') {
    return `${side}: ${readCardName(names, action.cardInstanceId)}을(를) ${formatSlotLabel(action.toSlotId)}(으)로 옮겼다`;
  }

  return `${side}: ${readCardName(names, action.attackerInstanceId)}이(가) ${readCardName(names, action.targetInstanceId)}을(를) ${action.attack} 피해로 쳤다`;
}

/** 인스턴스 id로 카드 이름을 읽는다. 서버가 이름을 안 준 카드는 일반 이름으로 적는다. */
export function readCardName(names: BattleCardNames, instanceId: string): string {
  return names[instanceId] ?? '카드';
}

/** 기록 뒤에 줄을 붙이고 상한을 넘은 만큼 앞에서 버린다. */
export function appendBattleLogLines(log: readonly string[], lines: readonly string[]): string[] {
  return [...log, ...lines].slice(-MAX_BATTLE_LOG_LINES);
}
