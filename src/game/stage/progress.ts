import type { StageProgressState } from './types';

type JsonRecord = Record<string, unknown>;

/**
 * 새 저장 슬롯과 기존 저장 슬롯 보정에 사용할 기본 Stage 진행 상태를 만든다.
 * 배열을 매번 새로 만들어 호출자가 진행 상태를 독립적으로 수정할 수 있게 한다.
 */
export function createDefaultStageProgressState(): StageProgressState {
  return {
    clearedStageIds: [],
    lastSelectedStageId: null,
    // 비워 둔다. 고른 것이 없으면 스테이지 데이터의 기본 곡을 그대로 쓴다.
    stageBgmIds: {},
  };
}

/**
 * 저장 파일에서 읽은 Stage 진행 상태를 현재 런타임 타입으로 정규화한다.
 * 과거 저장 파일처럼 필드가 없으면 기본값을 반환하고, 잘못된 구조가 있으면 예외를 던진다.
 */
export function normalizeStageProgressState(value: unknown): StageProgressState {
  if (value === undefined) {
    return createDefaultStageProgressState();
  }

  if (!isRecord(value)) {
    throw new Error('stageProgress must be a stage progress state');
  }

  if (
    !Array.isArray(value.clearedStageIds) ||
    !value.clearedStageIds.every((stageId) => typeof stageId === 'string')
  ) {
    throw new Error('stageProgress.clearedStageIds must be a string array');
  }

  if (typeof value.lastSelectedStageId !== 'string' && value.lastSelectedStageId !== null) {
    throw new Error('stageProgress.lastSelectedStageId must be a string or null');
  }

  return {
    clearedStageIds: [...value.clearedStageIds],
    lastSelectedStageId: value.lastSelectedStageId,
    stageBgmIds: readStageBgmIds(value.stageBgmIds),
  };
}

/**
 * 스테이지별로 고른 전투 BGM을 읽는다.
 *
 * 실제로 있는 곡인지는 보지 않는다. 곡 목록은 런타임 자산이라 저장 스키마가 알 수 없다.
 * 빈 값은 담지 않는다. 지운 것과 오타를 구분할 수 없어, 지울 때는 항목 자체를 뺀다.
 */
function readStageBgmIds(value: unknown): Record<string, string> {
  if (value === undefined || value === null) {
    return {};
  }

  // 배열도 typeof는 object다. 스테이지 id로 찾는 표라 배열이면 잘못 쓴 것이다.
  if (!isRecord(value) || Array.isArray(value)) {
    throw new Error('stageProgress.stageBgmIds must be an object');
  }

  const stageBgmIds: Record<string, string> = {};
  for (const [stageId, trackId] of Object.entries(value)) {
    if (typeof trackId !== 'string' || trackId.length === 0) {
      throw new Error(`stageProgress.stageBgmIds.${stageId} must be a non-empty string`);
    }
    stageBgmIds[stageId] = trackId;
  }

  return stageBgmIds;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}
