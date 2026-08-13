import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BattleCommand, BattleUpdate, CreateBattleRequest } from '../game/battle/protocol';
import type { BattleSlotId } from '../game/battle/types';
import { ALL_BATTLE_SLOT_IDS } from '../game/battle/types';
import { createRuntimeId } from '../game/save/runtime-id';
import { createGameSession } from '../game/save/session-core';
import { readServerCardDefinitions } from './card-definition-catalog';
import { SAVE_SLOT_IDS, type SaveSlotId } from '../game/save/types';
import { authenticateHttpRequest } from './auth-api';
import type { AuthService } from './auth-service';
import { BattleCommandError, BattleSession } from './battle/battle-session';
import { BattleStore } from './battle/battle-store';
import { applyBattleResultToSaveSlot } from './battle/apply-battle-result';
import { readAccountSaveSlotState, writeAccountSaveSlotState } from './save-slots-api';
import { StageCatalog } from './stage-catalog';

type BattleApiOptions = {
  authService: AuthService;
  dataRoot: string;
  projectRoot?: string;
  stageCatalog?: StageCatalog;
  /** 저장 슬롯을 전투 세션으로 읽을 때 쓰는 카드 정의다. 비우면 저장소에서 직접 읽는다. */
  cardDefinitions?: readonly import('../game/save/card-catalog').CardDefinition[];
  store?: BattleStore;
  random?: (() => number) | undefined;
};

