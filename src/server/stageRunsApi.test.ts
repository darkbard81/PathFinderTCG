import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ENEMY_TEST_DECK_BLUEPRINT,
  STAGE_ONE_ID,
  STAGE_ONE_REWARD_ENTRIES,
  TEST_CARD_CATALOG,
  type StarterContentIdFactory,
} from '../game/content/index.js';
import {
  parseSaveSlotState,
  type CompletedStageRun,
  type SaveSlotState,
  type StageRunResult,
  type StartedStageRun,
} from '../game/data/index.js';
import { buildServer } from './app.js';
import { SESSION_COOKIE_NAME } from './auth.js';
import { createPhaseEightGameContent, createPhaseThreeGameContent } from './gameContent.js';
import { selectWeightedStageReward, type StageRunFactories } from './stageRuns.js';

const TEST_ORIGIN = 'http://127.0.0.1:3010';
const VALID_PASSWORD = 'correct horse battery staple';
const FIXED_TIME = new Date('2026-07-28T06:00:00.000Z');
const UINT32_RANGE = 0x1_0000_0000;

interface JsonRecord {
  readonly [key: string]: unknown;
}

interface CompletionReceipt {
  readonly stageRun: CompletedStageRun;
  readonly saveSlot: SaveSlotState;
}

class DeterministicStageRunFactories implements StageRunFactories {
  private runSequence = 0;
  private rewardSequence = 0;
  seed = 0;

  readonly createRunId = (): string => {
    this.runSequence += 1;
    return `phase-eight-run-${this.runSequence}`;
  };

  readonly createRewardCardInstanceId = (): string => {
    this.rewardSequence += 1;
    return `phase-eight-reward-${this.rewardSequence}`;
  };

  readonly createSeed = (): number => this.seed;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(body: string): JsonRecord {
  const value: unknown = JSON.parse(body);

  if (!isRecord(value)) {
    throw new Error('API 응답이 객체가 아닙니다.');
  }

  return value;
}

function parseSaveSlot(value: unknown): SaveSlotState {
  const parsed = parseSaveSlotState(value);

  if (!parsed.success) {
    throw new Error('API 응답의 saveSlot이 Schema를 만족하지 않습니다.');
  }

  return parsed.value;
}

function parseStartedStageRun(body: string): StartedStageRun {
  const value = parseJson(body).stageRun;

  if (
    !isRecord(value) ||
    typeof value.runId !== 'string' ||
    typeof value.stageId !== 'string' ||
    typeof value.seed !== 'number' ||
    typeof value.startedAt !== 'string'
  ) {
    throw new Error('Stage 실행 시작 응답이 유효하지 않습니다.');
  }

  return {
    runId: value.runId,
    stageId: value.stageId,
    seed: value.seed,
    startedAt: value.startedAt,
  };
}

function parseCompletionReceipt(body: string): CompletionReceipt {
  const value = parseJson(body);
  const saveSlot = parseSaveSlot(value.saveSlot);
  const rawStageRun = value.stageRun;

  if (!isRecord(rawStageRun) || typeof rawStageRun.runId !== 'string') {
    throw new Error('Stage 실행 완료 응답이 유효하지 않습니다.');
  }

  const stageRun = saveSlot.completedStageRuns.find(
    (candidate) => candidate.runId === rawStageRun.runId,
  );
  if (stageRun === undefined) {
    throw new Error('Stage 실행 완료 기록이 세이브 슬롯에 없습니다.');
  }

  return {
    stageRun,
    saveSlot,
  };
}

function extractCookie(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const cookie = header?.split(';', 1)[0];

  if (cookie === undefined || !cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error('세션 쿠키가 없습니다.');
  }

  return cookie;
}

function createTestContent() {
  let sequence = 0;
  const createId: StarterContentIdFactory = (request) => {
    const copyIndex = request.kind === 'CARD_INSTANCE' ? request.copyIndex : 0;
    sequence += 1;
    return `phase-eight-${request.kind.toLowerCase()}-${request.sourceId}-${copyIndex}-${sequence}`;
  };

  return createPhaseEightGameContent(createId);
}

function seedForReward(cardDefinitionId: string): number {
  const totalWeight = STAGE_ONE_REWARD_ENTRIES.reduce((total, reward) => total + reward.weight, 0);
  let cumulativeWeight = 0;

  for (const reward of STAGE_ONE_REWARD_ENTRIES) {
    if (reward.cardDefinitionId === cardDefinitionId) {
      const targetRoll = cumulativeWeight + Math.floor((reward.weight - 1) / 2);
      let seed = Math.ceil((targetRoll * UINT32_RANGE) / totalWeight);

      while (
        selectWeightedStageReward(STAGE_ONE_REWARD_ENTRIES, seed).cardDefinitionId !==
        cardDefinitionId
      ) {
        seed += 1;
      }
      return seed;
    }
    cumulativeWeight += reward.weight;
  }

  throw new Error(`Stage 보상 후보를 찾을 수 없습니다: ${cardDefinitionId}`);
}

async function registerAndLogin(app: FastifyInstance, username: string): Promise<string> {
  const registerResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin: TEST_ORIGIN },
    payload: { username, password: VALID_PASSWORD },
  });
  expect(registerResponse.statusCode).toBe(201);

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: TEST_ORIGIN },
    payload: { username, password: VALID_PASSWORD },
  });
  expect(loginResponse.statusCode).toBe(200);
  return extractCookie(loginResponse.headers['set-cookie']);
}

