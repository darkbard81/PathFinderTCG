import type {
  ActionResolution,
  BattleAction,
  BattleDecisionProvider,
  DiscardDecision,
  EffectFieldDecision,
  ReactiveSkillChoice,
  ReactiveSkillOrderDecision,
} from '../../../game/simulation/battle/types.js';
import type { BattleFieldPosition, StableId } from '../../../game/data/index.js';

export interface BattleActionExecutor {
  simulateBattleAction(action: BattleAction, decisions: BattleDecisionProvider): ActionResolution;
  resolveBattleAction(action: BattleAction, decisions: BattleDecisionProvider): ActionResolution;
}

export interface BattleDecisionPrompt {
  orderReactiveSkills(
    decision: ReactiveSkillOrderDecision,
  ): Promise<readonly ReactiveSkillChoice[]>;
  chooseEffectField(decision: EffectFieldDecision): Promise<BattleFieldPosition>;
  chooseDiscardCards(decision: DiscardDecision): Promise<readonly StableId[]>;
}

type RecordedDecision =
  | {
      readonly type: 'REACTIVE_ORDER';
      readonly value: readonly ReactiveSkillChoice[];
    }
  | {
      readonly type: 'EFFECT_FIELD';
      readonly value: BattleFieldPosition;
    }
  | {
      readonly type: 'DISCARD';
      readonly value: readonly StableId[];
    };

type PendingDecision =
  | {
      readonly index: number;
      readonly type: 'REACTIVE_ORDER';
      readonly request: ReactiveSkillOrderDecision;
    }
  | {
      readonly index: number;
      readonly type: 'EFFECT_FIELD';
      readonly request: EffectFieldDecision;
    }
  | {
      readonly index: number;
      readonly type: 'DISCARD';
      readonly request: DiscardDecision;
    };

class PendingBattleDecisionError extends Error {
  readonly pending: PendingDecision;

  constructor(pending: PendingDecision) {
    super(`사용자 전투 결정이 필요합니다: ${pending.type}`);
    this.name = 'PendingBattleDecisionError';
    this.pending = pending;
  }
}

function assertRecordedType(recorded: RecordedDecision, expected: RecordedDecision['type']): void {
  if (recorded.type !== expected) {
    throw new Error(
      `전투 결정 재생 순서가 달라졌습니다: ${recorded.type} 대신 ${expected}가 필요합니다.`,
    );
  }
}

function createReplayProvider(recorded: readonly RecordedDecision[]): BattleDecisionProvider {
  let cursor = 0;

  return {
    orderReactiveSkills: (request) => {
      const index = cursor;
      cursor += 1;
      const decision = recorded[index];

      if (decision === undefined) {
        throw new PendingBattleDecisionError({
          index,
          type: 'REACTIVE_ORDER',
          request,
        });
      }

      assertRecordedType(decision, 'REACTIVE_ORDER');
      return decision.type === 'REACTIVE_ORDER' ? decision.value : [];
    },
    chooseEffectField: (request) => {
      const index = cursor;
      cursor += 1;
      const decision = recorded[index];

      if (decision === undefined) {
        throw new PendingBattleDecisionError({
          index,
          type: 'EFFECT_FIELD',
          request,
        });
      }

      assertRecordedType(decision, 'EFFECT_FIELD');
      if (decision.type !== 'EFFECT_FIELD') {
        throw new Error('전투 Field 결정 타입이 유효하지 않습니다.');
      }
      return decision.value;
    },
    chooseDiscardCards: (request) => {
      const index = cursor;
      cursor += 1;
      const decision = recorded[index];

      if (decision === undefined) {
        throw new PendingBattleDecisionError({
          index,
          type: 'DISCARD',
          request,
        });
      }

      assertRecordedType(decision, 'DISCARD');
      return decision.type === 'DISCARD' ? decision.value : [];
    },
  };
}

async function requestPendingDecision(
  pending: PendingDecision,
  prompt: BattleDecisionPrompt,
): Promise<RecordedDecision> {
  switch (pending.type) {
    case 'REACTIVE_ORDER':
      return Object.freeze({
        type: 'REACTIVE_ORDER',
        value: Object.freeze([...(await prompt.orderReactiveSkills(pending.request))]),
      });
    case 'EFFECT_FIELD':
      return Object.freeze({
        type: 'EFFECT_FIELD',
        value: await prompt.chooseEffectField(pending.request),
      });
    case 'DISCARD':
      return Object.freeze({
        type: 'DISCARD',
        value: Object.freeze([...(await prompt.chooseDiscardCards(pending.request))]),
      });
  }
}

export class BattleDecisionCoordinator {
  async resolveAction(
    executor: BattleActionExecutor,
    action: BattleAction,
    prompt: BattleDecisionPrompt,
  ): Promise<ActionResolution> {
    const recorded: RecordedDecision[] = [];

    while (true) {
      try {
        executor.simulateBattleAction(action, createReplayProvider(recorded));
        break;
      } catch (error: unknown) {
        if (!(error instanceof PendingBattleDecisionError)) {
          throw error;
        }

        recorded[error.pending.index] = await requestPendingDecision(error.pending, prompt);
      }
    }

    try {
      return executor.resolveBattleAction(action, createReplayProvider(recorded));
    } catch (error: unknown) {
      if (error instanceof PendingBattleDecisionError) {
        throw new Error('검증된 전투 결정을 실제 Action 해결에서 재생하지 못했습니다.', {
          cause: error,
        });
      }

      throw error;
    }
  }
}
