import { describe, expect, it, vi } from 'vitest';
import type { AssetsManifest } from '../assets/manifest';
import {
  findSoundTrack,
  loadBgmPlaylist,
  loadVoicePlaylist,
  type LoadedSoundPlaylist,
  type PlaylistFetch,
} from './playlist-loader';
import type { BgmTrack } from './playlist';

function createManifest(paths: string[]): AssetsManifest {
  return {
    assetBaseUrl: '/tcg',
    textures: [],
    videos: [],
    audio: paths.map((path, index) => ({ key: `sound.${index}`, path, revision: `rev${index}` })),
    manifestRevision: 'rev',
    schemaVersion: 3,
    revisionAlgorithm: 'sha256-12hex',
  };
}

function createFetch(body: unknown, ok = true): PlaylistFetch {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 404,
      statusText: ok ? 'OK' : 'Not Found',
      json: () => Promise.resolve(body),
    }),
  );
}

function bgmBody(tracks: Record<string, unknown>[]) {
  return { schemaVersion: 1, channel: 'bgm', referenceLoudnessLufs: -16, tracks };
}

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

describe('loadBgmPlaylist', () => {
  it('플레이리스트를 받아 정규화하고 재생 URL을 붙인다', async () => {
    const fetchPlaylist = createFetch(bgmBody([bgmTrack()]));

    const loaded = await loadBgmPlaylist({
      assetBaseUrl: '/tcg',
      manifest: createManifest(['sound/bgm/intro.webm']),
      fetch: fetchPlaylist,
    });

    expect(fetchPlaylist).toHaveBeenCalledWith('/tcg/sound/bgm/playlist.json');
    expect(loaded).toEqual({
      channel: 'bgm',
      referenceLoudnessLufs: -16,
      missingTrackIds: [],
      tracks: [{ ...bgmTrack(), url: '/tcg/sound/bgm/intro.webm' }],
    });
  });

  it('manifest에 없는 트랙만 빼고 뺀 id를 알려준다', async () => {
    const loaded = await loadBgmPlaylist({
      assetBaseUrl: '/tcg',
      manifest: createManifest(['sound/bgm/intro.webm']),
      fetch: createFetch(
        bgmBody([
          bgmTrack(),
          bgmTrack({ id: 'gone', sortSeq: 2, title: '02. Gone', file: 'gone.webm' }),
        ]),
      ),
    });

    expect(loaded.tracks.map((track) => track.id)).toEqual(['intro']);
    expect(loaded.missingTrackIds).toEqual(['gone']);
  });

  it('assetBaseUrl을 정규화해 URL을 만든다', async () => {
    const fetchPlaylist = createFetch(bgmBody([bgmTrack()]));

    const loaded = await loadBgmPlaylist({
      assetBaseUrl: 'static/tcg/',
      manifest: createManifest(['sound/bgm/intro.webm']),
      fetch: fetchPlaylist,
    });

    expect(fetchPlaylist).toHaveBeenCalledWith('/static/tcg/sound/bgm/playlist.json');
    expect(loaded.tracks[0]?.url).toBe('/static/tcg/sound/bgm/intro.webm');
  });

  it('응답이 실패하면 상태를 담아 던진다', async () => {
    await expect(
      loadBgmPlaylist({
        assetBaseUrl: '/tcg',
        manifest: createManifest([]),
        fetch: createFetch(null, false),
      }),
    ).rejects.toThrow('Failed to load bgm playlist: 404 Not Found');
  });

  it('정규화가 거부하는 플레이리스트는 그대로 던진다', async () => {
    await expect(
      loadBgmPlaylist({
        assetBaseUrl: '/tcg',
        manifest: createManifest(['sound/bgm/intro.webm']),
        fetch: createFetch(bgmBody([bgmTrack({ sortSeq: 9 })])),
      }),
    ).rejects.toThrow('sortSeq');
  });

  it('voice 플레이리스트를 bgm으로 읽으려 하면 거부한다', async () => {
    await expect(
      loadBgmPlaylist({
        assetBaseUrl: '/tcg',
        manifest: createManifest(['sound/bgm/intro.webm']),
        fetch: createFetch({ ...bgmBody([bgmTrack()]), channel: 'voice' }),
      }),
    ).rejects.toThrow('channel must be bgm');
  });
});

describe('loadVoicePlaylist', () => {
  it('voice 폴더의 플레이리스트를 읽는다', async () => {
    const fetchPlaylist = createFetch({
      schemaVersion: 1,
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
        },
      ],
    });

    const loaded = await loadVoicePlaylist({
      assetBaseUrl: '/tcg',
      manifest: createManifest(['sound/voice/title-intro.webm']),
      fetch: fetchPlaylist,
    });

    expect(fetchPlaylist).toHaveBeenCalledWith('/tcg/sound/voice/playlist.json');
    expect(loaded.channel).toBe('voice');
    expect(loaded.tracks[0]).toMatchObject({
      id: 'title-intro',
      url: '/tcg/sound/voice/title-intro.webm',
      speakerId: null,
    });
  });
});

describe('findSoundTrack', () => {
  const playlist: LoadedSoundPlaylist<BgmTrack> = {
    channel: 'bgm',
    referenceLoudnessLufs: -16,
    missingTrackIds: [],
    tracks: [
      { ...bgmTrack(), url: '/tcg/sound/bgm/intro.webm' } as never,
      { ...bgmTrack({ id: 'comic', sortSeq: 2, title: '02. Comic' }), url: 'x' } as never,
    ],
  };

  it('id로 찾는다', () => {
    expect(findSoundTrack(playlist, 'comic')?.id).toBe('comic');
  });

  it('없으면 다른 트랙으로 물러서지 않고 null이다', () => {
    // 자리에 맞는 대사가 아니면 안 나는 편이 낫다. 물러서는 것은 BGM만이다.
    expect(findSoundTrack(playlist, 'nope')).toBeNull();
  });
});
