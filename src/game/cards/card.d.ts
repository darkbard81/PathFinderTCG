/**
 * 카드 정의에서 사용하는 선언 전용 도메인 타입이다.
 *
 * Action -> ActiveSkill -> Effect 흐름과,
 * Event -> Trigger -> ReactiveSkill -> Effect 흐름을 구분한다.
 */

export type ActionType = 'DRAW' | 'PLACE' | 'MOVE' | 'ATTACK' | 'DISCARD' | 'END_TURN';

export const TriggerType = {
  /** 카드를 덱에서 뽑았을 때 */
  CARD_DRAWN: 'CARD_DRAWN',

  /** 카드를 필드에 배치했을 때 */
  CARD_PLACED: 'CARD_PLACED',

  /** 카드의 위치가 변경되었을 때 */
  CARD_MOVED: 'CARD_MOVED',

  /** 공격을 선언했을 때 */
  ATTACK_DECLARED: 'ATTACK_DECLARED',

  /** 피해를 받았을 때 */
  DAMAGE_RECEIVED: 'DAMAGE_RECEIVED',

  /** 카드가 파괴되었을 때 */
  CARD_DESTROYED: 'CARD_DESTROYED',

  /** 카드를 버렸을 때 */
  CARD_DISCARDED: 'CARD_DISCARDED',

  /** 상태가 추가되었을 때 */
  STATUS_ADDED: 'STATUS_ADDED',

  /** 상태가 제거되었을 때 */
  STATUS_REMOVED: 'STATUS_REMOVED',

  /** 턴이 시작되었을 때 */
  TURN_STARTED: 'TURN_STARTED',

  /** 턴이 종료되었을 때 */
  TURN_ENDED: 'TURN_ENDED',
} as const;

export type TriggerType = (typeof TriggerType)[keyof typeof TriggerType];

export type TriggerSubject = 'SELF' | 'OWNER' | 'OPPONENT' | 'ANY';

/** REACTIVE Skill이 반응할 사건의 선언적 조건이다. */
export interface Trigger {
  readonly type: TriggerType;
  readonly subject?: TriggerSubject;
}

export type EffectTarget =
  'SELF' | 'OWNER' | 'OPPONENT' | 'ACTION_TARGET' | 'TRIGGER_SOURCE' | 'TRIGGER_SUBJECT';

export type StatType = 'ATTACK' | 'HEALTH' | 'COST' | 'DOMINANCE';

/**
 * 상태를 변경하는 실행 결과다.
 *
 * 새 Effect를 추가할 때는 범용 옵션 객체를 붙이지 말고 이 union에 필요한 필드를 가진
 * 새 variant를 추가한다.
 */
export type Effect =
  | {
      readonly type: 'DAMAGE';
      readonly target: EffectTarget;
      readonly amount: number;
    }
  | {
      readonly type: 'HEAL';
      readonly target: EffectTarget;
      readonly amount: number;
    }
  | {
      readonly type: 'DRAW';
      readonly target: EffectTarget;
      readonly count: number;
    }
  | {
      readonly type: 'MOVE';
      readonly target: EffectTarget;
    }
  | {
      readonly type: 'PLACE';
      readonly target: EffectTarget;
    }
  | {
      readonly type: 'DESTROY';
      readonly target: EffectTarget;
    }
  | {
      readonly type: 'DISCARD';
      readonly target: EffectTarget;
      readonly count: number;
    }
  | {
      readonly type: 'MODIFY_STAT';
      readonly target: EffectTarget;
      readonly stat: StatType;
      readonly amount: number;
    }
  | {
      readonly type: 'ADD_STATUS';
      readonly target: EffectTarget;
      readonly statusId: string;
    }
  | {
      readonly type: 'REMOVE_STATUS';
      readonly target: EffectTarget;
      readonly statusId: string;
    };

export type EffectType = Effect['type'];

export type SkillType = 'ACTIVE' | 'REACTIVE' | 'PASSIVE';

interface SkillBase {
  readonly id: string;
  readonly effects: readonly Effect[];
}

/** 플레이어가 선택한 Action으로 실행하는 카드 규칙이다. */
export interface ActiveSkill extends SkillBase {
  readonly type: 'ACTIVE';
  readonly action: ActionType;
}

/** Trigger와 일치하는 사건이 발생했을 때 실행하는 카드 규칙이다. */
export interface ReactiveSkill extends SkillBase {
  readonly type: 'REACTIVE';
  readonly trigger: Trigger;
}

/** 카드가 유효한 동안 계속 적용하는 카드 규칙이다. */
export interface PassiveSkill extends SkillBase {
  readonly type: 'PASSIVE';
}

/** 카드 데이터의 최소 공통 구조다. */
export interface CardDefinition {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly dominance: number;
  readonly hp: number;
  readonly attack: number;
  readonly activeSkill?: ActiveSkill;
  readonly reactiveSkill?: ReactiveSkill;
  readonly passiveSkill?: PassiveSkill;
}
