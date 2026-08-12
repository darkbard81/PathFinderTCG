import type { SaveSlotId } from './types';

/** 저장 슬롯 이름의 최대 길이다. DOM 입력과 서버 검증이 같은 값을 쓴다. */
export const SAVE_NAME_MAX_LENGTH = 40;

/** 슬롯 번호만으로 만드는 호환 기본 이름이다. */
export function createDefaultSaveName(slotId: SaveSlotId): string {
  return `Slot ${slotId}`;
}

/**
 * 저장 슬롯 이름의 앞뒤 공백을 걷어내고 공용 길이 규칙을 검증한다.
 * 빈 값이나 상한을 넘긴 값은 저장 경계에서 그대로 거부한다.
 */
export function normalizeSaveName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('saveName must be a string');
  }

  const saveName = value.trim();
  if (saveName.length === 0) {
    throw new Error('saveName must be a non-empty string');
  }
  if (saveName.length > SAVE_NAME_MAX_LENGTH) {
    throw new Error(`saveName must not exceed ${SAVE_NAME_MAX_LENGTH} characters`);
  }

  return saveName;
}
