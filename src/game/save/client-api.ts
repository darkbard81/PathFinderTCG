import type { CardInstance, SaveSlotId, SaveSlotState, SaveSlotSummary } from './types';
import type { StageProgressState } from '../stage/types';
import type { ApiFetch } from '../auth/client';

/** 인증된 요청 함수를 통해 계정 소유 저장 슬롯만 다루는 클라이언트다. */
export class SaveSlotsClient {
  constructor(private readonly request: ApiFetch) {}

  /** 현재 계정의 1~3번 저장 슬롯 요약을 반환한다. */
  fetchSummaries(): Promise<SaveSlotSummary[]> {
    return fetchSaveSlotSummaries(this.request);
  }

  /** 현재 계정의 지정 슬롯 원본 상태를 반환한다. */
  fetch(slotId: SaveSlotId): Promise<SaveSlotState> {
    return fetchSaveSlot(this.request, slotId);
  }

  /** 현재 계정의 지정 슬롯을 검증된 상태로 덮어쓴다. */
  save(state: SaveSlotState): Promise<SaveSlotState> {
    return saveSlotState(this.request, state);
  }

  /** 현재 계정의 빈 슬롯을 초기 상태로 생성한다. */
  initialize(slotId: SaveSlotId): Promise<{ state: SaveSlotState; summary: SaveSlotSummary }> {
    return initializeSaveSlot(this.request, slotId);
  }

  /** 현재 계정의 지정 슬롯을 삭제하고 빈 슬롯 요약을 반환한다. */
  delete(slotId: SaveSlotId): Promise<SaveSlotSummary> {
    return deleteSaveSlot(this.request, slotId);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCardInstance(value: unknown, zone: CardInstance['zone']): boolean {
  return (
    isRecord(value) &&
    typeof value.instanceId === 'string' &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.rarity === 'string' &&
    typeof value.type === 'string' &&
    Array.isArray(value.traits) &&
    Array.isArray(value.abilities) &&
    typeof value.description === 'string' &&
    typeof value.note === 'string' &&
    value.owner === 'PLAYER' &&
    value.zone === zone &&
    Number.isInteger(value.level ?? 1) &&
    Number.isInteger(value.exp ?? 0) &&
    Number.isInteger(value.hp) &&
    Number.isInteger(value.attack)
  );
}

function isSaveSlotSummary(value: unknown): value is SaveSlotSummary {
  return (
    isRecord(value) &&
    (value.slotId === 1 || value.slotId === 2 || value.slotId === 3) &&
    (typeof value.saveName === 'string' || value.saveName === null) &&
    (typeof value.updatedAt === 'string' || value.updatedAt === null) &&
    (typeof value.deckCardCount === 'number' || value.deckCardCount === null) &&
    (typeof value.leaderName === 'string' || value.leaderName === null) &&
    typeof value.isEmpty === 'boolean'
  );
}

function isSaveSlotsResponse(value: unknown): value is { slots: SaveSlotSummary[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.slots) &&
    value.slots.every((slot) => isSaveSlotSummary(slot))
  );
}

function isSaveSlotState(value: unknown): value is SaveSlotState {
  return (
    isRecord(value) &&
    value.schemaVersion === 3 &&
    (value.slotId === 1 || value.slotId === 2 || value.slotId === 3) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    typeof value.saveName === 'string' &&
    isRecord(value.deck) &&
    typeof value.deck.id === 'string' &&
    isCardInstance(value.deck.leader, 'LEADER') &&
    Array.isArray(value.deck.cards) &&
    value.deck.cards.every((entry) => isCardInstance(entry, 'DECK')) &&
    isRecord(value.collection) &&
    Array.isArray(value.collection.cards) &&
    value.collection.cards.every((entry) => isCardInstance(entry, 'COLLECTION')) &&
    isEquipmentState(value.equipment) &&
    isStageProgressState(value.stageProgress)
  );
}

function isEquipmentState(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.equipped) &&
    value.equipped.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.targetCardInstanceId === 'string' &&
        typeof entry.equipmentCardInstanceId === 'string',
    )
  );
}

function isStageProgressState(value: unknown): value is StageProgressState {
  return (
    isRecord(value) &&
    Array.isArray(value.clearedStageIds) &&
    value.clearedStageIds.every((stageId) => typeof stageId === 'string') &&
    (typeof value.lastSelectedStageId === 'string' || value.lastSelectedStageId === null)
  );
}

/**
 * 서버의 `/api/save-slots` 응답을 읽어 저장 슬롯 요약을 반환한다.
 * 응답 형식이 예상과 다르면 예외를 던져서 씬이 실패 상태를 처리하게 한다.
 */
async function fetchSaveSlotSummaries(request: ApiFetch): Promise<SaveSlotSummary[]> {
  const response = await request('/api/save-slots');
  if (!response.ok) {
    throw new Error(`Failed to load save slots: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as unknown;
  if (!isSaveSlotsResponse(data)) {
    throw new Error('Invalid save slot summary response');
  }

  return data.slots;
}

/**
 * 지정한 슬롯의 저장 상태를 읽어 세션 생성에 필요한 원본 데이터를 돌려준다.
 * 서버가 비정상 응답을 반환하면 런타임 검증 단계에서 중단한다.
 */
async function fetchSaveSlot(request: ApiFetch, slotId: SaveSlotId): Promise<SaveSlotState> {
  const response = await request(`/api/save-slots/${slotId}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as unknown;
  if (!isSaveSlotState(data)) {
    throw new Error('Invalid save slot state response');
  }

  return data;
}

/**
 * 저장 슬롯 상태를 서버에 덮어쓰고, 서버가 돌려준 저장 상태를 다시 검증한다.
 * 클라이언트가 만든 직렬화 결과와 서버 검증 스키마가 어긋나면 예외를 던진다.
 */
async function saveSlotState(request: ApiFetch, state: SaveSlotState): Promise<SaveSlotState> {
  const response = await request(`/api/save-slots/${state.slotId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(state),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as unknown;
  if (!isSaveSlotState(data)) {
    throw new Error('Invalid save slot state response');
  }

  return data;
}

/**
 * 비어 있는 저장 슬롯을 초기화하고, 초기 상태와 요약을 함께 반환한다.
 * 초기화 결과는 곧바로 전장 세션 생성에 사용된다.
 */
async function initializeSaveSlot(
  request: ApiFetch,
  slotId: SaveSlotId,
): Promise<{ state: SaveSlotState; summary: SaveSlotSummary }> {
  const response = await request(`/api/save-slots/${slotId}/initialize`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as unknown;
  if (!isRecord(data) || !isSaveSlotState(data.state) || !isSaveSlotSummary(data.summary)) {
    throw new Error('Invalid initialize save slot response');
  }

  return {
    state: data.state,
    summary: data.summary,
  };
}

/**
 * 지정한 슬롯의 저장 상태를 삭제하고 서버가 반환한 빈 슬롯 요약을 검증한다.
 * 삭제 결과가 요청한 슬롯과 일치하지 않으면 화면 상태를 갱신하지 않는다.
 */
async function deleteSaveSlot(request: ApiFetch, slotId: SaveSlotId): Promise<SaveSlotSummary> {
  const response = await request(`/api/save-slots/${slotId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as unknown;
  if (
    !isRecord(data) ||
    !isSaveSlotSummary(data.summary) ||
    data.summary.slotId !== slotId ||
    !data.summary.isEmpty
  ) {
    throw new Error('Invalid delete save slot response');
  }

  return data.summary;
}
