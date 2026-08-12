import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REFERENCE_LOUDNESS_LUFS,
  normalizeBgmPlaylist,
  normalizeVoicePlaylist,
  resolveSoundAssetPath,
  SOUND_PLAYLIST_SCHEMA_VERSION,
} from './playlist';

function bgmTrack(overrides: Record<string, unknown> = {}) {
  return {
    id: 'intro',
    sortSeq: 1,
    title: '01. PF2eTCG Intro',
    file: 'intro.webm',
    gainDb: -1.1,
    durationSec: 239.261,
    loopStart: null,
    loopEnd: null,
    ...overrides,
  };
}

function bgmPlaylist(tracks: Record<string, unknown>[], overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: SOUND_PLAYLIST_SCHEMA_VERSION,
    channel: 'bgm',
    referenceLoudnessLufs: -16,
    tracks,
    ...overrides,
  };
}

describe('normalizeBgmPlaylist', () => {
  it('트랙을 그대로 읽는다', () => {
    const playlist = normalizeBgmPlaylist(bgmPlaylist([bgmTrack()]));

    expect(playlist).toEqual({
      schemaVersion: 1,
      channel: 'bgm',
      referenceLoudnessLufs: -16,
      tracks: [
        {
          id: 'intro',
          sortSeq: 1,
          title: '01. PF2eTCG Intro',
          file: 'intro.webm',
          gainDb: -1.1,
          durationSec: 239.261,
          loopStart: null,
          loopEnd: null,
        },
      ],
    });
  });

  it('배열 순서가 아니라 sortSeq로 정렬한다', () => {
    const playlist = normalizeBgmPlaylist(
      bgmPlaylist([
        bgmTrack({ id: 'c', sortSeq: 3, title: '03. C', file: 'c.webm' }),
        bgmTrack({ id: 'a', sortSeq: 1, title: '01. A', file: 'a.webm' }),
        bgmTrack({ id: 'b', sortSeq: 2, title: '02. B', file: 'b.webm' }),
      ]),
    );

    expect(playlist.tracks.map((track) => track.id)).toEqual(['a', 'b', 'c']);
  });

  it('referenceLoudnessLufs가 없으면 기본값을 준다', () => {
    const playlist = normalizeBgmPlaylist(
      bgmPlaylist([bgmTrack()], { referenceLoudnessLufs: undefined }),
    );

    expect(playlist.referenceLoudnessLufs).toBe(DEFAULT_REFERENCE_LOUDNESS_LUFS);
  });

  it('제목의 순번과 sortSeq가 어긋나면 거부한다', () => {
    expect(() => normalizeBgmPlaylist(bgmPlaylist([bgmTrack({ sortSeq: 2 })]))).toThrow('sortSeq');
  });

  it('순번을 달지 않은 제목은 검사하지 않는다', () => {
    expect(
      normalizeBgmPlaylist(bgmPlaylist([bgmTrack({ sortSeq: 7, title: 'PF2eTCG Intro' })])),
    ).toMatchObject({ tracks: [{ sortSeq: 7, title: 'PF2eTCG Intro' }] });
  });

  it('id와 sortSeq 중복을 거부한다', () => {
    expect(() =>
      normalizeBgmPlaylist(
        bgmPlaylist([bgmTrack(), bgmTrack({ sortSeq: 2, title: '02. Another' })]),
      ),
    ).toThrow('id must be unique');
    expect(() =>
      normalizeBgmPlaylist(
        bgmPlaylist([bgmTrack(), bgmTrack({ id: 'other', title: '01. Another' })]),
      ),
    ).toThrow('sortSeq must be unique');
  });

  it('루프 구간은 둘 다 있거나 둘 다 없어야 한다', () => {
    expect(() => normalizeBgmPlaylist(bgmPlaylist([bgmTrack({ loopStart: 8 })]))).toThrow(
      'both loopStart and loopEnd',
    );
    expect(
      normalizeBgmPlaylist(bgmPlaylist([bgmTrack({ loopStart: 8, loopEnd: 72 })])).tracks[0],
    ).toMatchObject({ loopStart: 8, loopEnd: 72 });
  });

  it('뒤집히거나 길이를 넘는 루프 구간을 거부한다', () => {
    expect(() =>
      normalizeBgmPlaylist(bgmPlaylist([bgmTrack({ loopStart: 72, loopEnd: 8 })])),
    ).toThrow('less than loopEnd');
    expect(() =>
      normalizeBgmPlaylist(bgmPlaylist([bgmTrack({ loopStart: -1, loopEnd: 8 })])),
    ).toThrow('not be negative');
    expect(() =>
      normalizeBgmPlaylist(bgmPlaylist([bgmTrack({ loopStart: 8, loopEnd: 999 })])),
    ).toThrow('exceed durationSec');
  });

  it('구조가 어긋난 값을 거부한다', () => {
    expect(() => normalizeBgmPlaylist(null)).toThrow('playlist must be an object');
    expect(() => normalizeBgmPlaylist([])).toThrow('playlist must be an object');
    expect(() => normalizeBgmPlaylist(bgmPlaylist([bgmTrack()], { schemaVersion: 2 }))).toThrow(
      'schemaVersion',
    );
    expect(() => normalizeBgmPlaylist(bgmPlaylist([bgmTrack()], { tracks: {} }))).toThrow(
      'tracks must be an array',
    );
    expect(() => normalizeBgmPlaylist(bgmPlaylist([bgmTrack({ id: '  ' })]))).toThrow(
      'id must be a non-empty string',
    );
    expect(() => normalizeBgmPlaylist(bgmPlaylist([bgmTrack({ sortSeq: 0 })]))).toThrow(
      'sortSeq must be an integer of 1 or more',
    );
    expect(() => normalizeBgmPlaylist(bgmPlaylist([bgmTrack({ durationSec: 0 })]))).toThrow(
      'durationSec must be greater than 0',
    );
    expect(() => normalizeBgmPlaylist(bgmPlaylist([bgmTrack({ gainDb: -80 })]))).toThrow('gainDb');
    expect(() => normalizeBgmPlaylist(bgmPlaylist([bgmTrack({ gainDb: 'loud' })]))).toThrow(
      'gainDb must be a finite number',
    );
  });

  it('voice 플레이리스트를 bgm으로 읽으려 하면 거부한다', () => {
    expect(() => normalizeBgmPlaylist(bgmPlaylist([bgmTrack()], { channel: 'voice' }))).toThrow(
      'channel must be bgm',
    );
  });

  it('file이 폴더를 벗어나는 이름을 거부한다', () => {
    for (const file of ['../secret.webm', 'nested/intro.webm', 'nested\\intro.webm']) {
      expect(() => normalizeBgmPlaylist(bgmPlaylist([bgmTrack({ file })]))).toThrow(
        'file name without a path',
      );
    }
  });
});

