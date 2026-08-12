import { describe, expect, it } from 'vitest';
import { avoidRepeatAtSeam, buildBgmOrder, selectPlayableTrackIds } from './bgm-queue';

/** Fisher-Yates가 부르는 순서대로 값을 돌려준다. 섞임을 예측 가능하게 만든다. */
function fixedRandom(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('buildBgmOrder', () => {
  it('순차 재생은 적힌 순서를 그대로 쓴다', () => {
    expect(buildBgmOrder({ trackIds: ['a', 'b', 'c'], mode: 'sequential' })).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const trackIds = ['a', 'b', 'c'];

    buildBgmOrder({ trackIds, mode: 'shuffle', random: fixedRandom([0, 0]) });

    expect(trackIds).toEqual(['a', 'b', 'c']);
  });

  it('셔플은 같은 곡을 빠짐없이 한 번씩 담는다', () => {
    const trackIds = ['a', 'b', 'c', 'd', 'e'];

    const order = buildBgmOrder({
      trackIds,
      mode: 'shuffle',
      random: fixedRandom([0.9, 0.1, 0.5, 0]),
    });

    expect([...order].sort()).toEqual([...trackIds].sort());
  });

  it('셔플이 실제로 순서를 바꾼다', () => {
    const order = buildBgmOrder({
      trackIds: ['a', 'b', 'c'],
      mode: 'shuffle',
      // 마지막 자리에 첫 곡을, 그다음 자리에 두 번째 곡을 올린다.
      random: fixedRandom([0, 0]),
    });

    expect(order).toEqual(['b', 'c', 'a']);
  });

  it('곡이 하나뿐이면 섞을 것이 없다', () => {
    expect(buildBgmOrder({ trackIds: ['a'], mode: 'shuffle' })).toEqual(['a']);
    expect(buildBgmOrder({ trackIds: [], mode: 'shuffle' })).toEqual([]);
  });
});

describe('avoidRepeatAtSeam', () => {
  it('새 바퀴 첫 곡이 앞 바퀴 마지막 곡이면 두 번째와 맞바꾼다', () => {
    // 막지 않으면 같은 곡이 연달아 두 번 난다.
    expect(avoidRepeatAtSeam(['a', 'b', 'c'], 'a')).toEqual(['b', 'a', 'c']);
  });

  it('겹치지 않으면 그대로 둔다', () => {
    expect(avoidRepeatAtSeam(['a', 'b', 'c'], 'c')).toEqual(['a', 'b', 'c']);
    expect(avoidRepeatAtSeam(['a', 'b', 'c'], null)).toEqual(['a', 'b', 'c']);
  });

  it('곡이 하나뿐이면 피할 수 없으므로 그대로 둔다', () => {
    expect(avoidRepeatAtSeam(['a'], 'a')).toEqual(['a']);
  });
});

describe('selectPlayableTrackIds', () => {
  it('없는 곡을 걸러 내고 적힌 순서를 지킨다', () => {
    const playable = new Set(['a', 'c']);

    expect(selectPlayableTrackIds(['c', '사라진곡', 'a'], (id) => playable.has(id))).toEqual([
      'c',
      'a',
    ]);
  });
});
