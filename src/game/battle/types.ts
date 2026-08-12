import type { AbilityCategory } from '../save/card-catalog';
import type { RuntimeCardInstance } from '../save/session';

export type BattleRuntimeZone = 'DECK' | 'HAND' | 'BATTLEFIELD' | 'DROP' | 'EXILE';

export type BattleSide = 'player' | 'enemy';

export type BattlePhase = 'MAIN' | 'ATTACK' | 'GAME_OVER';

export type BattlefieldZone = 'FR' | 'FC' | 'FL' | 'BR' | 'BC' | 'BL';

export type BattleSlotId = `${BattleSide}:${BattlefieldZone}`;

export const BATTLE_SIDES = ['player', 'enemy'] as const satisfies readonly BattleSide[];

export const BATTLEFIELD_ZONES = [
  'FR',
  'FC',
  'FL',
  'BR',
  'BC',
  'BL',
] as const satisfies readonly BattlefieldZone[];

/** 전장 칸 12개다. 화면 배치와 무관한 목록이라 어느 쪽에서 읽어도 같다. */
export const ALL_BATTLE_SLOT_IDS: readonly BattleSlotId[] = BATTLE_SIDES.flatMap((side) =>
  BATTLEFIELD_ZONES.map((zone): BattleSlotId => `${side}:${zone}`),
);

export const PLAYER_INITIAL_LEADER_SLOT = 'player:BC' as const satisfies BattleSlotId;

export const ENEMY_INITIAL_LEADER_SLOT = 'enemy:BC' as const satisfies BattleSlotId;

export const INITIAL_HAND_SIZE = 5 as const;

export type BattleAbilityEffectExpiration =
  | 'TURN_END'
  | 'NEXT_OWN_TURN_START'
  | 'NEXT_OWN_TURN_END'
  | 'NEXT_ATTACK'
  | 'BATTLEFIELD_LEAVE'
  | 'NONE';

export type BattleAbilityEffectRuntime = {
  id: string;
  abilityId: string;
  sourceInstanceId: string;
  category: AbilityCategory;
  stat?: 'attack' | 'hp' | 'dominance';
  value?: number;
  expiresAt: BattleAbilityEffectExpiration;
  createdTurnNumber: number;
};

export type ActiveSkillBattleEffect = 'HEAL' | 'DAMAGE' | 'BUFF_ATTACK';

export type BattleCardRuntimeState = {
  card: RuntimeCardInstance;
  side: BattleSide;
  zone: BattleRuntimeZone;
  battlefieldSlot: BattleSlotId | null;
  enteredBattlefieldTurnNumber: number | null;
  handIndex: number | null;
  deckIndex: number | null;
  hasMovedThisTurn: boolean;
  hasAttackedThisTurn: boolean;
  hasUsedActiveSkillThisTurn: boolean;
  abilityEffects: BattleAbilityEffectRuntime[];
};

export type BattleParticipantRuntimeState = {
  side: BattleSide;
  leader: BattleCardRuntimeState;
  deck: BattleCardRuntimeState[];
  hand: BattleCardRuntimeState[];
  drop: BattleCardRuntimeState[];
  exile: BattleCardRuntimeState[];
};

export type BattleOutcome = {
  winner: BattleSide;
  loser: BattleSide;
  reason: 'LEADER_DEFEATED';
};

export type PlaceBattleAction = {
  type: 'PLACE';
  cardInstanceId: string;
  fromHandIndex: number;
  toSlotId: BattleSlotId;
  dominance: number;
  cost: number;
};

export type MoveBattleAction = {
  type: 'MOVE';
  cardInstanceId: string;
  fromSlotId: BattleSlotId;
  toSlotId: BattleSlotId;
};

export type AttackBattleAction = {
  type: 'ATTACK';
  attackerInstanceId: string;
  targetInstanceId: string;
  fromSlotId: BattleSlotId;
  toSlotId: BattleSlotId;
  attack: number;
};

export type BlockBattleAction = {
  type: 'BLOCK';
  attackAction: AttackBattleAction;
  blockerInstanceId: string;
  blockerSlotId: BattleSlotId;
};

export type ActiveSkillBattleAction = {
  type: 'ACTIVE_SKILL';
  cardInstanceId: string;
  skillId: string;
  targetInstanceId: string;
  targetSlotId: BattleSlotId;
  effect: ActiveSkillBattleEffect;
  value: number;
};

export type BattleAutomationAction = PlaceBattleAction | MoveBattleAction | AttackBattleAction;

export type BattleBlockDecision = {
  attackAction: AttackBattleAction;
  blockActions: BlockBattleAction[];
};

export type BattleAutomatedTurnResult = {
  events: BattleTurnEvent[];
  blockDecision: BattleBlockDecision | null;
  actionCount: number;
};

/** 자동 턴을 한 행동만 진행한 결과다. `finished`면 이 진영의 턴에 더 진행할 것이 없다. */
export type BattleAutomatedTurnStep = BattleAutomatedTurnResult & {
  finished: boolean;
};

export type BattleTurnEndReason = 'MANUAL' | 'STALLED' | 'NO_ACTION' | 'ACTION_LIMIT';

export type BattleTurnEvent =
  | {
      type: 'TURN_START';
      side: BattleSide;
      drewCardInstanceId: string | null;
      deckRemaining: number;
    }
  | {
      type: 'ACTION';
      side: BattleSide;
      action: BattleAutomationAction;
    }
  | {
      /**
       * 활성 스킬을 썼다. 자동 턴은 스킬을 쓰지 않아 전투 세션만 낸다.
       * `ACTION`과 나눠 둔다. 자동 턴 판정이 좁혀 쓰는 행동 종류를 넓히지 않기 위해서다.
       */
      type: 'ACTIVE_SKILL';
      side: BattleSide;
      action: ActiveSkillBattleAction;
    }
  | {
      /** 선언된 공격을 대신 맞았다. `side`는 막은 쪽이다. */
      type: 'BLOCK';
      side: BattleSide;
      action: BlockBattleAction;
    }
  | {
      type: 'TURN_END';
      side: BattleSide;
      nextSide: BattleSide;
      reason: BattleTurnEndReason;
    }
  | {
      type: 'ACTION_LIMIT';
      side: BattleSide;
      actionCount: number;
    };

export type BattleAvailableActions = {
  placeActions: PlaceBattleAction[];
  moveActions: MoveBattleAction[];
  activeSkillActions: ActiveSkillBattleAction[];
  attackActions: AttackBattleAction[];
};

export type BattleRuntimeState = {
  currentSide: BattleSide;
  turnNumber: number;
  phase: BattlePhase;
  outcome: BattleOutcome | null;
  player: BattleParticipantRuntimeState;
  enemy: BattleParticipantRuntimeState;
  battlefield: BattleCardRuntimeState[];
  drop: BattleCardRuntimeState[];
  exile: BattleCardRuntimeState[];
};
