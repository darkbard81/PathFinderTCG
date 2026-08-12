import { describe, expect, it } from 'vitest';
import { normalizeStageProgressState } from './progress';
describe('스테이지별 전투 BGM', () => {
  const base = { clearedStageIds: [], lastSelectedStageId: null };

  it('schemaVersion 10 이하의 누락을 빈 표로 채운다', () => {
    // 고른 것이 없으면 스테이지 데이터의 기본 곡을 그대로 쓴다.
    expect(normalizeStageProgressState(base).stageBgmIds).toEqual({});
  });

  it('고른 곡을 스테이지마다 보존한다', () => {
    expect(
      normalizeStageProgressState({ ...base, stageBgmIds: { level01: 'comic' } }).stageBgmIds,
    ).toEqual({ level01: 'comic' });
  });

  it('없는 곡 id도 그대로 둔다', () => {
    // 곡 목록은 런타임 자산이라 저장 스키마가 알 수 없다. 거르는 일은 화면이 맡는다.
    expect(
      normalizeStageProgressState({ ...base, stageBgmIds: { level01: '사라진곡' } }).stageBgmIds,
    ).toEqual({ level01: '사라진곡' });
  });

  it('구조가 어긋난 값을 거부한다', () => {
    expect(() => normalizeStageProgressState({ ...base, stageBgmIds: [] })).toThrow('stageBgmIds');
    expect(() => normalizeStageProgressState({ ...base, stageBgmIds: { level01: 1 } })).toThrow(
      'stageBgmIds.level01',
    );
    expect(() => normalizeStageProgressState({ ...base, stageBgmIds: { level01: '' } })).toThrow(
      'stageBgmIds.level01',
    );
  });
});
