import type { LobbyBgmPlayMode } from '../lobby/lobby-state';

/**
 * 로비 플레이리스트의 재생 순서를 정하는 순수 로직이다.
 *
 * 재생기와 떼어 둔다. WebAudio가 없는 node 환경에서도 "다음에 무엇을 트는가"를
 * 테스트할 수 있어야 한다. 셔플은 무작위라 난수원을 주입받는다.
 */

export type BgmQueueOptions = {
  /** 재생할 곡 id다. 적힌 순서가 순차 재생 순서다. */
  trackIds: readonly string[];
  mode: LobbyBgmPlayMode;
  /** 0 이상 1 미만을 돌려준다. 테스트가 고정한 값을 넣는다. */
  random?: () => number;
};

/**
 * 곡 목록을 한 바퀴 돌 순서로 만든다.
 *
 * 셔플은 매 바퀴 새로 섞는다. 한 번 섞어 두고 계속 돌면 두 번째 바퀴부터는
 * 순차 재생과 다를 바가 없다.
 */
export function buildBgmOrder(options: BgmQueueOptions): string[] {
  const trackIds = [...options.trackIds];
  if (options.mode !== 'shuffle' || trackIds.length < 2) {
    return trackIds;
  }

  const random = options.random ?? Math.random;
  // Fisher-Yates. 뒤에서부터 무작위 위치와 맞바꾼다.
  for (let index = trackIds.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    const swap = trackIds[index]!;
    trackIds[index] = trackIds[pick]!;
    trackIds[pick] = swap;
  }

  return trackIds;
}

/**
 * 한 바퀴를 다 돌아 새로 섞을 때, 앞 바퀴의 마지막 곡이 새 바퀴 첫 곡으로 오는 것을 막는다.
 *
 * 막지 않으면 같은 곡이 연달아 두 번 난다. 곡이 하나뿐이면 피할 수 없으므로 그대로 둔다.
 */
export function avoidRepeatAtSeam(order: string[], previousTrackId: string | null): string[] {
  if (order.length < 2 || previousTrackId === null || order[0] !== previousTrackId) {
    return order;
  }

  // 첫 곡을 두 번째와 맞바꾼다. 순서를 통째로 다시 섞을 이유가 없다.
  const next = [...order];
  next[0] = order[1]!;
  next[1] = order[0]!;
  return next;
}

/** 로비 플레이리스트가 실제로 있는 곡만 남기고 적힌 순서를 지킨다. */
export function selectPlayableTrackIds(
  trackIds: readonly string[],
  isPlayable: (trackId: string) => boolean,
): string[] {
  return trackIds.filter((trackId) => isPlayable(trackId));
}
