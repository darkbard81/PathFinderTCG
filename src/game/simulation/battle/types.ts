import type { CardDefinition, Effect, StatType, TriggerType } from '../../cards/card.js';
import type {
  BattleCardSource,
  BattleDeck,
  BattleFieldPosition,
  CardStatusId,
  StableId,
} from '../../data/contracts.js';

export const BATTLE_PLAYER_IDS = ['PLAYER', 'ENEMY'] as const;

export type BattlePlayerId = (typeof BATTLE_PLAYER_IDS)[number];

export const BATTLE_FIELD_POSITIONS = [
  'FRONT_LEFT',
  'FRONT_CENTER',
  'FRONT_RIGHT',
  'BACK_LEFT',
  'BACK_CENTER',
  'BACK_RIGHT',
] as const satisfies readonly BattleFieldPosition[];

export interface BattleStatModifiers {
  readonly ATTACK: number;
  readonly HEALTH: number;
  readonly COST: number;
  readonly DOMINANCE: number;
}

export interface BattleCardState {
  readonly id: StableId;
  readonly cardDefinitionId: StableId;
  readonly ownerId: BattlePlayerId;
  readonly source: BattleCardSource;
  readonly damage: number;
  readonly statusIds: readonly CardStatusId[];
  readonly isDeploymentPending: boolean;
  readonly hasMovedThisTurn: boolean;
  readonly hasAttackedThisTurn: boolean;
  readonly hasUsedActiveSkillThisTurn: boolean;
  readonly statModifiers: BattleStatModifiers;
  readonly lastDamageSourceCardId: StableId | null;
}

export type BattleFieldState = Readonly<Record<BattleFieldPosition, StableId | null>>;

export interface BattlePlayerState {
  readonly id: BattlePlayerId;
  readonly battleDeckId: StableId;
  readonly leaderCardId: StableId;
  readonly drawPileIds: readonly StableId[];
  readonly handIds: readonly StableId[];
  readonly field: BattleFieldState;
  readonly dropIds: readonly StableId[];
  readonly exileIds: readonly StableId[];
  readonly requiredDrawFailed: boolean;
}

export type BattleEndReason = 'LEADER_DEFEATED' | 'DECK_EXHAUSTED';

export type BattleResult =
  | {
      readonly type: 'ONGOING';
      readonly winnerId: null;
      readonly loserIds: readonly [];
      readonly reason: null;
    }
  | {
      readonly type: 'WIN';
      readonly winnerId: BattlePlayerId;
      readonly loserIds: readonly [BattlePlayerId];
      readonly reason: BattleEndReason;
    }
  | {
      readonly type: 'DRAW';
      readonly winnerId: null;
      readonly loserIds: readonly [BattlePlayerId, BattlePlayerId];
      readonly reason: BattleEndReason;
    };

export type BattlePhase = 'ACTION' | 'ENDED';

export type BattleActionType = 'PLACE' | 'MOVE' | 'ATTACK' | 'ACTIVE' | 'END_TURN';

export const BATTLE_ACTION_TYPES = [
  'PLACE',
  'MOVE',
  'ATTACK',
  'ACTIVE',
  'END_TURN',
] as const satisfies readonly BattleActionType[];

export type BattleAction =
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
  | {
      readonly type: 'ATTACK';
      readonly cardId: StableId;
      readonly targetCardId: StableId;
    }
  | {
      readonly type: 'ACTIVE';
      readonly cardId: StableId;
      readonly targetCardId?: StableId;
    }
  | {
      readonly type: 'END_TURN';
    };

export interface BattleState {
  readonly schemaVersion: 2;
  readonly seed: number;
  readonly firstPlayerId: BattlePlayerId;
  readonly activePlayerId: BattlePlayerId;
  /**
   * 첫 턴을 1로 세는 개별 플레이어 턴 번호다.
   */
  readonly turnNumber: number;
  readonly actionCount: number;
  readonly phase: BattlePhase;
  readonly lastAction: BattleAction | null;
  readonly players: Readonly<Record<BattlePlayerId, BattlePlayerState>>;
  readonly cards: readonly BattleCardState[];
  readonly result: BattleResult;
}

export type BattleEntityRef =
  | {
      readonly type: 'PLAYER';
      readonly playerId: BattlePlayerId;
    }
  | {
      readonly type: 'CARD';
      readonly cardId: StableId;
    };

interface BattleEventBase {
  readonly subject: BattleEntityRef | null;
  readonly source: BattleEntityRef | null;
  readonly triggerType: TriggerType | null;
}