const BATTLE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/api/battles/...` 요청을 처리한다.
 *
 * 이 경계 너머에만 전투 엔진이 있다. 클라이언트는 행동 의도만 보내고,
 * 합법성 판정·AI·난수·승패는 전부 여기서 끝난 뒤 확정된 결과만 내려간다.
 */
export function createBattleApiHandler(
  options: BattleApiOptions,
): (request: IncomingMessage, response: ServerResponse) => Promise<boolean> {
  const stageCatalog = options.stageCatalog ?? new StageCatalog(options.projectRoot);
  // 브라우저는 번들러가 카드 정의를 모아 주지만 서버는 직접 읽는다. 한 번만 읽어 둔다.
  const cardDefinitions = options.cardDefinitions ?? readServerCardDefinitions(options.projectRoot);
  const store = options.store ?? new BattleStore();

  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/battles')) {
      return false;
    }

    try {
      const account = authenticateHttpRequest(options.authService, request, response);
      if (!account) {
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/battles') {
        const body = readCreateBattleRequest(await readRequestJson(request));
        const saveSlotState = await readAccountSaveSlotState({
          dataRoot: options.dataRoot,
          accountId: account.accountId,
          slotId: body.slotId,
        });
        if (!saveSlotState) {
          throw new BattleRequestError(`Save slot ${body.slotId} is empty`, 404);
        }

        const stageDefinition = stageCatalog.requireStage(body.stageId);
        const session = new BattleSession({
          battleId: createRuntimeId(),
          session: createGameSession(saveSlotState, cardDefinitions),
          stageDefinition,
          enemyDeck: stageCatalog.resolveEnemyDeck(stageDefinition),
          random: options.random,
        });
        store.add(account.accountId, session);
        const update = session.start();
        sendJson(response, await withPersistedResult(update, session, account.accountId));
        return true;
      }

      const battleId = parseBattleId(url.pathname);
      if (!battleId) {
        response.statusCode = 404;
        response.end('Not found');
        return true;
      }

      const session = store.read(account.accountId, battleId);
      if (!session) {
        throw new BattleRequestError('Battle not found', 404);
      }

      if (request.method === 'GET' && url.pathname === `/api/battles/${battleId}`) {
        // 결과 반영에 실패해 남아 있으면 여기서 다시 시도한다.
        await persistResultIfNeeded(session, account.accountId);
        sendJson(response, { state: session.state });
        return true;
      }

      if (request.method === 'DELETE' && url.pathname === `/api/battles/${battleId}`) {
        store.delete(account.accountId, battleId);
        sendJson(response, { battleId, closed: true });
        return true;
      }

      if (request.method === 'POST' && url.pathname === `/api/battles/${battleId}/actions`) {
        const command = readBattleCommand(await readRequestJson(request));
        const update = session.apply(command);
        sendJson(response, await withPersistedResult(update, session, account.accountId));
        return true;
      }

      response.statusCode = 405;
      response.end('Method Not Allowed');
      return true;
    } catch (error) {
      sendError(response, error);
      return true;
    }
  };

  /**
   * 승패가 났으면 그 결과를 저장 슬롯에 반영한다.
   *
   * 승패도 보상 추첨도 서버가 정하므로 장부도 서버가 적는다. 브라우저는 반영된 저장 상태를 받기만 하고,
   * 진행도를 저장 API로 되돌려 보내지 않는다.
   */
  async function persistResultIfNeeded(
    session: BattleSession,
    accountId: string,
  ): Promise<boolean> {
    const result = session.readUnsavedResult();
    if (!result) {
      return false;
    }

    try {
      const state = await readAccountSaveSlotState({
        dataRoot: options.dataRoot,
        accountId,
        slotId: session.slotId,
      });
      if (!state) {
        throw new Error(`Save slot ${session.slotId} is empty`);
      }

      session.completeResultSave(
        await writeAccountSaveSlotState({
          dataRoot: options.dataRoot,
          accountId,
          state: applyBattleResultToSaveSlot({ state, result, cardDefinitions }),
        }),
      );
    } catch (error) {
      // 전투 판정은 이미 끝났다. 저장만 실패한 것이라 요청 전체를 실패로 만들지 않고 이유만 함께 내려보낸다.
      session.failResultSave(error instanceof Error ? error.message : String(error));
    }

    return true;
  }

  /** 결과를 반영했으면 그 사실이 담긴 상태로 갈아 끼운다. */
  async function withPersistedResult(
    update: BattleUpdate,
    session: BattleSession,
    accountId: string,
  ): Promise<BattleUpdate> {
    const persisted = await persistResultIfNeeded(session, accountId);
    return persisted ? { ...update, state: session.state } : update;
  }
}

/** 요청 자체가 잘못됐을 때 던진다. 상태 코드를 함께 들고 간다. */
class BattleRequestError extends Error {
  public constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'BattleRequestError';
  }
}

function parseBattleId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/battles\/([^/]+)(?:\/actions)?$/);
  const battleId = match?.[1];
  if (!battleId || !BATTLE_ID_PATTERN.test(battleId)) {
    return null;
  }

  return battleId;
}

function readCreateBattleRequest(value: unknown): CreateBattleRequest {
  if (!isRecord(value)) {
    throw new BattleRequestError('Battle body must be an object', 400);
  }

  if (!isSaveSlotId(value.slotId)) {
    throw new BattleRequestError('slotId must be 1, 2 or 3', 400);
  }

  if (typeof value.stageId !== 'string' || value.stageId.length === 0) {
    throw new BattleRequestError('stageId must be a non-empty string', 400);
  }

  return { slotId: value.slotId, stageId: value.stageId };
}

/**
 * 행동 의도만 읽는다.
 *
 * 본문에 상태처럼 보이는 값이 더 들어 있어도 전부 버린다. 서버가 읽는 것은 여기 적힌 필드뿐이라
 * 클라이언트가 HP나 턴을 실어 보내도 판정에 닿지 않는다.
 */
export function readBattleCommand(value: unknown): BattleCommand {
  if (!isRecord(value) || !isRecord(value.action)) {
    throw new BattleRequestError('Battle action body must be an object', 400);
  }

  const action = value.action;
  switch (action.type) {
    case 'PLACE':
      return {
        type: 'PLACE',
        cardInstanceId: readInstanceId(action.cardInstanceId),
        toSlotId: readSlotId(action.toSlotId),
      };
    case 'MOVE':
      return {
        type: 'MOVE',
        cardInstanceId: readInstanceId(action.cardInstanceId),
        toSlotId: readSlotId(action.toSlotId),
      };
    case 'ATTACK':
      return {
        type: 'ATTACK',
        attackerInstanceId: readInstanceId(action.attackerInstanceId),
        toSlotId: readSlotId(action.toSlotId),
      };
    case 'ACTIVE_SKILL':
      return {
        type: 'ACTIVE_SKILL',
        cardInstanceId: readInstanceId(action.cardInstanceId),
        skillId: readInstanceId(action.skillId),
        targetSlotId: readSlotId(action.targetSlotId),
      };
    case 'END_TURN':
      return { type: 'END_TURN' };
    case 'ADVANCE':
      return { type: 'ADVANCE' };
    case 'RESOLVE_BLOCK':
      return {
        type: 'RESOLVE_BLOCK',
        blockerInstanceId:
          action.blockerInstanceId === null ? null : readInstanceId(action.blockerInstanceId),
      };
    default:
      throw new BattleRequestError(`Unsupported battle action type: ${String(action.type)}`, 400);
  }
}

function readInstanceId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new BattleRequestError('Battle action id must be a non-empty string', 400);
  }

  return value;
}

function readSlotId(value: unknown): BattleSlotId {
  if (!ALL_BATTLE_SLOT_IDS.includes(value as BattleSlotId)) {
    throw new BattleRequestError(`Invalid battle slot id: ${String(value)}`, 400);
  }

  return value as BattleSlotId;
}

function isSaveSlotId(value: unknown): value is SaveSlotId {
  return SAVE_SLOT_IDS.includes(value as SaveSlotId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readRequestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return null;
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw.length > 0 ? JSON.parse(raw) : null;
}

function sendError(response: ServerResponse, error: unknown): void {
  response.statusCode = readErrorStatusCode(error);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
}

function readErrorStatusCode(error: unknown): number {
  if (error instanceof BattleRequestError) {
    return error.statusCode;
  }

  // 지금 상태에서 받을 수 없는 행동이다. 서버 상태는 그대로라 클라이언트가 다시 그리면 된다.
  if (error instanceof BattleCommandError) {
    return 409;
  }

  if (error instanceof SyntaxError) {
    return 400;
  }

  if (error instanceof Error && error.message.startsWith('Unknown stageId:')) {
    return 400;
  }

  return 500;
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.statusCode = response.statusCode || 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}
