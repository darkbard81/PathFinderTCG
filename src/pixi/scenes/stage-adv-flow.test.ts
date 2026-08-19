import { requireStageDefinition } from '../../game/stage/stage-definitions';
import type { StageBattleResult } from '../../game/stage/types';
import { resolveEndAdvDefinition, resolveStartAdvDefinition } from './stage-adv-flow';

function createResult(overrides: Partial<StageBattleResult> = {}): StageBattleResult {
  return {
    stageId: 'level01',
    outcome: 'WIN',
    reason: 'ENEMY_LEADER_DEFEATED',
    rewardCards: [],
    rewardCardInstanceIds: [],
    rewardCardNames: [],
    growth: { expPerCard: 0, cardInstanceIds: [], cardNames: [] },
    turnNumber: 1,
    ...overrides,
  };
}

describe('Stage ADV flow', () => {
  const level01 = requireStageDefinition('level01');

  it('Start ADV가 있는 Stage는 전투 전에 그 정의를 반환한다', () => {
    expect(resolveStartAdvDefinition(level01)).toBe(level01.startAdv);
  });

  it('같은 Stage의 승리 결과에만 End ADV를 반환한다', () => {
    expect(resolveEndAdvDefinition(level01, createResult())).toBe(level01.endAdv);
    expect(
      resolveEndAdvDefinition(
        level01,
        createResult({ outcome: 'LOSE', reason: 'PLAYER_LEADER_DEFEATED' }),
      ),
    ).toBeNull();
    expect(resolveEndAdvDefinition(level01, null)).toBeNull();
    expect(resolveEndAdvDefinition(level01, createResult({ stageId: 'level02' }))).toBeNull();
  });
});
