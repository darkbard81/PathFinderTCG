import type { BgmTrack } from './playlist';
import type { LoadedSoundPlaylist, SoundTrackSource } from './playlist-loader';

/**
 * 어느 화면이 어떤 소리를 쓰는지 정하는 곳이다.
 *
 * 플레이리스트는 무엇이 있는지만 담는 목록이다. 그 중 무엇을 어디서 쓸지는 코드가
 * 정할 일이라 자산 쪽으로 내리지 않는다.
 */

/** 로그인부터 로비까지 흐르는 곡이다. */
export const MAIN_BGM_TRACK_ID = 'intro';

/** 메인 메뉴에 들어설 때 한 번 흐르는 대사다. */
export const MAIN_MENU_VOICE_TRACK_ID = 'title-intro';

/**
 * 로그인부터 로비까지 쓸 곡을 고른다.
 *
 * 정해 둔 id가 없으면 순번이 가장 앞선 곡으로 물러선다. 자산 목록은 빌드마다 바뀔 수
 * 있는데, 곡 하나가 빠졌다고 로비가 통째로 조용해지는 편이 더 나쁘다.
 * 로더가 이미 `sortSeq`로 정렬해 두므로 첫 항목이 순번이 가장 앞선 곡이다.
 */
export function selectMainBgmTrack(
  playlist: LoadedSoundPlaylist<BgmTrack>,
  trackId: string = MAIN_BGM_TRACK_ID,
): SoundTrackSource<BgmTrack> | null {
  return playlist.tracks.find((track) => track.id === trackId) ?? playlist.tracks[0] ?? null;
}
