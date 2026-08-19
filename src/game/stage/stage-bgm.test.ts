import { describe, expect, it } from 'vitest';
import { canChooseStageBgm, resolveStageBgmId, withStageBgmId } from './stage-bgm';
import type { StageDefinition, StageProgressState } from './types';

function stage(overrides: Partial<StageDefinition> = {}): StageDefinition {
  return {
    id: 'level01',
    order: 1,
    name: 'Level 01',
    description: '설명',
    enemyDeckId: 'deck-enemy-level01',
    enemyDeckPath: 'cards/deck_level01.json',
    victoryCondition: { type: 'DEFEAT_ENEMY_LEADER' },
    defeatConditions: [{ type: 'PLAYER_LEADER_DEFEATED' }],
    rewards: { description: '보상', enemyCardDrop: null },
    unlock: { type: 'ALWAYS' },
    startAdv: null,
    endAdv: null,
    battleBgmId: 'pf2etcg-intro',
    ...overrides,
  };
}

function progress(stageBgmIds: Record<string, string> = {}): StageProgressState {
  return { clearedStageIds: [], lastSelectedStageId: null, stageBgmIds };
}

const playable = (trackId: string): boolean =>
  ['pf2etcg-intro', 'comic', 'neon-velocity'].includes(trackId);

describe('resolveStageBgmId', () => {
  it('고른 것이 없으면 스테이지 기본값을 쓴다', () => {
    expect(resolveStageBgmId(stage(), progress(), playable)).toBe('pf2etcg-intro');
  });

  it('고른 것이 있으면 기본값을 덮는다', () => {
    expect(resolveStageBgmId(stage(), progress({ level01: 'comic' }), playable)).toBe('comic');
  });

  it('고른 곡이 자산에서 사라지면 기본값으로 되돌린다', () => {
    // 저장만 믿으면 없는 곡을 틀려 들다 무음이 된다.
    expect(resolveStageBgmId(stage(), progress({ level01: '사라진곡' }), playable)).toBe(
      'pf2etcg-intro',
    );
  });

  it('기본값마저 사라지면 null이다', () => {
    expect(resolveStageBgmId(stage({ battleBgmId: '사라진곡' }), progress(), playable)).toBeNull();
  });

  it('전투 곡이 없는 스테이지는 null이다', () => {
    expect(resolveStageBgmId(stage({ battleBgmId: null }), progress(), playable)).toBeNull();
  });

  it('다른 스테이지가 고른 곡에 끌려가지 않는다', () => {
    expect(resolveStageBgmId(stage(), progress({ level02: 'comic' }), playable)).toBe(
      'pf2etcg-intro',
    );
  });
});

describe('withStageBgmId', () => {
  it('고른 곡을 적어 넣는다', () => {
    expect(withStageBgmId(progress(), stage(), 'comic').stageBgmIds).toEqual({ level01: 'comic' });
  });

  it('기본값과 같은 곡을 고르면 항목을 지운다', () => {
    // 덮어쓴 것만 담아 두면 나중에 기본 곡이 바뀌어도 손대지 않은 스테이지가 따라간다.
    expect(
      withStageBgmId(progress({ level01: 'comic' }), stage(), 'pf2etcg-intro').stageBgmIds,
    ).toEqual({});
  });

  it('다른 스테이지의 선택을 건드리지 않는다', () => {
    expect(withStageBgmId(progress({ level02: 'comic' }), stage(), 'comic').stageBgmIds).toEqual({
      level01: 'comic',
      level02: 'comic',
    });
  });

  it('원래 상태를 고치지 않는다', () => {
    const before = progress();

    withStageBgmId(before, stage(), 'comic');

    expect(before.stageBgmIds).toEqual({});
  });
});

describe('canChooseStageBgm', () => {
  it('깬 스테이지만 고를 수 있다', () => {
    expect(canChooseStageBgm(true, 'comic')).toBe(true);
    expect(canChooseStageBgm(false, 'comic')).toBe(false);
  });

  it('전투 곡이 없는 스테이지는 깼어도 고를 것이 없다', () => {
    expect(canChooseStageBgm(true, null)).toBe(false);
  });
});
