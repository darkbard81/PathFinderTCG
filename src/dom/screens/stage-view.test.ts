import { describe, expect, it } from 'vitest';
import type { StageBattleResult } from '../../game/stage/types';
import {
  formatBattleResultGrowth,
  formatBattleResultReason,
  formatBattleResultRewards,
  formatDefeatCondition,
  formatVictoryCondition,
} from './stage-view';

describe('stage view format helpers', () => {
  it('formats victory and defeat conditions like the original StageScene', () => {
    expect(formatVictoryCondition({ type: 'DEFEAT_ENEMY_LEADER' })).toBe(
      'Defeat the enemy leader.',
    );
    expect(formatVictoryCondition({ type: 'SURVIVE_TURNS', turns: 5 })).toBe('Survive 5 turns.');
    expect(formatDefeatCondition({ type: 'PLAYER_LEADER_DEFEATED' })).toBe(
      'Player leader defeated.',
    );
    expect(formatDefeatCondition({ type: 'TURN_LIMIT', turns: 12 })).toBe('Turn limit: 12.');
    expect(formatDefeatCondition({ type: 'DECK_OUT' })).toBe('Deck out.');
  });

  it('formats battle result summary lines', () => {
    const win: StageBattleResult = {
      stageId: 'stage-1',
      outcome: 'WIN',
      reason: 'ENEMY_LEADER_DEFEATED',
      rewardCards: [],
      rewardCardInstanceIds: [],
      rewardCardNames: ['늑대', '독수리'],
      growth: {
        expPerCard: 10,
        cardInstanceIds: ['a', 'b'],
        cardNames: ['A', 'B'],
      },
      turnNumber: 4,
    };

    expect(formatBattleResultReason(win)).toBe('Enemy leader defeated');
    expect(formatBattleResultRewards(win)).toBe('늑대, 독수리');
    expect(formatBattleResultGrowth(win)).toBe('+10 EXP to 2 cards');
    expect(
      formatBattleResultRewards({
        ...win,
        rewardCardNames: [],
      }),
    ).toBe('No rewards');
    expect(
      formatBattleResultGrowth({
        ...win,
        growth: { expPerCard: 0, cardInstanceIds: [], cardNames: [] },
      }),
    ).toBe('No growth EXP');
  });
});