describe('normalizeVoicePlaylist', () => {
  const voicePlaylist = (track: Record<string, unknown> = {}) => ({
    schemaVersion: SOUND_PLAYLIST_SCHEMA_VERSION,
    channel: 'voice',
    referenceLoudnessLufs: -16,
    tracks: [
      {
        id: 'title-intro',
        sortSeq: 1,
        title: 'Title Intro',
        file: 'title-intro.webm',
        speakerId: null,
        subtitle: null,
        gainDb: -1.9,
        durationSec: 1.523,
        ...track,
      },
    ],
  });

  it('화자와 자막이 비어 있어도 읽는다', () => {
    expect(normalizeVoicePlaylist(voicePlaylist()).tracks[0]).toMatchObject({
      id: 'title-intro',
      speakerId: null,
      subtitle: null,
    });
  });

  it('화자와 자막이 채워져 있으면 그대로 읽는다', () => {
    expect(
      normalizeVoicePlaylist(voicePlaylist({ speakerId: 'minerva', subtitle: '기다렸다' }))
        .tracks[0],
    ).toMatchObject({ speakerId: 'minerva', subtitle: '기다렸다' });
  });

  it('화자를 빈 문자열로 두면 거부한다', () => {
    expect(() => normalizeVoicePlaylist(voicePlaylist({ speakerId: '   ' }))).toThrow(
      'speakerId must be a non-empty string',
    );
  });
});

describe('resolveSoundAssetPath', () => {
  it('manifest에서 찾을 수 있는 경로로 바꾼다', () => {
    expect(resolveSoundAssetPath('bgm', 'intro.webm')).toBe('sound/bgm/intro.webm');
    expect(resolveSoundAssetPath('voice', 'title-intro.webm')).toBe('sound/voice/title-intro.webm');
  });
});