export type BattleEvent =
  | (BattleEventBase & {
      readonly type: 'ACTION_STARTED';
      readonly triggerType: null;
      readonly playerId: BattlePlayerId;
      readonly action: BattleAction;
    })
  | (BattleEventBase & {
      readonly type: 'ACTION_CANCELLED';
      readonly triggerType: null;
      readonly playerId: BattlePlayerId;
      readonly action: BattleAction;
      readonly reason: string;
    })
  | (BattleEventBase & {
      readonly type: 'DRAW';
      readonly triggerType: 'CARD_DRAWN';
      readonly playerId: BattlePlayerId;
      readonly cardIds: readonly StableId[];
    })
  | (BattleEventBase & {
      readonly type: 'PLACE';
      readonly triggerType: 'CARD_PLACED';
      readonly playerId: BattlePlayerId;
      readonly cardId: StableId;
      readonly to: BattleFieldPosition;
    })
  | (BattleEventBase & {
      readonly type: 'MOVE';
      readonly triggerType: 'CARD_MOVED';
      readonly playerId: BattlePlayerId;
      readonly cardId: StableId;
      readonly from: BattleFieldPosition;
      readonly to: BattleFieldPosition;
    })
  | (BattleEventBase & {
      readonly type: 'ATTACK_DECLARED';
      readonly triggerType: 'ATTACK_DECLARED';
      readonly attackerCardId: StableId;
      readonly targetCardId: StableId;
    })
  | (BattleEventBase & {
      readonly type: 'DAMAGE';
      readonly triggerType: 'DAMAGE_RECEIVED';
      readonly targetCardId: StableId;
      readonly amount: number;
    })
  | (BattleEventBase & {
      readonly type: 'HEAL';
      readonly triggerType: null;
      readonly targetCardId: StableId;
      readonly amount: number;
    })
  | (BattleEventBase & {
      readonly type: 'DESTROY';
      readonly triggerType: 'CARD_DESTROYED';
      readonly cardId: StableId;
    })
  | (BattleEventBase & {
      readonly type: 'DISCARD';
      readonly triggerType: 'CARD_DISCARDED';
      readonly playerId: BattlePlayerId;
      readonly cardIds: readonly StableId[];
    })
  | (BattleEventBase & {
      readonly type: 'STATUS_ADDED';
      readonly triggerType: 'STATUS_ADDED';
      readonly targetCardId: StableId;
      readonly statusId: CardStatusId;
    })
  | (BattleEventBase & {
      readonly type: 'STATUS_REMOVED';
      readonly triggerType: 'STATUS_REMOVED';
      readonly targetCardId: StableId;
      readonly statusId: CardStatusId;
    })
  | (BattleEventBase & {
      readonly type: 'STAT_MODIFIED';
      readonly triggerType: null;
      readonly targetCardId: StableId;
      readonly stat: StatType;
      readonly amount: number;
    })
  | (BattleEventBase & {
      readonly type: 'EXILE';
      readonly triggerType: null;
      readonly playerId: BattlePlayerId;
      readonly cardId: StableId;
    })
  | (BattleEventBase & {
      readonly type: 'DEPLOYMENT_READY';
      readonly triggerType: null;
      readonly playerId: BattlePlayerId;
      readonly cardIds: readonly StableId[];
    })
  | (BattleEventBase & {
      readonly type: 'TURN_STARTED';
      readonly triggerType: 'TURN_STARTED';
      readonly playerId: BattlePlayerId;
    })
  | (BattleEventBase & {
      readonly type: 'TURN_ENDED';
      readonly triggerType: 'TURN_ENDED';
      readonly playerId: BattlePlayerId;
    })
  | (BattleEventBase & {
      readonly type: 'EFFECT_FAILED';
      readonly triggerType: null;
      readonly effect: Effect;
      readonly reason: string;
    })
  | (BattleEventBase & {
      readonly type: 'BATTLE_ENDED';
      readonly triggerType: null;
      readonly result: Exclude<BattleResult, { readonly type: 'ONGOING' }>;
    });

export interface ResolutionStep {
  readonly id: StableId;
  readonly effectId: StableId;
  readonly beforeState: BattleState;
  readonly afterState: BattleState;
  readonly events: readonly BattleEvent[];
}

export interface ActionResolution {
  readonly action: BattleAction;
  readonly beforeState: BattleState;
  readonly finalState: BattleState;
  readonly steps: readonly ResolutionStep[];
}

export interface BattleEffectiveStats {
  readonly attack: number;
  readonly hp: number;
  readonly cost: number;
  readonly dominance: number;
}

export interface ReactiveSkillChoice {
  readonly sourceCardId: StableId;
  readonly skillId: StableId;
}

export interface ReactiveSkillOrderDecision {
  readonly playerId: BattlePlayerId;
  readonly choices: readonly ReactiveSkillChoice[];
}

export interface EffectFieldDecision {
  readonly playerId: BattlePlayerId;
  readonly effectType: 'MOVE' | 'PLACE';
  readonly sourceCardId: StableId;
  readonly targetCardId: StableId;
  readonly legalPositions: readonly BattleFieldPosition[];
}

export interface DiscardDecision {
  readonly playerId: BattlePlayerId;
  readonly sourceCardId: StableId | null;
  readonly count: number;
  readonly handCardIds: readonly StableId[];
  readonly reason: 'EFFECT' | 'HAND_LIMIT';
}

/**
 * Effect 해결 중 필요한 선택만 전달받는 일시적 정책이다. 함수나 정책 객체는 BattleState에
 * 저장하지 않으므로 시뮬레이션 상태는 계속 JSON 직렬화 가능하다.
 */
export interface BattleDecisionProvider {
  readonly orderReactiveSkills: (
    decision: ReactiveSkillOrderDecision,
  ) => readonly ReactiveSkillChoice[];
  readonly chooseEffectField: (decision: EffectFieldDecision) => BattleFieldPosition;
  readonly chooseDiscardCards: (decision: DiscardDecision) => readonly StableId[];
}

export interface BattleSetup {
  readonly seed: number;
  readonly playerDeck: BattleDeck;
  readonly enemyDeck: BattleDeck;
  readonly cardDefinitions: readonly CardDefinition[];
  readonly playerMulliganCardIds?: readonly StableId[];
  readonly enemyMulliganCardIds?: readonly StableId[];
  /**
   * Stage 01은 PLAYER를 전달한다. 다른 대전 매트릭스는 명시적으로 ENEMY를 선택할 수 있다.
   */
  readonly firstPlayerId?: BattlePlayerId;
}

export interface BattleCardLocation {
  readonly playerId: BattlePlayerId;
  readonly zone: 'DECK' | 'HAND' | 'FIELD' | 'DROP' | 'EXILE';
  readonly fieldPosition: BattleFieldPosition | null;
}
