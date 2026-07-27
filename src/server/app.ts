import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import { parseSavedDeck, type SchemaValidationIssue } from '../game/data/index.js';
import {
  AuthInputError,
  AuthService,
  InvalidCredentialsError,
  SESSION_COOKIE_NAME,
  SESSION_LIFETIME_SECONDS,
  normalizeUsername,
  type Clock,
  type LoginSession,
} from './auth.js';
import {
  DuplicateUsernameError,
  GameDatabase,
  SaveSlotAlreadyExistsError,
  type PublicUser,
} from './database.js';
import {
  createPhaseThreeGameContent,
  type SaveSlotId,
  type ServerGameContent,
} from './gameContent.js';
import {
  DeckNotFoundError,
  InvalidDeckError,
  InvalidPersistedSaveSlotError,
  SaveSlotNotFoundError,
  SaveSlotService,
} from './saveSlots.js';

const AUTH_RATE_LIMIT_MAX = 10;
const AUTH_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface BuildServerOptions {
  readonly databasePath: string;
  readonly allowedOrigins: readonly string[];
  readonly secureCookies?: boolean;
  readonly gameContent?: ServerGameContent;
  readonly now?: Clock;
  readonly logger?: boolean;
}

interface Credentials {
  readonly username: string;
  readonly password: string;
}

interface SlotParams {
  readonly slotId: string;
}

interface DeckParams extends SlotParams {
  readonly deckId: string;
}

interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: readonly unknown[];
  };
}

class RequestInputError extends Error {
  readonly details: readonly unknown[];

  constructor(message: string, details: readonly unknown[] = []) {
    super(message);
    this.name = 'RequestInputError';
    this.details = details;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCredentials(value: unknown): Credentials {
  if (
    !isRecord(value) ||
    typeof value.username !== 'string' ||
    typeof value.password !== 'string'
  ) {
    throw new RequestInputError('username과 password 문자열이 필요합니다.');
  }

  return {
    username: value.username,
    password: value.password,
  };
}

function parseSlotId(value: string): SaveSlotId {
  const slotId = Number(value);

  if (slotId !== 1 && slotId !== 2 && slotId !== 3) {
    throw new RequestInputError('slotId는 1, 2, 3 중 하나여야 합니다.');
  }

  return slotId;
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: readonly unknown[],
): FastifyReply {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };

  return reply.code(statusCode).send(body);
}

function authRateLimitKey(request: FastifyRequest): string {
  const body = isRecord(request.body) ? request.body : {};
  const username =
    typeof body.username === 'string'
      ? normalizeUsername(body.username).slice(0, 64)
      : 'invalid-username';

  return `${request.ip}:${username}`;
}

function setSessionCookie(
  reply: FastifyReply,
  session: LoginSession,
  secureCookies: boolean,
): void {
  reply.setCookie(SESSION_COOKIE_NAME, session.rawToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies,
    maxAge: SESSION_LIFETIME_SECONDS,
    expires: session.expiresAt,
  });
}

function clearSessionCookie(reply: FastifyReply, secureCookies: boolean): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies,
  });
}

