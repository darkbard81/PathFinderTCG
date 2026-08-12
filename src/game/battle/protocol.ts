import type { RuntimeCardInstance } from '../save/session';
import type { SaveSlotId } from '../save/types';
import type { StageBattleResult } from '../stage/types';
import type {
  ActiveSkillBattleEffect,
  BattleOutcome,
  BattlePhase,
  BattleSide,
  BattleSlotId,
  BattleTurnEvent,
} from './types';

/**
 * 전투 서버와 주고받는 값의 형태다.
 *
 * 여기에는 타입만 둔다. 규칙 판정은 서버에만 있고, 브라우저는 이 형태로 오는 결과를 그릴 뿐이다.
 * 클라이언트는 자기가 시도한 행동(`BattleCommand`)만 보내고, 상태는 언제나 서버가 준 것을 쓴다.
 */

/** 클라이언트가 보내는 행동 의도다. 결과 상태는 담지 않는다. */
export type BattleCommand =
  | { type: 'PLACE'; cardInstanceId: string; toSlotId: BattleSlotId }
  | { type: 'MOVE'; cardInstanceId: string; toSlotId: BattleSlotId }
  | { type: 'ATTACK'; attackerInstanceId: string; toSlotId: BattleSlotId }
  | {
      type: 'ACTIVE_SKILL';
      cardInstanceId: string;
      skillId: string;
      targetSlotId: BattleSlotId;
    }
  | { type: 'END_TURN' }
  /** 방어 선택을 마감한다. null이면 막지 않는다. */
  | { type: 'RESOLVE_BLOCK'; blockerInstanceId: string | null }
  /** 적 자동 턴을 한 행동만큼 진행한다. 연출을 한 수씩 보여주려고 나눠 받는다. */
  | { type: 'ADVANCE' };

export type BattleCommandType = BattleCommand['type'];

export type CreateBattleRequest = {
  slotId: SaveSlotId;
  stageId: string;
};

/** 화면에 그릴 수 있는 카드 한 장이다. 수치는 서버가 계산한 전투 유효값이다. */
export type BattlePublicCard = {
  instanceId: string;
  side: BattleSide;
  card: RuntimeCardInstance;
  attack: number;
  hp: number;
  dominance: number;
};

/** 지금 이 카드로 쓸 수 있는 활성 스킬 하나다. 대상이 없는 스킬은 담지 않는다. */
export type BattlePublicSkill = {
  skillId: string;
  name: string;
  effect: ActiveSkillBattleEffect;
  value: number;
  targetSlotIds: BattleSlotId[];
};

export type BattlePublicSlot = {
  slotId: BattleSlotId;
  card: BattlePublicCard | null;
  /** 빈 칸에 인접한 내 지배력 합이다. 카드가 있으면 null이다. */
  dominance: number | null;
  /** 내 카드가 이번 턴 할 수 있는 일을 하나라도 남겼는지다. 내 카드가 아니면 null이다. */
  ready: boolean | null;
  skills: BattlePublicSkill[];
  /** 이 카드가 갈 수 있는 빈 칸이다. 내 카드가 아니면 빈 배열이다. */
  moveSlotIds: BattleSlotId[];
  /** 이 카드가 칠 수 있는 칸이다. 내 카드가 아니면 빈 배열이다. */
  attackSlotIds: BattleSlotId[];
};

export type BattlePublicHandCard = {
  card: BattlePublicCard;
  /** 지금 놓을 수 있는 칸이다. 비어 있으면 낼 수 없는 카드다. */
  placeSlotIds: BattleSlotId[];
};

export type BattlePublicPiles = {
  deckCount: number;
  dropCount: number;
  exileCount: number;
  dropTop: BattlePublicCard | null;
  exileTop: BattlePublicCard | null;
};

/** 적 공격을 대신 맞을 유닛을 고르는 물음이다. 아직 공격은 적용되지 않았다. */
export type BattlePublicBlockPrompt = {
  attackerName: string;
  targetName: string;
  attack: number;
  blockers: { instanceId: string; name: string }[];
};

/**
 * 브라우저에 내보내는 전투 상태다.
 *
 * 서버가 가진 `BattleRuntimeState`를 그대로 주지 않는다. 적 손패와 양측 덱 내용은 빼고,
 * 화면이 그리는 데 필요한 값과 서버가 이미 판정한 합법 행동만 담는다.
 */
export type BattlePublicState = {
  battleId: string;
  stageId: string;
  turnNumber: number;
  currentSide: BattleSide;
  phase: BattlePhase;
  outcome: BattleOutcome | null;
  slots: BattlePublicSlot[];
  hand: BattlePublicHandCard[];
  player: BattlePublicPiles;
  enemy: BattlePublicPiles & { handCount: number };
  blockPrompt: BattlePublicBlockPrompt | null;
  /** 적 자동 턴이 남아 `ADVANCE`를 더 보내야 하면 true다. */
  automationPending: boolean;
  /** 양측 다 둘 수가 없어 자동 진행을 멈췄으면 true다. */
  automationStalled: boolean;
  /** 승패가 났을 때만 있다. 보상 추첨도 서버가 끝낸 결과다. */
  result: StageBattleResult | null;
};

/** 연출 하나다. 어떤 칸에서 어떤 수치를 띄울지는 서버가 정한다. */
export type BattleEffectRequest = {
  kind: 'damage' | 'heal' | 'buff';
  slotId: BattleSlotId;
  value: number;
};

/** 명령 하나를 처리한 결과다. 클라이언트는 이것만으로 기록과 연출을 만든다. */
export type BattleUpdate = {
  events: BattleTurnEvent[];
  /** 이벤트에 나온 카드의 이름이다. 기록 문구를 만들 때 쓴다. */
  cardNames: Record<string, string>;
  effects: BattleEffectRequest[];
  state: BattlePublicState;
};

export type CreateBattleResponse = BattleUpdate;

/** 전투 서비스 경계다. 화면은 전투 엔진 대신 이것만 부른다. */
export type BattleService = {
  createBattle(request: CreateBattleRequest): Promise<BattleUpdate>;
  applyCommand(battleId: string, command: BattleCommand): Promise<BattleUpdate>;
  readBattle(battleId: string): Promise<BattlePublicState>;
  /** 전투를 접는다. 서버가 들고 있던 상태를 버리게 한다. */
  endBattle(battleId: string): Promise<void>;
};
