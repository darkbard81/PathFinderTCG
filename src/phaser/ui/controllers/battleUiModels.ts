import type { CardDefinition } from '../../../game/cards/card.js';
import { createCardDisplayModel, type CardDisplayModel } from '../../../game/cards/cardDisplay.js';
import type { BattleFieldPosition, CardPresentation, StableId } from '../../../game/data/index.js';
import {
  getBattleCard,
  getBattleEffectiveStats,
  getCardDefinition,
  type BattleAction,
  type BattleState,
} from '../../../game/simulation/battle/index.js';
import type { PF2eGridTableItem } from '../components/PF2eGridTable.js';

const FIELD_POSITION_LABELS: Readonly<Record<BattleFieldPosition, string>> = Object.freeze({
  FRONT_LEFT: '전열 왼쪽',
  FRONT_CENTER: '전열 중앙',
  FRONT_RIGHT: '전열 오른쪽',
  BACK_LEFT: '후열 왼쪽',
  BACK_CENTER: '후열 중앙',
  BACK_RIGHT: '후열 오른쪽',
});

export interface BattleCardViewModel {
  readonly id: StableId;
  readonly card: CardDisplayModel;
  readonly ownerLabel: string;
  readonly isLeader: boolean;
  readonly deploymentPending: boolean;
  readonly statusCount: number;
}

export interface BattleActionListItem extends PF2eGridTableItem {
  readonly action: BattleAction;
}

function findPresentation(
  presentations: readonly CardPresentation[],
  definitionId: StableId,
): CardPresentation {
  const presentation = presentations.find(
    (candidate) => candidate.cardDefinitionId === definitionId,
  );

  if (presentation === undefined) {
    throw new Error(`카드 표시 정보를 찾을 수 없습니다: ${definitionId}`);
  }

  return presentation;
}

function getCardName(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
  cardId: StableId,
): string {
  const card = getBattleCard(state, cardId);
  return getCardDefinition(cardDefinitions, card.cardDefinitionId).name;
}

export function formatBattleFieldPosition(position: BattleFieldPosition): string {
  return FIELD_POSITION_LABELS[position];
}

export function createBattleCardViewModel(
  state: BattleState,
  cardId: StableId,
  cardDefinitions: readonly CardDefinition[],
  presentations: readonly CardPresentation[],
): BattleCardViewModel {
  const battleCard = getBattleCard(state, cardId);
  const definition = getCardDefinition(cardDefinitions, battleCard.cardDefinitionId);
  const presentation = findPresentation(presentations, definition.id);
  const baseDisplay = createCardDisplayModel(definition, presentation);
  const effective = getBattleEffectiveStats(state, cardDefinitions, cardId);
  const remainingHp = Math.max(0, effective.hp - battleCard.damage);

  return Object.freeze({
    id: cardId,
    card: Object.freeze({
      ...baseDisplay,
      stats: Object.freeze({
        cost: effective.cost,
        dominance: effective.dominance,
        attack: effective.attack,
        hp: remainingHp,
      }),
    }),
    ownerLabel: battleCard.ownerId === 'PLAYER' ? '아군' : '적군',
    isLeader: state.players[battleCard.ownerId].leaderCardId === cardId,
    deploymentPending: battleCard.isDeploymentPending,
    statusCount: battleCard.statusIds.length,
  });
}

export function createBattleActionListItems(
  state: BattleState,
  actions: readonly BattleAction[],
  cardDefinitions: readonly CardDefinition[],
): readonly BattleActionListItem[] {
  return Object.freeze(
    actions.map((action, index) => {
      const id = `battle-action-${index}`;

      switch (action.type) {
        case 'PLACE':
          return Object.freeze({
            id,
            title: `${getCardName(state, cardDefinitions, action.cardId)} 배치`,
            detail: formatBattleFieldPosition(action.fieldPosition),
            action,
          });
        case 'MOVE':
          return Object.freeze({
            id,
            title: `${getCardName(state, cardDefinitions, action.cardId)} 이동`,
            detail: formatBattleFieldPosition(action.fieldPosition),
            action,
          });
        case 'ATTACK':
          return Object.freeze({
            id,
            title: `${getCardName(state, cardDefinitions, action.cardId)} 공격`,
            detail: `대상 · ${getCardName(state, cardDefinitions, action.targetCardId)}`,
            action,
          });
        case 'ACTIVE':
          return Object.freeze({
            id,
            title: `${getCardName(state, cardDefinitions, action.cardId)} Active`,
            detail:
              action.targetCardId === undefined
                ? '대상 없음'
                : `대상 · ${getCardName(state, cardDefinitions, action.targetCardId)}`,
            action,
          });
        case 'END_TURN':
          return Object.freeze({
            id,
            title: '턴 종료',
            detail: `${state.activePlayerId === 'PLAYER' ? '내' : '적'} ${state.turnNumber}턴을 마칩니다.`,
            action,
          });
      }
    }),
  );
}