function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  authService: AuthService,
  secureCookies: boolean,
): PublicUser | null {
  const rawToken = request.cookies[SESSION_COOKIE_NAME];
  const user = authService.authenticate(rawToken);

  if (user !== null) {
    return user;
  }

  if (rawToken !== undefined) {
    clearSessionCookie(reply, secureCookies);
  }
  sendError(reply, 401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
  return null;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  if (options.allowedOrigins.length === 0) {
    throw new Error('서버에는 하나 이상의 허용 Origin이 필요합니다.');
  }

  const secureCookies = options.secureCookies ?? false;
  const now = options.now ?? (() => new Date());
  const gameContent = options.gameContent ?? createPhaseThreeGameContent();
  const allowedOrigins = new Set(options.allowedOrigins);
  const database = new GameDatabase(options.databasePath);
  const authService = new AuthService(database, now);
  const saveSlotService = new SaveSlotService(database, gameContent, now);
  const app = Fastify({
    logger:
      options.logger === true
        ? {
            redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
          }
        : false,
  });

  app.addHook('onClose', () => {
    database.close();
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
  });

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/') || !WRITE_METHODS.has(request.method)) {
      return;
    }

    const origin = request.headers.origin;

    if (origin === undefined || !allowedOrigins.has(origin)) {
      return sendError(reply, 403, 'ORIGIN_FORBIDDEN', '허용되지 않은 요청 Origin입니다.');
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof RequestInputError || error instanceof AuthInputError) {
      sendError(
        reply,
        400,
        'INVALID_REQUEST',
        error.message,
        error instanceof RequestInputError ? error.details : undefined,
      );
      return;
    }

    if (error instanceof DuplicateUsernameError) {
      sendError(reply, 409, 'USERNAME_TAKEN', error.message);
      return;
    }

    if (error instanceof InvalidCredentialsError) {
      sendError(reply, 401, 'INVALID_CREDENTIALS', error.message);
      return;
    }

    if (error instanceof SaveSlotAlreadyExistsError) {
      sendError(reply, 409, 'SAVE_SLOT_ALREADY_EXISTS', error.message);
      return;
    }

    if (error instanceof SaveSlotNotFoundError) {
      sendError(reply, 404, 'SAVE_SLOT_NOT_FOUND', error.message);
      return;
    }

    if (error instanceof DeckNotFoundError) {
      sendError(reply, 404, 'DECK_NOT_FOUND', error.message);
      return;
    }

    if (error instanceof InvalidDeckError) {
      sendError(reply, 422, 'INVALID_DECK', error.message, error.issues);
      return;
    }

    if (error instanceof InvalidPersistedSaveSlotError) {
      request.log.error({ err: error }, 'Persisted save slot validation failed');
      sendError(reply, 500, 'SAVE_DATA_INVALID', '저장 데이터를 안전하게 읽을 수 없습니다.');
      return;
    }

    request.log.error({ err: error }, 'Unhandled API error');
    sendError(reply, 500, 'INTERNAL_ERROR', '서버 내부 오류가 발생했습니다.');
  });

  const checkAuthRateLimit = app.createRateLimit({
    max: AUTH_RATE_LIMIT_MAX,
    timeWindow: AUTH_RATE_LIMIT_WINDOW_MS,
    keyGenerator: authRateLimitKey,
  });
  const enforceAuthRateLimit = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void | FastifyReply> => {
    const status = await checkAuthRateLimit(request);

    if (!status.isAllowed && status.isExceeded) {
      return sendError(
        reply,
        429,
        'RATE_LIMITED',
        '가입 또는 로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.',
      );
    }
  };

  app.post<{ Body: unknown }>(
    '/api/auth/register',
    {
      preHandler: enforceAuthRateLimit,
    },
    async (request, reply) => {
      const credentials = parseCredentials(request.body);
      const user = await authService.register(credentials.username, credentials.password);
      await reply.code(201).send({ user });
    },
  );

  app.post<{ Body: unknown }>(
    '/api/auth/login',
    {
      preHandler: enforceAuthRateLimit,
    },
    async (request, reply) => {
      const credentials = parseCredentials(request.body);
      const session = await authService.login(credentials.username, credentials.password);

      setSessionCookie(reply, session, secureCookies);
      await reply.send({ user: session.user });
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    authService.logout(request.cookies[SESSION_COOKIE_NAME]);
    clearSessionCookie(reply, secureCookies);
    await reply.code(204).send();
  });

  app.get('/api/auth/session', async (request, reply) => {
    const user = requireUser(request, reply, authService, secureCookies);

    if (user === null) {
      return;
    }

    await reply.send({ user });
  });

  app.get('/api/save-slots', async (request, reply) => {
    const user = requireUser(request, reply, authService, secureCookies);

    if (user === null) {
      return;
    }

    await reply.send({ saveSlots: saveSlotService.list(user.id) });
  });

  app.post<{ Params: SlotParams }>('/api/save-slots/:slotId', async (request, reply) => {
    const user = requireUser(request, reply, authService, secureCookies);

    if (user === null) {
      return;
    }

    const slotId = parseSlotId(request.params.slotId);
    const saveSlot = saveSlotService.create(user.id, slotId);
    await reply.code(201).send({ saveSlot });
  });

  app.get<{ Params: SlotParams }>('/api/save-slots/:slotId', async (request, reply) => {
    const user = requireUser(request, reply, authService, secureCookies);

    if (user === null) {
      return;
    }

    const slotId = parseSlotId(request.params.slotId);
    const saveSlot = saveSlotService.get(user.id, slotId);
    await reply.send({ saveSlot });
  });

  app.put<{ Params: DeckParams; Body: unknown }>(
    '/api/save-slots/:slotId/decks/:deckId',
    async (request, reply) => {
      const user = requireUser(request, reply, authService, secureCookies);

      if (user === null) {
        return;
      }

      const slotId = parseSlotId(request.params.slotId);
      const parsedDeck = parseSavedDeck(request.body);

      if (!parsedDeck.success) {
        throw new RequestInputError(
          '요청 본문이 SavedDeck Schema를 만족하지 않습니다.',
          parsedDeck.issues satisfies readonly SchemaValidationIssue[],
        );
      }

      const saveSlot = saveSlotService.updateDeck(
        user.id,
        slotId,
        request.params.deckId,
        parsedDeck.value,
      );
      await reply.send({ saveSlot });
    },
  );

  app.delete<{ Params: SlotParams }>('/api/save-slots/:slotId', async (request, reply) => {
    const user = requireUser(request, reply, authService, secureCookies);

    if (user === null) {
      return;
    }

    const slotId = parseSlotId(request.params.slotId);
    saveSlotService.delete(user.id, slotId);
    await reply.code(204).send();
  });

  return app;
}
