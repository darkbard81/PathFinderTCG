import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, type TestContext } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { parseSaveSlotState, type SaveSlotState } from '../game/data/index.js';
import type { StarterContentIdFactory } from '../game/content/index.js';
import { buildServer } from './app.js';
import { SESSION_COOKIE_NAME, SESSION_LIFETIME_SECONDS } from './auth.js';
import {
  createPhaseThreeGameContent,
  type SaveSlotId,
  type ServerGameContent,
} from './gameContent.js';

const TEST_ORIGIN = 'http://127.0.0.1:3010';
const VALID_PASSWORD = 'correct horse battery staple';
const START_TIME = Date.parse('2026-07-27T06:00:00.000Z');

class MutableClock {
  private time = START_TIME;

  readonly now = (): Date => new Date(this.time);

  advance(milliseconds: number): void {
    this.time += milliseconds;
  }
}

interface JsonRecord {
  readonly [key: string]: unknown;
}

interface SecurityUserRow {
  readonly password_salt: Buffer;
  readonly password_hash: Buffer;
}

interface SecuritySessionRow {
  readonly token_digest: Buffer;
}

interface TableInfoRow {
  readonly name: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function parseSaveSlotResponse(body: string): SaveSlotState {
  const value = parseJson(body);

  if (!isRecord(value)) {
    throw new Error('API 응답이 객체가 아닙니다.');
  }

  const result = parseSaveSlotState(value.saveSlot);

  if (!result.success) {
    throw new Error('API 응답의 saveSlot이 Schema를 만족하지 않습니다.');
  }

  return result.value;
}

function extractSetCookie(
  responseHeaders: Readonly<Record<string, string | number | string[] | undefined>>,
): string {
  const value = responseHeaders['set-cookie'];
  const header = Array.isArray(value) ? value[0] : value;

  if (typeof header !== 'string') {
    throw new Error('Set-Cookie 응답 헤더가 없습니다.');
  }

  return header;
}

function extractCookie(setCookie: string): string {
  const cookie = setCookie.split(';', 1)[0];

  if (cookie === undefined || !cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error('세션 쿠키를 찾을 수 없습니다.');
  }

  return cookie;
}

function extractRawToken(cookie: string): string {
  const separator = cookie.indexOf('=');

  if (separator === -1) {
    throw new Error('세션 쿠키 형식이 올바르지 않습니다.');
  }

  return cookie.slice(separator + 1);
}

function createTestGameContent(): ServerGameContent {
  let sequence = 0;
  const createId: StarterContentIdFactory = (request) => {
    const copyIndex = request.kind === 'CARD_INSTANCE' ? request.copyIndex : 0;
    const id = `api-${request.kind.toLowerCase()}-${request.sourceId}-${copyIndex}-${sequence}`;
    sequence += 1;
    return id;
  };

  return createPhaseThreeGameContent(createId);
}

async function register(
  app: FastifyInstance,
  username: string,
  password = VALID_PASSWORD,
): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: {
      origin: TEST_ORIGIN,
    },
    payload: {
      username,
      password,
    },
  });

  expect(response.statusCode).toBe(201);
}

async function login(
  app: FastifyInstance,
  username: string,
  password = VALID_PASSWORD,
): Promise<{ readonly cookie: string; readonly setCookie: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: {
      origin: TEST_ORIGIN,
    },
    payload: {
      username,
      password,
    },
  });

  expect(response.statusCode).toBe(200);
  const setCookie = extractSetCookie(response.headers);

  return {
    cookie: extractCookie(setCookie),
    setCookie,
  };
}

