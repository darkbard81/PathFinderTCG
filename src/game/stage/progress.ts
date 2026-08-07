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
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}
