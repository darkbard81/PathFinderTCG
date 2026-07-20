/**
 * 카드 정의에서 사용하는 선언 전용 도메인 타입이다.
 *
 * Action -> ActiveSkill -> Effect 흐름과,
 * Event -> Trigger -> ReactiveSkill -> Effect 흐름을 구분한다.
 */

export type ActionType = 'DRAW' | 'PLACE' | 'MOVE' | 'ATTACK' | 'DISCARD' | 'END_TURN';

export type TriggerType =
  | 'CARD_DRAWN'
  | 'CARD_PLACED'
  | 'CARD_MOVED'
  | 'ATTACK_DECLARED'
  | 'DAMAGE_RECEIVED'
  | 'CARD_DESTROYED'
  | 'CARD_DISCARDED'
  | 'STATUS_ADDED'
  | 'STATUS_REMOVED'
  | 'TURN_STARTED'
  | 'TURN_ENDED';

export type TriggerSubject = 'SELF' | 'OWNER' | 'OPPONENT' | 'ANY';

/** REACTIVE Skill이 반응할 사건의 선언적 조건이다. */
export interface Trigger {
  readonly type: TriggerType;
  readonly subject?: TriggerSubject;
}

export type EffectTarget = 'SELF' | 'OWNER' | 'OPPONENT' | 'ACTION_TARGET' | 'TRIGGER_SOURCE';

export type StatType = 'ATTACK' | 'HEALTH' | 'DEFENSE';

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
