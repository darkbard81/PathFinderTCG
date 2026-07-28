import {
  parseSaveSlotState,
  type CompletedStageRun,
  type SaveSlotState,
  type StableId,
  type StageRunResult,
  type StartedStageRun,
} from '../data/index.js';

export interface AuthenticatedUser {
  readonly id: StableId;
  readonly username: string;
}

export type SaveSlotId = SaveSlotState['slotId'];

export interface EmptySaveSlotSummary {
  readonly slotId: SaveSlotId;
  readonly status: 'EMPTY';
  readonly lastModifiedAt: null;
  readonly selectedDeckId: null;
  readonly deckCount: 0;
  readonly ownedCardCount: 0;
}

export interface OccupiedSaveSlotSummary {
  readonly slotId: SaveSlotId;
  readonly status: 'OCCUPIED';
  readonly lastModifiedAt: string;
  readonly selectedDeckId: StableId | null;
  readonly deckCount: number;
  readonly ownedCardCount: number;
}

export type SaveSlotSummary = EmptySaveSlotSummary | OccupiedSaveSlotSummary;

export interface StageRunCompletionReceipt {
  readonly stageRun: CompletedStageRun;
  readonly saveSlot: SaveSlotState;
}

export interface ApiErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly details: readonly unknown[];
}

export class PathfinderApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: readonly unknown[];

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'PathfinderApiError';
    this.status = status;
    this.code = payload.code;
    this.details = payload.details;
  }
}

export type ApiFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface PathfinderGameApi {
  register(username: string, password: string): Promise<AuthenticatedUser>;
  login(username: string, password: string): Promise<AuthenticatedUser>;
  logout(): Promise<void>;
  getAuthenticatedUser(): Promise<AuthenticatedUser>;
  listSaveSlots(): Promise<readonly SaveSlotSummary[]>;
  createSaveSlot(slotId: SaveSlotId): Promise<SaveSlotState>;
  getSaveSlot(slotId: SaveSlotId): Promise<SaveSlotState>;
  updateDeck(
    slotId: SaveSlotId,
    deckId: StableId,
    deck: SaveSlotState['decks'][number],
  ): Promise<SaveSlotState>;
  startStageRun(slotId: SaveSlotId, stageId: StableId): Promise<StartedStageRun>;
  completeStageRun(
    slotId: SaveSlotId,
    runId: StableId,
    result: StageRunResult,
  ): Promise<StageRunCompletionReceipt>;
  deleteSaveSlot(slotId: SaveSlotId): Promise<void>;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseUser(value: unknown): AuthenticatedUser {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    typeof value.username !== 'string' ||
    value.username.length === 0
  ) {
    throw new Error('API 사용자 응답이 유효하지 않습니다.');
  }

  return Object.freeze({
    id: value.id,
    username: value.username,
  });
}

function parseUserResponse(value: unknown): AuthenticatedUser {
  if (!isRecord(value) || !('user' in value)) {
    throw new Error('API 사용자 응답 wrapper가 유효하지 않습니다.');
  }

  return parseUser(value.user);
}

function parseSaveSlotId(value: unknown): SaveSlotId {
  if (value !== 1 && value !== 2 && value !== 3) {
    throw new Error('API 세이브 슬롯 번호가 유효하지 않습니다.');
  }

  return value;
}

function parseSaveSlotSummary(value: unknown): SaveSlotSummary {
  if (!isRecord(value)) {
    throw new Error('API 세이브 슬롯 요약이 객체가 아닙니다.');
  }

  const slotId = parseSaveSlotId(value.slotId);

  if (value.status === 'EMPTY') {
    if (
      value.lastModifiedAt !== null ||
      value.selectedDeckId !== null ||
      value.deckCount !== 0 ||
      value.ownedCardCount !== 0
    ) {
      throw new Error('API의 빈 세이브 슬롯 요약이 유효하지 않습니다.');
    }

    return Object.freeze({
      slotId,
      status: 'EMPTY',
      lastModifiedAt: null,
      selectedDeckId: null,
      deckCount: 0,
      ownedCardCount: 0,
    });
  }

  if (
    value.status !== 'OCCUPIED' ||
    typeof value.lastModifiedAt !== 'string' ||
    (value.selectedDeckId !== null && typeof value.selectedDeckId !== 'string') ||
    typeof value.deckCount !== 'number' ||
    !Number.isInteger(value.deckCount) ||
    value.deckCount < 0 ||
    typeof value.ownedCardCount !== 'number' ||
    !Number.isInteger(value.ownedCardCount) ||
    value.ownedCardCount < 0
  ) {
    throw new Error('API의 사용 중인 세이브 슬롯 요약이 유효하지 않습니다.');
  }

  return Object.freeze({
    slotId,
    status: 'OCCUPIED',
    lastModifiedAt: value.lastModifiedAt,
    selectedDeckId: value.selectedDeckId,
    deckCount: value.deckCount,
    ownedCardCount: value.ownedCardCount,
  });
}

