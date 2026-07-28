import { describe, expect, it, vi } from 'vitest';

import { createPhaseFiveBattleFixture } from '../../../game/simulation/battle/battleTestFixtures.js';
import type {
  BattleAction,
  BattleDecisionProvider,
} from '../../../game/simulation/battle/types.js';
import {
  BattleDecisionCoordinator,
  type BattleActionExecutor,
  type BattleDecisionPrompt,
} from './BattleDecisionCoordinator.js';

describe('BattleDecisionCoordinator', () => {
  it('collects async decisions by replaying a side-effect-free simulation before resolve', async () => {
    const fixture = createPhaseFiveBattleFixture();
    const action = fixture.session.getLegalActions()[0];

    if (action === undefined) {
      throw new Error('테스트 Action이 필요합니다.');
    }

    const invokeDecisions = (provider: BattleDecisionProvider): void => {
      provider.orderReactiveSkills({
        playerId: 'PLAYER',
        choices: [
          {
            sourceCardId: 'reactive-card',
            skillId: 'reactive-skill',
          },
        ],
      });
      provider.chooseEffectField({
        playerId: 'PLAYER',
        effectType: 'PLACE',
        sourceCardId: 'source-card',
        targetCardId: 'target-card',
        legalPositions: ['FRONT_LEFT', 'FRONT_CENTER'],
      });
      provider.chooseDiscardCards({
        playerId: 'PLAYER',
        sourceCardId: null,
        count: 1,
        handCardIds: ['hand-1', 'hand-2'],
        reason: 'HAND_LIMIT',
      });
    };
    const executor: BattleActionExecutor = {
      simulateBattleAction(candidate: BattleAction, decisions: BattleDecisionProvider) {
        invokeDecisions(decisions);
        return fixture.session.simulateAction(candidate);
      },
      resolveBattleAction(candidate: BattleAction, decisions: BattleDecisionProvider) {
        invokeDecisions(decisions);
        return fixture.session.resolveAction(candidate);
      },
    };
    const orderReactiveSkills = vi.fn().mockResolvedValue([
      {
        sourceCardId: 'reactive-card',
        skillId: 'reactive-skill',
      },
    ]);
    const chooseEffectField = vi.fn().mockResolvedValue('FRONT_CENTER');
    const chooseDiscardCards = vi.fn().mockResolvedValue(['hand-2']);
    const prompt: BattleDecisionPrompt = {
      orderReactiveSkills,
      chooseEffectField,
      chooseDiscardCards,
    };
    const coordinator = new BattleDecisionCoordinator();

    const resolution = await coordinator.resolveAction(executor, action, prompt);

    expect(resolution.action).toEqual(action);
    expect(orderReactiveSkills).toHaveBeenCalledTimes(1);
    expect(chooseEffectField).toHaveBeenCalledTimes(1);
    expect(chooseDiscardCards).toHaveBeenCalledTimes(1);
  });

  it('does not prompt when an action needs no pending decisions', async () => {
    const fixture = createPhaseFiveBattleFixture();
    const action = fixture.session.getLegalActions()[0];

    if (action === undefined) {
      throw new Error('테스트 Action이 필요합니다.');
    }

    const orderReactiveSkills = vi.fn();
    const chooseEffectField = vi.fn();
    const chooseDiscardCards = vi.fn();
    const prompt: BattleDecisionPrompt = {
      orderReactiveSkills,
      chooseEffectField,
      chooseDiscardCards,
    };
    const executor: BattleActionExecutor = {
      simulateBattleAction: (candidate, decisions) =>
        fixture.session.simulateAction(candidate, decisions),
      resolveBattleAction: (candidate, decisions) =>
        fixture.session.resolveAction(candidate, decisions),
    };

    await new BattleDecisionCoordinator().resolveAction(executor, action, prompt);

    expect(orderReactiveSkills).not.toHaveBeenCalled();
    expect(chooseEffectField).not.toHaveBeenCalled();
    expect(chooseDiscardCards).not.toHaveBeenCalled();
  });
});