async function createSlot(
  app: FastifyInstance,
  cookie: string,
  slotId: SaveSlotId,
): Promise<SaveSlotState> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/save-slots/${slotId}`,
    headers: {
      origin: TEST_ORIGIN,
      cookie,
    },
  });

  expect(response.statusCode).toBe(201);
  return parseSaveSlotResponse(response.body);
}

describe('Phase 2 API integration', () => {
  let app: FastifyInstance;
  let clock: MutableClock;
  let databasePath: string;
  let temporaryDirectory: string;
  let gameContent: ServerGameContent;

  beforeEach<TestContext>(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'pathfinder-tcg-phase-2-'));
    databasePath = join(temporaryDirectory, 'game.sqlite');
    clock = new MutableClock();
    gameContent = createTestGameContent();
    app = await buildServer({
      databasePath,
      allowedOrigins: [TEST_ORIGIN],
      gameContent,
      now: clock.now,
    });
  });

  afterEach<TestContext>(async () => {
    await app.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('registers normalized accounts, rejects duplicates, and authenticates with a hardened cookie', async () => {
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: {
        origin: TEST_ORIGIN,
      },
      payload: {
        username: '  Test_User  ',
        password: VALID_PASSWORD,
      },
    });

    expect(registerResponse.statusCode).toBe(201);
    expect(parseJson(registerResponse.body)).toMatchObject({
      user: {
        username: 'test_user',
      },
    });

    const duplicateResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: {
        origin: TEST_ORIGIN,
      },
      payload: {
        username: 'TEST_USER',
        password: VALID_PASSWORD,
      },
    });

    expect(duplicateResponse.statusCode).toBe(409);
    expect(parseJson(duplicateResponse.body)).toMatchObject({
      error: {
        code: 'USERNAME_TAKEN',
      },
    });

    const failedLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        origin: TEST_ORIGIN,
      },
      payload: {
        username: 'test_user',
        password: 'wrong password value',
      },
    });

    expect(failedLogin.statusCode).toBe(401);
    expect(parseJson(failedLogin.body)).toMatchObject({
      error: {
        code: 'INVALID_CREDENTIALS',
      },
    });

    const session = await login(app, 'TEST_USER');

    expect(session.setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(session.setCookie).toContain('HttpOnly');
    expect(session.setCookie).toContain('SameSite=Lax');
    expect(session.setCookie).toContain('Path=/');
    expect(session.setCookie).toContain(`Max-Age=${SESSION_LIFETIME_SECONDS}`);
    expect(session.setCookie).not.toContain('Secure');

    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: {
        cookie: session.cookie,
      },
    });

    expect(sessionResponse.statusCode).toBe(200);
    expect(parseJson(sessionResponse.body)).toMatchObject({
      user: {
        username: 'test_user',
      },
    });
  });

  it('sets Secure in production cookie mode', async () => {
    await app.close();
    app = await buildServer({
      databasePath,
      allowedOrigins: [TEST_ORIGIN],
      gameContent,
      now: clock.now,
      secureCookies: true,
    });

    await register(app, 'secure_user');
    const session = await login(app, 'secure_user');

    expect(session.setCookie).toContain('Secure');
  });

  it('invalidates logout sessions and fixed seven-day expired sessions', async () => {
    await register(app, 'session_user');
    const firstSession = await login(app, 'session_user');

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        origin: TEST_ORIGIN,
        cookie: firstSession.cookie,
      },
    });

    expect(logoutResponse.statusCode).toBe(204);
    expect(extractSetCookie(logoutResponse.headers)).toContain(`${SESSION_COOKIE_NAME}=;`);

    const loggedOutResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: {
        cookie: firstSession.cookie,
      },
    });

    expect(loggedOutResponse.statusCode).toBe(401);

    const secondSession = await login(app, 'session_user');
    clock.advance(SESSION_LIFETIME_SECONDS * 1000);

    const expiredResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: {
        cookie: secondSession.cookie,
      },
    });

    expect(expiredResponse.statusCode).toBe(401);
    expect(parseJson(expiredResponse.body)).toMatchObject({
      error: {
        code: 'UNAUTHENTICATED',
      },
    });
  });

  it('rejects missing or foreign write Origins and rate-limits an IP and normalized username pair', async () => {
    const missingOrigin = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'origin_user',
        password: VALID_PASSWORD,
      },
    });
    const foreignOrigin = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: {
        origin: 'https://foreign.example.test',
      },
      payload: {
        username: 'origin_user',
        password: VALID_PASSWORD,
      },
    });

    expect(missingOrigin.statusCode).toBe(403);
    expect(foreignOrigin.statusCode).toBe(403);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: {
          origin: TEST_ORIGIN,
        },
        payload: {
          username: attempt % 2 === 0 ? 'Rate_User' : ' rate_user ',
          password: 'short',
        },
      });

      expect(response.statusCode).toBe(400);
    }

    const limitedResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        origin: TEST_ORIGIN,
      },
      payload: {
        username: 'RATE_USER',
        password: 'short',
      },
    });

    expect(limitedResponse.statusCode).toBe(429);
    expect(parseJson(limitedResponse.body)).toMatchObject({
      error: {
        code: 'RATE_LIMITED',
      },
    });
  });

  it('requires authentication and keeps all three slots isolated by account and slot ID', async () => {
    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/api/save-slots',
    });

    expect(unauthenticated.statusCode).toBe(401);

    await register(app, 'account_a');
    await register(app, 'account_b');
    const accountA = await login(app, 'account_a');
    const accountB = await login(app, 'account_b');

    const emptyList = await app.inject({
      method: 'GET',
      url: '/api/save-slots',
      headers: {
        cookie: accountA.cookie,
      },
    });

    expect(emptyList.statusCode).toBe(200);
    expect(parseJson(emptyList.body)).toEqual({
      saveSlots: [
        {
          slotId: 1,
          status: 'EMPTY',
          lastModifiedAt: null,
          selectedDeckId: null,
          deckCount: 0,
          ownedCardCount: 0,
        },
        {
          slotId: 2,
          status: 'EMPTY',
          lastModifiedAt: null,
          selectedDeckId: null,
          deckCount: 0,
          ownedCardCount: 0,
        },
        {
          slotId: 3,
          status: 'EMPTY',
          lastModifiedAt: null,
          selectedDeckId: null,
          deckCount: 0,
          ownedCardCount: 0,
        },
      ],
    });

    for (const slotId of [1, 2, 3] as const) {
      clock.advance(1000);
      const state = await createSlot(app, accountA.cookie, slotId);
      expect(state.slotId).toBe(slotId);
      expect(state.collection.cardInstances).toHaveLength(30);
    }

    const duplicateSlot = await app.inject({
      method: 'POST',
      url: '/api/save-slots/1',
      headers: {
        origin: TEST_ORIGIN,
        cookie: accountA.cookie,
      },
    });

    expect(duplicateSlot.statusCode).toBe(409);

    const accountBList = await app.inject({
      method: 'GET',
      url: '/api/save-slots',
      headers: {
        cookie: accountB.cookie,
      },
    });
    const accountBReadOfAccountASlot = await app.inject({
      method: 'GET',
      url: '/api/save-slots/1',
      headers: {
        cookie: accountB.cookie,
      },
    });

    expect(parseJson(accountBList.body)).toMatchObject({
      saveSlots: [
        { slotId: 1, status: 'EMPTY' },
        { slotId: 2, status: 'EMPTY' },
        { slotId: 3, status: 'EMPTY' },
      ],
    });
    expect(accountBReadOfAccountASlot.statusCode).toBe(404);

    const resetResponse = await app.inject({
      method: 'DELETE',
      url: '/api/save-slots/2',
      headers: {
        origin: TEST_ORIGIN,
        cookie: accountA.cookie,
      },
    });

    expect(resetResponse.statusCode).toBe(204);

    const afterReset = await app.inject({
      method: 'GET',
      url: '/api/save-slots',
      headers: {
        cookie: accountA.cookie,
      },
    });

    expect(parseJson(afterReset.body)).toMatchObject({
      saveSlots: [
        { slotId: 1, status: 'OCCUPIED' },
        { slotId: 2, status: 'EMPTY' },
        { slotId: 3, status: 'OCCUPIED' },
      ],
    });
  });

  it('validates deck updates and restores the session and save after a server restart', async () => {
    await register(app, 'persistent_user');
    const session = await login(app, 'persistent_user');
    const createdState = await createSlot(app, session.cookie, 1);
    const starterDeck = createdState.decks[0];

    if (starterDeck === undefined) {
      throw new Error('테스트 콘텐츠에 starter 덱이 없습니다.');
    }

    clock.advance(1000);
    const renamedDeck = {
      ...starterDeck,
      name: 'Restored Starter Deck',
    };
    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/api/save-slots/1/decks/${starterDeck.id}`,
      headers: {
        origin: TEST_ORIGIN,
        cookie: session.cookie,
      },
      payload: renamedDeck,
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(parseSaveSlotResponse(updateResponse.body).decks[0]?.name).toBe('Restored Starter Deck');

    const invalidDeckResponse = await app.inject({
      method: 'PUT',
      url: `/api/save-slots/1/decks/${starterDeck.id}`,
      headers: {
        origin: TEST_ORIGIN,
        cookie: session.cookie,
      },
      payload: {
        ...renamedDeck,
        unitInstanceIds: [...renamedDeck.unitInstanceIds.slice(0, -1), 'not-owned-instance'],
      },
    });

    expect(invalidDeckResponse.statusCode).toBe(422);
    expect(parseJson(invalidDeckResponse.body)).toMatchObject({
      error: {
        code: 'INVALID_DECK',
      },
    });

    await app.close();
    app = await buildServer({
      databasePath,
      allowedOrigins: [TEST_ORIGIN],
      gameContent,
      now: clock.now,
    });

    const restoredSession = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: {
        cookie: session.cookie,
      },
    });
    const restoredSave = await app.inject({
      method: 'GET',
      url: '/api/save-slots/1',
      headers: {
        cookie: session.cookie,
      },
    });

    expect(restoredSession.statusCode).toBe(200);
    expect(restoredSave.statusCode).toBe(200);
    expect(parseSaveSlotResponse(restoredSave.body).decks[0]?.name).toBe('Restored Starter Deck');
  });

  it('stores fixed-size password hashes and session digests without plaintext secrets', async () => {
    const password = 'plaintext must never persist';

    await register(app, 'storage_user', password);
    const session = await login(app, 'storage_user', password);
    const rawToken = extractRawToken(session.cookie);

    await app.close();

    const database = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    const userRow = database
      .prepare<[], SecurityUserRow>('SELECT password_salt, password_hash FROM users')
      .get();
    const sessionRow = database
      .prepare<[], SecuritySessionRow>('SELECT token_digest FROM sessions')
      .get();
    const userColumns = database
      .prepare<[], TableInfoRow>('PRAGMA table_info(users)')
      .all()
      .map((row) => row.name);
    const sessionColumns = database
      .prepare<[], TableInfoRow>('PRAGMA table_info(sessions)')
      .all()
      .map((row) => row.name);

    database.close();

    expect(userRow?.password_salt).toHaveLength(16);
    expect(userRow?.password_hash).toHaveLength(64);
    expect(sessionRow?.token_digest).toHaveLength(32);
    expect(sessionRow?.token_digest.equals(createHash('sha256').update(rawToken).digest())).toBe(
      true,
    );
    expect(userColumns).not.toContain('password');
    expect(sessionColumns).not.toContain('token');

    const databaseBytes = await readFile(databasePath);

    expect(databaseBytes.includes(Buffer.from(password, 'utf8'))).toBe(false);
    expect(databaseBytes.includes(Buffer.from(rawToken, 'utf8'))).toBe(false);

    app = await buildServer({
      databasePath,
      allowedOrigins: [TEST_ORIGIN],
      gameContent,
      now: clock.now,
    });
  });
});