function parseSaveSlotsResponse(value: unknown): readonly SaveSlotSummary[] {
  if (!isRecord(value) || !Array.isArray(value.saveSlots)) {
    throw new Error('API 세이브 슬롯 목록 응답 wrapper가 유효하지 않습니다.');
  }

  const summaries = value.saveSlots.map(parseSaveSlotSummary);
  const slotIds = summaries.map((summary) => summary.slotId);

  if (summaries.length !== 3 || slotIds[0] !== 1 || slotIds[1] !== 2 || slotIds[2] !== 3) {
    throw new Error('API 세이브 슬롯 목록은 1~3번을 순서대로 포함해야 합니다.');
  }

  return Object.freeze(summaries);
}

function parseSaveSlotResponse(value: unknown): SaveSlotState {
  if (!isRecord(value) || !('saveSlot' in value)) {
    throw new Error('API 세이브 슬롯 응답 wrapper가 유효하지 않습니다.');
  }

  const parsed = parseSaveSlotState(value.saveSlot);

  if (!parsed.success) {
    throw new Error('API 세이브 슬롯 응답이 현재 Schema를 만족하지 않습니다.');
  }

  return parsed.value;
}

function parseStartedStageRunResponse(value: unknown): StartedStageRun {
  if (!isRecord(value) || !isRecord(value.stageRun)) {
    throw new Error('API Stage 실행 시작 응답 wrapper가 유효하지 않습니다.');
  }

  const stageRun = value.stageRun;
  if (
    typeof stageRun.runId !== 'string' ||
    stageRun.runId.length === 0 ||
    typeof stageRun.stageId !== 'string' ||
    stageRun.stageId.length === 0 ||
    typeof stageRun.seed !== 'number' ||
    !Number.isInteger(stageRun.seed) ||
    stageRun.seed < 0 ||
    stageRun.seed > 0xffff_ffff ||
    typeof stageRun.startedAt !== 'string' ||
    Number.isNaN(Date.parse(stageRun.startedAt))
  ) {
    throw new Error('API Stage 실행 시작 응답이 유효하지 않습니다.');
  }

  return Object.freeze({
    runId: stageRun.runId,
    stageId: stageRun.stageId,
    seed: stageRun.seed,
    startedAt: stageRun.startedAt,
  });
}

function parseCompletedStageRunResponse(value: unknown): StageRunCompletionReceipt {
  if (!isRecord(value) || !isRecord(value.stageRun) || !('saveSlot' in value)) {
    throw new Error('API Stage 실행 완료 응답 wrapper가 유효하지 않습니다.');
  }

  const parsedSaveSlot = parseSaveSlotState(value.saveSlot);
  if (!parsedSaveSlot.success) {
    throw new Error('API Stage 실행 완료 응답의 세이브 슬롯이 Schema를 만족하지 않습니다.');
  }

  const rawStageRun = value.stageRun;
  if (typeof rawStageRun.runId !== 'string') {
    throw new Error('API Stage 실행 완료 응답의 runId가 유효하지 않습니다.');
  }

  const savedStageRun = parsedSaveSlot.value.completedStageRuns.find(
    (candidate) => candidate.runId === rawStageRun.runId,
  );
  if (
    savedStageRun === undefined ||
    rawStageRun.stageId !== savedStageRun.stageId ||
    rawStageRun.result !== savedStageRun.result ||
    rawStageRun.rewardCardInstanceId !== savedStageRun.rewardCardInstanceId ||
    rawStageRun.completedAt !== savedStageRun.completedAt
  ) {
    throw new Error('API Stage 실행 완료 영수증이 세이브 슬롯 기록과 일치하지 않습니다.');
  }

  return Object.freeze({
    stageRun: savedStageRun,
    saveSlot: parsedSaveSlot.value,
  });
}

