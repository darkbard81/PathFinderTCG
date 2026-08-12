import { joinAssetUrl, type AssetsManifest } from '../assets/manifest';
import {
  normalizeBgmPlaylist,
  normalizeVoicePlaylist,
  resolveSoundAssetPath,
  resolveSoundPlaylistPath,
  type BgmTrack,
  type SoundChannel,
  type SoundPlaylist,
  type SoundTrack,
  type VoiceTrack,
} from './playlist';

/**
 * 플레이리스트 응답에서 이 로더가 쓰는 부분만 추린 모양이다.
 * 테스트가 `Response` 전체를 흉내 내지 않아도 되게 좁게 잡는다.
 */
export type PlaylistResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
};

/** 플레이리스트를 받아 오는 함수다. 주입해 두어 테스트가 대역을 넣는다. */
export type PlaylistFetch = (url: string) => Promise<PlaylistResponse>;

/** 재생기가 바로 쓸 수 있게 URL까지 붙인 트랙이다. */
export type SoundTrackSource<TTrack extends SoundTrack = SoundTrack> = TTrack & {
  url: string;
};

export type LoadedSoundPlaylist<TTrack extends SoundTrack = SoundTrack> = {
  channel: SoundChannel;
  referenceLoudnessLufs: number;
  tracks: SoundTrackSource<TTrack>[];
  /**
   * manifest에 자산이 없어 뺀 트랙 id다.
   * 호출자가 경고로 남긴다. 한 줄이 잘못됐다고 소리를 통째로 잃지 않는다.
   */
  missingTrackIds: string[];
};

export type LoadSoundPlaylistOptions = {
  assetBaseUrl: string;
  /** 이미 받아 둔 `assets.json`이다. 트랙이 가리키는 자산이 실재하는지 여기서 본다. */
  manifest: AssetsManifest;
  fetch?: PlaylistFetch;
};

/**
 * 트랙을 id로 찾는다. 없으면 null이다.
 *
 * 없을 때 다른 트랙으로 물러서지 않는다. 대사나 효과음은 자리에 맞는 소리가 아니면
 * 안 나는 편이 낫다. 무음이 되면 곤란한 BGM만 `selectMainBgmTrack`이 따로 물러선다.
 */
export function findSoundTrack<TTrack extends SoundTrack>(
  playlist: LoadedSoundPlaylist<TTrack>,
  trackId: string,
): SoundTrackSource<TTrack> | null {
  return playlist.tracks.find((track) => track.id === trackId) ?? null;
}

/** bgm 플레이리스트를 받아 정규화하고 재생 URL을 붙인다. */
export function loadBgmPlaylist(
  options: LoadSoundPlaylistOptions,
): Promise<LoadedSoundPlaylist<BgmTrack>> {
  return loadSoundPlaylist('bgm', normalizeBgmPlaylist, options);
}

/** voice 플레이리스트를 받아 정규화하고 재생 URL을 붙인다. */
export function loadVoicePlaylist(
  options: LoadSoundPlaylistOptions,
): Promise<LoadedSoundPlaylist<VoiceTrack>> {
  return loadSoundPlaylist('voice', normalizeVoicePlaylist, options);
}

/**
 * 플레이리스트를 받아 정규화하고 manifest와 대조해 재생 URL을 붙인다.
 *
 * 받아오기와 정규화가 실패하면 던진다. 소리는 없어도 게임이 돌아가야 하므로
 * 삼키는 판단은 이 함수가 아니라 부르는 쪽이 한다.
 */
async function loadSoundPlaylist<TTrack extends SoundTrack>(
  channel: SoundChannel,
  normalize: (value: unknown) => SoundPlaylist<TTrack>,
  options: LoadSoundPlaylistOptions,
): Promise<LoadedSoundPlaylist<TTrack>> {
  const request = options.fetch ?? ((url: string) => fetch(url));
  const url = joinAssetUrl(options.assetBaseUrl, resolveSoundPlaylistPath(channel));
  const response = await request(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load ${channel} playlist: ${response.status} ${response.statusText}`,
    );
  }

  return resolveTrackSources(normalize(await response.json()), options);
}

/**
 * 트랙이 가리키는 파일을 manifest에서 찾아 URL을 붙인다.
 *
 * manifest에 없는 파일은 오타이거나 자산 트리에서 빠진 것이다. 그 트랙만 빼고
 * 나머지는 살린다. 프리로드가 개별 실패를 모아 돌려주는 것과 같은 태도다.
 * 조용히 버리지는 않는다. 뺀 id를 함께 돌려주어 호출자가 알 수 있게 한다.
 */
function resolveTrackSources<TTrack extends SoundTrack>(
  playlist: SoundPlaylist<TTrack>,
  options: LoadSoundPlaylistOptions,
): LoadedSoundPlaylist<TTrack> {
  const knownPaths = new Set(options.manifest.audio.map((entry) => entry.path));
  const tracks: SoundTrackSource<TTrack>[] = [];
  const missingTrackIds: string[] = [];

  for (const track of playlist.tracks) {
    const assetPath = resolveSoundAssetPath(playlist.channel, track.file);
    if (!knownPaths.has(assetPath)) {
      missingTrackIds.push(track.id);
      continue;
    }

    tracks.push({ ...track, url: joinAssetUrl(options.assetBaseUrl, assetPath) });
  }

  return {
    channel: playlist.channel,
    referenceLoudnessLufs: playlist.referenceLoudnessLufs,
    tracks,
    missingTrackIds,
  };
}
