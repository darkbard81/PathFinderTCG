import type { StageDefinition, StageProgressState } from './types';

/**
 * 스테이지에서 흘릴 전투 BGM을 정한다.
 *
 * 사용자가 고른 것이 있으면 그것을 쓰고, 없으면 스테이지 데이터의 기본값을 쓴다.
 * 저장에 남은 곡이 자산에서 사라졌으면 기본값으로 되돌린다. 곡 목록은 빌드마다
 * 바뀌는 런타임 자산이라, 저장만 믿으면 없는 곡을 틀려 들다 무음이 된다.
 *
 * `null`은 이 스테이지에 전투 곡이 없다는 뜻이다. 들어올 때 흐르던 곡이 이어진다.
 */
export function resolveStageBgmId(
  stage: StageDefinition,
  progress: StageProgressState,
  isPlayable: (trackId: string) => boolean,
): string | null {
  const chosen = progress.stageBgmIds[stage.id];
  if (chosen !== undefined && isPlayable(chosen)) {
    return chosen;
  }

  if (stage.battleBgmId !== null && isPlayable(stage.battleBgmId)) {
    return stage.battleBgmId;
  }

  return null;
}

/**
 * 이 스테이지의 전투 BGM을 사용자가 고를 수 있는지다.
 *
 * 깬 스테이지에서만 고를 수 있다. 아직 안 깬 스테이지는 어떤 곡이 나올지 보여 주되
 * 바꾸지는 못하게 한다. 전투 곡이 정해지지 않은 스테이지는 깼어도 고를 것이 없다.
 */
export function canChooseStageBgm(cleared: boolean, resolvedTrackId: string | null): boolean {
  return cleared && resolvedTrackId !== null;
}

/**
 * 스테이지에 고른 곡을 적어 넣은 새 진행 상태를 만든다.
 *
 * 스테이지 데이터의 기본값과 같은 곡을 고르면 항목을 지운다. 덮어쓴 것만 담아 두면
 * 나중에 기본 곡을 바꿨을 때, 손대지 않은 스테이지는 새 기본값을 그대로 따라간다.
 */
export function withStageBgmId(
  progress: StageProgressState,
  stage: StageDefinition,
  trackId: string,
): StageProgressState {
  const stageBgmIds = { ...progress.stageBgmIds };
  if (trackId === stage.battleBgmId) {
    delete stageBgmIds[stage.id];
  } else {
    stageBgmIds[stage.id] = trackId;
  }

  return { ...progress, stageBgmIds };
}