function parseApiError(value: unknown): ApiErrorPayload {
  if (!isRecord(value) || !isRecord(value.error)) {
    return Object.freeze({
      code: 'HTTP_ERROR',
      message: '서버 요청을 처리하지 못했습니다.',
      details: Object.freeze([]),
    });
  }

  const code = typeof value.error.code === 'string' ? value.error.code : 'HTTP_ERROR';
  const message =
    typeof value.error.message === 'string'
      ? value.error.message
      : '서버 요청을 처리하지 못했습니다.';
  const rawDetails: unknown = value.error.details;
  const details: readonly unknown[] = Array.isArray(rawDetails)
    ? Object.freeze((rawDetails as readonly unknown[]).map((detail: unknown) => detail))
    : Object.freeze([]);

  return Object.freeze({ code, message, details });
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    return null;
  }

  return response.json() as Promise<unknown>;
}

export class PathfinderApiClient implements PathfinderGameApi {
  private readonly fetcher: ApiFetch;

  constructor(fetcher: ApiFetch = (input, init) => globalThis.fetch(input, init)) {
    this.fetcher = fetcher;
  }

  async register(username: string, password: string): Promise<AuthenticatedUser> {
    return parseUserResponse(
      await this.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    );
  }

  async login(username: string, password: string): Promise<AuthenticatedUser> {
    return parseUserResponse(
      await this.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    );
  }

  async logout(): Promise<void> {
    await this.request('/api/auth/logout', {
      method: 'POST',
    });
  }

  async getAuthenticatedUser(): Promise<AuthenticatedUser> {
    return parseUserResponse(await this.request('/api/auth/session'));
  }

  async listSaveSlots(): Promise<readonly SaveSlotSummary[]> {
    return parseSaveSlotsResponse(await this.request('/api/save-slots'));
  }

  async createSaveSlot(slotId: SaveSlotId): Promise<SaveSlotState> {
    return parseSaveSlotResponse(
      await this.request(`/api/save-slots/${slotId}`, {
        method: 'POST',
      }),
    );
  }

  async getSaveSlot(slotId: SaveSlotId): Promise<SaveSlotState> {
    return parseSaveSlotResponse(await this.request(`/api/save-slots/${slotId}`));
  }

  async updateDeck(
    slotId: SaveSlotId,
    deckId: StableId,
    deck: SaveSlotState['decks'][number],
  ): Promise<SaveSlotState> {
    return parseSaveSlotResponse(
      await this.request(`/api/save-slots/${slotId}/decks/${encodeURIComponent(deckId)}`, {
        method: 'PUT',
        body: JSON.stringify(deck),
      }),
    );
  }

  async startStageRun(slotId: SaveSlotId, stageId: StableId): Promise<StartedStageRun> {
    const stageRun = parseStartedStageRunResponse(
      await this.request(`/api/save-slots/${slotId}/stage-runs`, {
        method: 'POST',
        body: JSON.stringify({ stageId }),
      }),
    );
    if (stageRun.stageId !== stageId) {
      throw new Error('API Stage 실행 시작 응답이 요청한 Stage와 일치하지 않습니다.');
    }

    return stageRun;
  }

  async completeStageRun(
    slotId: SaveSlotId,
    runId: StableId,
    result: StageRunResult,
  ): Promise<StageRunCompletionReceipt> {
    const receipt = parseCompletedStageRunResponse(
      await this.request(
        `/api/save-slots/${slotId}/stage-runs/${encodeURIComponent(runId)}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({ result }),
        },
      ),
    );
    if (receipt.stageRun.runId !== runId || receipt.stageRun.result !== result) {
      throw new Error('API Stage 실행 완료 응답이 요청한 실행 또는 결과와 일치하지 않습니다.');
    }

    return receipt;
  }

  async deleteSaveSlot(slotId: SaveSlotId): Promise<void> {
    await this.request(`/api/save-slots/${slotId}`, {
      method: 'DELETE',
    });
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetcher(path, {
      ...init,
      credentials: 'same-origin',
      headers:
        init.body === undefined
          ? init.headers
          : {
              'content-type': 'application/json',
              ...init.headers,
            },
    });
    const body = response.status === 204 ? null : await readJson(response);

    if (!response.ok) {
      throw new PathfinderApiError(response.status, parseApiError(body));
    }

    return body;
  }
}
