import type { BattleFieldPosition, StableId } from '../../../game/data/index.js';
import type { BattleAction } from '../../../game/simulation/battle/index.js';

export type DirectBattleIntent =
  | { readonly type: 'DRAW' }
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
  | { readonly type: 'DISCARD'; readonly cardId: StableId }
  | { readonly type: 'END_TURN' };

function activeSourceOf(action: BattleAction): StableId | undefined {
  return 'activeSkillSourceCardId' in action ? action.activeSkillSourceCardId : undefined;
}

/**
 * 포인터 의도와 선택한 Active Skill source에 정확히 대응하는 합법 Action을 찾는다.
 */
export function findDirectBattleAction(
  actions: readonly BattleAction[],
  intent: DirectBattleIntent,
  activeSkillSourceCardId?: StableId,
): BattleAction | undefined {
  return actions.find((action) => {
    switch (action.type) {
      case 'DRAW':
        return intent.type === 'DRAW' && activeSourceOf(action) === activeSkillSourceCardId;
      case 'END_TURN':
        return intent.type === 'END_TURN' && activeSourceOf(action) === activeSkillSourceCardId;
      case 'PLACE':
        return (
          intent.type === 'PLACE' &&
          action.cardId === intent.cardId &&
          action.fieldPosition === intent.fieldPosition &&
          activeSourceOf(action) === activeSkillSourceCardId
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
      case 'DISCARD':
        return (
          intent.type === 'DISCARD' &&
          action.cardId === intent.cardId &&
          activeSourceOf(action) === activeSkillSourceCardId
        );
    }
  });
}

export function getDirectActiveSkillSourceIds(
  actions: readonly BattleAction[],
): readonly StableId[] {
  return Object.freeze([
    ...new Set(
      actions.map(activeSourceOf).filter((cardId): cardId is StableId => cardId !== undefined),
    ),
  ]);
}

export interface DirectCardTargets {
  readonly fieldPositions: readonly BattleFieldPosition[];
  readonly targetCardIds: readonly StableId[];
  readonly canDiscard: boolean;
}

export function getDirectCardTargets(
  actions: readonly BattleAction[],
  cardId: StableId,
  activeSkillSourceCardId?: StableId,
): DirectCardTargets {
  const fieldPositions: BattleFieldPosition[] = [];
  const targetCardIds: StableId[] = [];
  let canDiscard = false;

  for (const action of actions) {
    switch (action.type) {
      case 'PLACE':
        if (action.cardId === cardId && activeSourceOf(action) === activeSkillSourceCardId) {
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
      case 'DISCARD':
        if (action.cardId === cardId && activeSourceOf(action) === activeSkillSourceCardId) {
          canDiscard = true;
        }
        break;
      case 'DRAW':
      case 'END_TURN':
        break;
    }
  }

  return Object.freeze({
    fieldPositions: Object.freeze([...new Set(fieldPositions)]),
    targetCardIds: Object.freeze([...new Set(targetCardIds)]),
    canDiscard,
  });
}