async function createSlot(app: FastifyInstance, cookie: string): Promise<SaveSlotState> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/save-slots/1',
    headers: { origin: TEST_ORIGIN, cookie },
  });
  expect(response.statusCode).toBe(201);
  return parseSaveSlot(parseJson(response.body).saveSlot);
}

async function startRun(
  app: FastifyInstance,
  cookie: string,
  expectedStatus = 201,
): Promise<StartedStageRun> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/save-slots/1/stage-runs',
    headers: { origin: TEST_ORIGIN, cookie },
    payload: { stageId: STAGE_ONE_ID },
  });
  expect(response.statusCode).toBe(expectedStatus);
  return parseStartedStageRun(response.body);
}

async function completeRun(
  app: FastifyInstance,
  cookie: string,
  runId: string,
  result: StageRunResult,
): Promise<CompletionReceipt> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/save-slots/1/stage-runs/${runId}/complete`,
    headers: { origin: TEST_ORIGIN, cookie },
    payload: { result },
  });
  expect(response.statusCode).toBe(200);
  return parseCompletionReceipt(response.body);
}

describe('Phase 8 Stage run API', () => {
  let app: FastifyInstance;
  let databasePath: string;
  let temporaryDirectory: string;
  let factories: DeterministicStageRunFactories;
  const content = createTestContent();

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'pathfinder-tcg-phase-eight-'));
    databasePath = join(temporaryDirectory, 'game.sqlite');
    factories = new DeterministicStageRunFactories();
    app = await buildServer({
      databasePath,
      allowedOrigins: [TEST_ORIGIN],
      gameContent: content,
      stageRunFactories: factories,
      now: () => FIXED_TIME,
    });
  });

  afterEach(async () => {
    await app.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('validates Stage IDs, reuses a pending run after restart, and isolates account ownership', async () => {
    const ownerCookie = await registerAndLogin(app, 'stage_owner');
    await createSlot(app, ownerCookie);

    const unknownStage = await app.inject({
      method: 'POST',
      url: '/api/save-slots/1/stage-runs',
      headers: { origin: TEST_ORIGIN, cookie: ownerCookie },
      payload: { stageId: 'unknown-stage' },
    });
    expect(unknownStage.statusCode).toBe(404);
    expect(parseJson(unknownStage.body)).toMatchObject({
      error: { code: 'STAGE_NOT_FOUND' },
    });

    factories.seed = 0x1234_5678;
    const first = await startRun(app, ownerCookie);
    expect(first).toMatchObject({
      runId: 'phase-eight-run-1',
      stageId: STAGE_ONE_ID,
      seed: 0x1234_5678,
    });

    await app.close();
    app = await buildServer({
      databasePath,
      allowedOrigins: [TEST_ORIGIN],
      gameContent: content,
      stageRunFactories: factories,
      now: () => FIXED_TIME,
    });

    const recovered = await startRun(app, ownerCookie, 200);
    expect(recovered).toEqual(first);

    const otherCookie = await registerAndLogin(app, 'stage_intruder');
    const foreignCompletion = await app.inject({
      method: 'POST',
      url: `/api/save-slots/1/stage-runs/${first.runId}/complete`,
      headers: { origin: TEST_ORIGIN, cookie: otherCookie },
      payload: { result: 'WIN' },
    });
    expect(foreignCompletion.statusCode).toBe(404);
    expect(parseJson(foreignCompletion.body)).toMatchObject({
      error: { code: 'STAGE_RUN_NOT_FOUND' },
    });
  });

  it('persists the Stage 01 unlock when an existing Phase 3 slot is first loaded', async () => {
    await app.close();
    let legacySequence = 0;
    const legacyContent = createPhaseThreeGameContent((request) => {
      legacySequence += 1;
      const copyIndex = request.kind === 'CARD_INSTANCE' ? request.copyIndex : 0;
      return `legacy-${request.kind.toLowerCase()}-${request.sourceId}-${copyIndex}-${legacySequence}`;
    });
    app = await buildServer({
      databasePath,
      allowedOrigins: [TEST_ORIGIN],
      gameContent: legacyContent,
      stageRunFactories: factories,
      now: () => new Date('2026-07-27T06:00:00.000Z'),
    });
    const cookie = await registerAndLogin(app, 'legacy_runner');
    const legacy = await createSlot(app, cookie);
    expect(legacy.progress.unlockedStageIds).toEqual([]);
    await app.close();

    app = await buildServer({
      databasePath,
      allowedOrigins: [TEST_ORIGIN],
      gameContent: content,
      stageRunFactories: factories,
      now: () => FIXED_TIME,
    });
    const migratedResponse = await app.inject({
      method: 'GET',
      url: '/api/save-slots/1',
      headers: { cookie },
    });
    const migrated = parseSaveSlot(parseJson(migratedResponse.body).saveSlot);
    expect(migrated.progress.unlockedStageIds).toEqual([STAGE_ONE_ID]);
    expect(migrated.collection).toEqual(legacy.collection);
    expect(migrated.decks).toEqual(legacy.decks);
    expect(migrated.lastModifiedAt).toBe(FIXED_TIME.toISOString());

    await app.close();
    app = await buildServer({
      databasePath,
      allowedOrigins: [TEST_ORIGIN],
      gameContent: content,
      stageRunFactories: factories,
      now: () => new Date('2026-07-28T07:00:00.000Z'),
    });
    const restoredResponse = await app.inject({
      method: 'GET',
      url: '/api/save-slots/1',
      headers: { cookie },
    });
    expect(parseSaveSlot(parseJson(restoredResponse.body).saveSlot)).toEqual(migrated);
  });

  it('rejects a storage-valid but non-playable selected deck before issuing a run', async () => {
    const cookie = await registerAndLogin(app, 'invalid_deck_runner');
    const state = await createSlot(app, cookie);
    const deck = state.decks[0];

    if (deck === undefined) {
      throw new Error('starter 덱이 없습니다.');
    }

    const update = await app.inject({
      method: 'PUT',
      url: `/api/save-slots/1/decks/${deck.id}`,
      headers: { origin: TEST_ORIGIN, cookie },
      payload: {
        ...deck,
        unitInstanceIds: deck.unitInstanceIds.slice(0, -1),
      },
    });
    expect(update.statusCode).toBe(200);

    const start = await app.inject({
      method: 'POST',
      url: '/api/save-slots/1/stage-runs',
      headers: { origin: TEST_ORIGIN, cookie },
      payload: { stageId: STAGE_ONE_ID },
    });
    expect(start.statusCode).toBe(422);
    expect(parseJson(start.body)).toMatchObject({
      error: { code: 'INVALID_STAGE_DECK' },
    });
  });

  it('records LOSS and DRAW without changing the collection or creating rewards', async () => {
    const cookie = await registerAndLogin(app, 'non_winner');
    const initial = await createSlot(app, cookie);
    let latest = initial;

    for (const result of ['LOSS', 'DRAW'] as const) {
      const run = await startRun(app, cookie);
      const receipt = await completeRun(app, cookie, run.runId, result);

      expect(receipt.stageRun).toMatchObject({
        runId: run.runId,
        result,
        rewardCardInstanceId: null,
      });
      expect(receipt.saveSlot.collection.cardInstances).toHaveLength(
        initial.collection.cardInstances.length,
      );
      latest = receipt.saveSlot;
    }

    expect(latest.completedStageRuns.map((run) => run.result)).toEqual(['LOSS', 'DRAW']);
    expect(latest.progress.clearedStageIds).toEqual([]);
  });

  it('persists one reward per WIN, returns the first receipt idempotently, and retains deck copy limits', async () => {
    const cookie = await registerAndLogin(app, 'repeat_winner');
    const initial = await createSlot(app, cookie);
    const rewardCandidate = STAGE_ONE_REWARD_ENTRIES.find(
      (reward) => reward.cardDefinitionId !== ENEMY_TEST_DECK_BLUEPRINT.leaderDefinitionId,
    );

    if (rewardCandidate === undefined) {
      throw new Error('적 유닛 보상 후보가 없습니다.');
    }

    factories.seed = seedForReward(rewardCandidate.cardDefinitionId);
    const firstRun = await startRun(app, cookie);
    const firstReceipt = await completeRun(app, cookie, firstRun.runId, 'WIN');
    expect(firstReceipt.saveSlot.collection.cardInstances).toHaveLength(
      initial.collection.cardInstances.length + 1,
    );
    expect(firstReceipt.saveSlot.progress.clearedStageIds).toEqual([STAGE_ONE_ID]);

    const duplicate = await completeRun(app, cookie, firstRun.runId, 'LOSS');
    expect(duplicate).toEqual(firstReceipt);

    await app.close();
    app = await buildServer({
      databasePath,
      allowedOrigins: [TEST_ORIGIN],
      gameContent: content,
      stageRunFactories: factories,
      now: () => FIXED_TIME,
    });

    const restoredResponse = await app.inject({
      method: 'GET',
      url: '/api/save-slots/1',
      headers: { cookie },
    });
    expect(restoredResponse.statusCode).toBe(200);
    const restored = parseSaveSlot(parseJson(restoredResponse.body).saveSlot);
    expect(restored).toEqual(firstReceipt.saveSlot);
    expect(await completeRun(app, cookie, firstRun.runId, 'DRAW')).toEqual(firstReceipt);

    let latest = restored;
    for (let repeat = 0; repeat < 2; repeat += 1) {
      const run = await startRun(app, cookie);
      latest = (await completeRun(app, cookie, run.runId, 'WIN')).saveSlot;
    }

    const rewardInstances = latest.collection.cardInstances.filter(
      (instance) => instance.cardDefinitionId === rewardCandidate.cardDefinitionId,
    );
    expect(rewardInstances).toHaveLength(3);
    expect(new Set(rewardInstances.map((instance) => instance.id)).size).toBe(3);
    expect(latest.collection.cardInstances).toHaveLength(
      initial.collection.cardInstances.length + 3,
    );
    expect(latest.completedStageRuns).toHaveLength(3);
    expect(latest.progress.clearedStageIds).toEqual([STAGE_ONE_ID]);

    const deck = latest.decks[0];
    if (deck === undefined) {
      throw new Error('starter 덱이 없습니다.');
    }
    const copyLimitUpdate = await app.inject({
      method: 'PUT',
      url: `/api/save-slots/1/decks/${deck.id}`,
      headers: { origin: TEST_ORIGIN, cookie },
      payload: {
        ...deck,
        unitInstanceIds: [
          ...rewardInstances.map((instance) => instance.id),
          ...deck.unitInstanceIds.slice(3),
        ],
      },
    });
    expect(copyLimitUpdate.statusCode).toBe(422);
    const error = parseJson(copyLimitUpdate.body).error;
    expect(isRecord(error) ? error.code : null).toBe('INVALID_DECK');
    const details = isRecord(error) && Array.isArray(error.details) ? error.details : [];
    expect(
      details.some((detail) => isRecord(detail) && detail.code === 'COPY_LIMIT_EXCEEDED'),
    ).toBe(true);
  });

  it('can grant the enemy leader as the single persisted victory reward', async () => {
    const cookie = await registerAndLogin(app, 'leader_winner');
    const initial = await createSlot(app, cookie);
    factories.seed = seedForReward(ENEMY_TEST_DECK_BLUEPRINT.leaderDefinitionId);
    const run = await startRun(app, cookie);
    const receipt = await completeRun(app, cookie, run.runId, 'WIN');
    const rewardId = receipt.stageRun.rewardCardInstanceId;
    const reward = receipt.saveSlot.collection.cardInstances.find(
      (instance) => instance.id === rewardId,
    );
    const definition = TEST_CARD_CATALOG.cardDefinitions.find(
      (candidate) => candidate.id === reward?.cardDefinitionId,
    );

    expect(receipt.saveSlot.collection.cardInstances).toHaveLength(
      initial.collection.cardInstances.length + 1,
    );
    expect(reward?.cardDefinitionId).toBe(ENEMY_TEST_DECK_BLUEPRINT.leaderDefinitionId);
    expect(definition?.type).toBe('LEADER');
  });

  it('rolls back the save update when the Stage-run completion write fails, then permits a clean retry', async () => {
    const cookie = await registerAndLogin(app, 'atomic_winner');
    const initial = await createSlot(app, cookie);
    const run = await startRun(app, cookie);
    const triggerDatabase = new Database(databasePath);
    triggerDatabase.exec(`
      CREATE TRIGGER force_stage_completion_failure
      BEFORE UPDATE OF status ON stage_runs
      WHEN NEW.run_id = '${run.runId}'
      BEGIN
        SELECT RAISE(ABORT, 'forced Stage completion failure');
      END;
    `);
    triggerDatabase.close();

    const failedCompletion = await app.inject({
      method: 'POST',
      url: `/api/save-slots/1/stage-runs/${run.runId}/complete`,
      headers: { origin: TEST_ORIGIN, cookie },
      payload: { result: 'WIN' },
    });
    expect(failedCompletion.statusCode).toBe(500);

    const afterFailureResponse = await app.inject({
      method: 'GET',
      url: '/api/save-slots/1',
      headers: { cookie },
    });
    const afterFailure = parseSaveSlot(parseJson(afterFailureResponse.body).saveSlot);
    expect(afterFailure.collection.cardInstances).toHaveLength(
      initial.collection.cardInstances.length,
    );
    expect(afterFailure.completedStageRuns).toEqual([]);

    const inspection = new Database(databasePath);
    const stageRunRow = inspection
      .prepare<[string], { readonly status: string }>(
        'SELECT status FROM stage_runs WHERE run_id = ?',
      )
      .get(run.runId);
    inspection.exec('DROP TRIGGER force_stage_completion_failure');
    inspection.close();
    expect(stageRunRow?.status).toBe('PENDING');

    const retry = await completeRun(app, cookie, run.runId, 'WIN');
    expect(retry.saveSlot.collection.cardInstances).toHaveLength(
      initial.collection.cardInstances.length + 1,
    );
    expect(retry.saveSlot.completedStageRuns).toHaveLength(1);
  });
});
