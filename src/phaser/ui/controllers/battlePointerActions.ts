import type { BattleFieldPosition, StableId } from '../../../game/data/index.js';
import type { BattleAction } from '../../../game/simulation/battle/index.js';

export type DirectBattleIntent =
  | {
      readonly type: 'PLACE';
      readonly cardId: StableId;
      readonly fieldPosition: BattleFieldPosition;
    }
  | {
      readonly type: 'MOVE';
      readonly cardId: StableId;
      readonly fieldPosition: BattleFieldPosition;
    }
  | { readonly type: 'ATTACK'; readonly cardId: StableId; readonly targetCardId: StableId }
  | { readonly type: 'ACTIVE'; readonly cardId: StableId; readonly targetCardId?: StableId }
  | { readonly type: 'END_TURN' };

/**
 * 포인터 의도에 정확히 대응하는 합법 Action을 찾는다.
 */
export function findDirectBattleAction(
  actions: readonly BattleAction[],
  intent: DirectBattleIntent,
): BattleAction | undefined {
  return actions.find((action) => {
    switch (action.type) {
      case 'END_TURN':
        return intent.type === 'END_TURN';
      case 'PLACE':
        return (
          intent.type === 'PLACE' &&
          action.cardId === intent.cardId &&
          action.fieldPosition === intent.fieldPosition
        );
      case 'MOVE':
        return (
          intent.type === 'MOVE' &&
          action.cardId === intent.cardId &&
          action.fieldPosition === intent.fieldPosition
        );
      case 'ATTACK':
        return (
          intent.type === 'ATTACK' &&
          action.cardId === intent.cardId &&
          action.targetCardId === intent.targetCardId
        );
      case 'ACTIVE':
        return (
          intent.type === 'ACTIVE' &&
          action.cardId === intent.cardId &&
          action.targetCardId === intent.targetCardId
        );
    }
  });
}

export function getDirectActiveSkillSourceIds(
  actions: readonly BattleAction[],
): readonly StableId[] {
  return Object.freeze([
    ...new Set(actions.flatMap((action) => (action.type === 'ACTIVE' ? [action.cardId] : []))),
  ]);
}

export interface DirectCardTargets {
  readonly fieldPositions: readonly BattleFieldPosition[];
  readonly targetCardIds: readonly StableId[];
}

export function getDirectCardTargets(
  actions: readonly BattleAction[],
  cardId: StableId,
  activeSkillSourceCardId?: StableId,
): DirectCardTargets {
  const fieldPositions: BattleFieldPosition[] = [];
  const targetCardIds: StableId[] = [];

  for (const action of actions) {
    if (activeSkillSourceCardId !== undefined) {
      if (
        action.type === 'ACTIVE' &&
        action.cardId === activeSkillSourceCardId &&
        action.targetCardId !== undefined
      ) {
        targetCardIds.push(action.targetCardId);
      }
      continue;
    }

    switch (action.type) {
      case 'PLACE':
        if (action.cardId === cardId) {
          fieldPositions.push(action.fieldPosition);
        }
        break;
      case 'MOVE':
        if (action.cardId === cardId) {
          fieldPositions.push(action.fieldPosition);
        }
        break;
      case 'ATTACK':
        if (action.cardId === cardId) {
          targetCardIds.push(action.targetCardId);
        }
        break;
      case 'ACTIVE':
      case 'END_TURN':
        break;
    }
  }

  return Object.freeze({
    fieldPositions: Object.freeze([...new Set(fieldPositions)]),
    targetCardIds: Object.freeze([...new Set(targetCardIds)]),
  });
}
