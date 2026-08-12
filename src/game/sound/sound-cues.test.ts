import { describe, expect, it } from 'vitest';
import type { BgmTrack } from './playlist';
import type { LoadedSoundPlaylist, SoundTrackSource } from './playlist-loader';
import { MAIN_BGM_TRACK_ID, selectMainBgmTrack } from './sound-cues';

function track(id: string, sortSeq: number): SoundTrackSource<BgmTrack> {
  return {
    id,
    sortSeq,
    title: id,
    file: `${id}.webm`,
    gainDb: 0,
    durationSec: 100,
    loopStart: null,
    loopEnd: null,
    url: `/tcg/sound/bgm/${id}.webm`,
  };
}

function playlist(tracks: SoundTrackSource<BgmTrack>[]): LoadedSoundPlaylist<BgmTrack> {
  return { channel: 'bgm', referenceLoudnessLufs: -16, tracks, missingTrackIds: [] };
}

describe('selectMainBgmTrack', () => {
  it('정해 둔 곡을 고른다', () => {
    const selected = selectMainBgmTrack(playlist([track('comic', 2), track(MAIN_BGM_TRACK_ID, 1)]));

    expect(selected?.id).toBe(MAIN_BGM_TRACK_ID);
  });

  it('정해 둔 곡이 없으면 순번이 앞선 곡으로 물러선다', () => {
    // 로더가 sortSeq로 정렬해 주므로 첫 항목이 순번이 가장 앞선 곡이다.
    const selected = selectMainBgmTrack(playlist([track('comic', 2), track('velocity', 3)]));

    expect(selected?.id).toBe('comic');
  });

  it('곡이 하나도 없으면 null이다', () => {
    expect(selectMainBgmTrack(playlist([]))).toBeNull();
  });

  it('쓸 곡을 바꿔 지정할 수 있다', () => {
    const selected = selectMainBgmTrack(playlist([track('intro', 1), track('comic', 2)]), 'comic');

    expect(selected?.id).toBe('comic');
  });
});
