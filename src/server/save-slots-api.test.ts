import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { CARD_DEFINITIONS } from '../game/save/card-catalog-data';
import { createInitialSaveState } from '../game/save/create-initial-save';
import { SAVE_SLOT_SCHEMA_VERSION, type SaveSlotState } from '../game/save/types';
import { AUTH_SESSION_COOKIE_NAME } from './auth-api';
import { AuthService } from './auth-service';
import {
  createSaveSlotsApiHandler,
  listSaveSlotSummaries,
  migrateLegacySaveSlots,
  writeAccountSaveSlotState,
} from './save-slots-api';

function createRequest(method: string, url: string, body?: string): IncomingMessage {
  const request = Readable.from(body ? [body] : []) as IncomingMessage;
  request.method = method;
  request.url = url;
  request.headers = {};
  return request;
}

async function createTestContext(tempRoot: string): Promise<{
  handler: ReturnType<typeof createSaveSlotsApiHandler>;
  request(method: string, url: string, body?: string): IncomingMessage;
  slotsRoot: string;
  dataRoot: string;
  accountId: string;
}> {
  const dataRoot = path.join(tempRoot, 'data');
  const authService = new AuthService({ dataRoot, startCleanupTimer: false });
  const issued = await authService.register({ id: 'test_user', password: 'password-123' });
  return {
    handler: createSaveSlotsApiHandler({
      authService,
      projectRoot: process.cwd(),
      dataRoot,
    }),
    request(method, url, body) {
      const request = createRequest(method, url, body);
      request.headers.cookie = `${AUTH_SESSION_COOKIE_NAME}=${issued.token}`;
      return request;
    },
    slotsRoot: path.join(dataRoot, 'users', issued.accountId, 'save-slots'),
    dataRoot,
    accountId: issued.accountId,
  };
}

function createResponse(): {
  response: ServerResponse;
  json(): unknown;
  text(): string;
  statusCode(): number | undefined;
} {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    end(chunk?: unknown) {
      if (chunk != null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      }
      return this;
    },
  } as unknown as ServerResponse;

  return {
    response,
    json() {
      return JSON.parse(chunks.join('') || 'null') as unknown;
    },
    text() {
      return chunks.join('');
    },
    statusCode() {
      return response.statusCode;
    },
  };
}

describe('save slots api', () => {
  it('rejects unauthenticated save-slot requests', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const dataRoot = path.join(tempRoot, 'data');
    const authService = new AuthService({ dataRoot, startCleanupTimer: false });
    const handler = createSaveSlotsApiHandler({ authService, dataRoot });
    const req = createRequest('GET', '/api/save-slots');
    const res = createResponse();

    await handler(req, res.response, () => undefined);

    expect(res.statusCode()).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'NO_SESSION' } });
  });

  it('returns three empty summaries when no files exist', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request } = await createTestContext(tempRoot);
    const req = request('GET', '/api/save-slots');
    const res = createResponse();

    await handler(req, res.response, () => undefined);

    expect(res.statusCode()).toBe(200);
    const body = res.json() as { slots: Array<{ slotId: number; isEmpty: boolean }> };
    expect(body.slots).toHaveLength(3);
    expect(body.slots.every((slot) => slot.isEmpty)).toBe(true);
  });

  it('initializes, saves, and reloads a slot', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request, slotsRoot } = await createTestContext(tempRoot);

    const initReq = request(
      'POST',
      '/api/save-slots/1/initialize',
      JSON.stringify({ saveName: '첫 모험' }),
    );
    const initRes = createResponse();
    await handler(initReq, initRes.response, () => undefined);

    expect(initRes.statusCode()).toBe(200);
    const initBody = initRes.json() as {
      state: SaveSlotState;
      summary: { isEmpty: boolean; leaderName: string | null };
    };
    expect(initBody.state.slotId).toBe(1);
    expect(initBody.state.saveName).toBe('첫 모험');
    expect(initBody.state.deck.cards).toHaveLength(29);
    expect(initBody.state.deck.leader.id).toBe('leader_minerva');
    expect(initBody.state.deck.leader.name).toBe('미네르바');
    expect(initBody.state.deck.leader.description).toBeTypeOf('string');
    expect(initBody.state.deck.leader.abilities).toEqual([]);
    expect(initBody.state.collection.cards.map((card) => card.id)).toEqual(
      CARD_DEFINITIONS.filter((definition) => definition.type === 'EQUIPMENT').map(
        (definition) => definition.id,
      ),
    );
    expect(initBody.state.collection.cards.every((card) => card.type === 'EQUIPMENT')).toBe(true);
    expect(initBody.state.collection.cards.every((card) => card.zone === 'COLLECTION')).toBe(true);
    expect(initBody.state.equipment).toEqual({ equipped: [] });
    expect(initBody.state.stageProgress).toEqual({
      clearedStageIds: [],
      lastSelectedStageId: null,
      stageBgmIds: {},
    });
    expect(initBody.summary.isEmpty).toBe(false);
    expect(initBody.summary.leaderName).toBe('미네르바');

    const list = await listSaveSlotSummaries(slotsRoot);
    expect(list.slots[0]?.isEmpty).toBe(false);
    expect(list.slots[0]?.leaderName).toBe('미네르바');

    const savedState: SaveSlotState = {
      ...initBody.state,
      updatedAt: '2024-01-02T03:04:05.000Z',
      saveName: 'Manual Save',
      stageProgress: {
        // 클리어 목록은 서버가 지킨다. 본문에 적어 보내도 디스크 값이 그대로 남는다.
        clearedStageIds: [],
        lastSelectedStageId: 'test-stage-dark',
        stageBgmIds: {},
      },
      lobby: {
        ...initBody.state.lobby,
        standingPositionY: -100,
      },
    };
    const putReq = request('PUT', '/api/save-slots/1', JSON.stringify(savedState));
    const putRes = createResponse();
    await handler(putReq, putRes.response, () => undefined);

    expect(putRes.statusCode()).toBe(200);
    expect(putRes.json()).toEqual(savedState);

    const getReq = request('GET', '/api/save-slots/1');
    const getRes = createResponse();
    await handler(getReq, getRes.response, () => undefined);

    expect(getRes.statusCode()).toBe(200);
    const getBody = getRes.json() as SaveSlotState;
    expect(getBody.slotId).toBe(1);
    expect(getBody).toEqual(savedState);
    expect(getBody.saveName).toBe('Manual Save');
    expect(getBody.deck.leader).not.toHaveProperty('definitionId');

    const updatedList = await listSaveSlotSummaries(slotsRoot);
    expect(updatedList.slots[0]).toMatchObject({
      slotId: 1,
      saveName: 'Manual Save',
      updatedAt: '2024-01-02T03:04:05.000Z',
      leaderName: '미네르바',
      isEmpty: false,
    });
  });

  it('rejects an empty or overlong initialize save name', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request } = await createTestContext(tempRoot);

    const empty = createResponse();
    await handler(
      request('POST', '/api/save-slots/1/initialize', JSON.stringify({ saveName: '   ' })),
      empty.response,
      () => undefined,
    );
    expect(empty.statusCode()).toBe(400);
    expect(empty.text()).toContain('non-empty');

    const overlong = createResponse();
    await handler(
      request('POST', '/api/save-slots/1/initialize', JSON.stringify({ saveName: 'a'.repeat(41) })),
      overlong.response,
      () => undefined,
    );
    expect(overlong.statusCode()).toBe(400);
    expect(overlong.text()).toContain('exceed');
  });

  it('본문 없는 initialize는 기본 이름으로 만들지 않고 거절한다', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request, slotsRoot } = await createTestContext(tempRoot);

    const response = createResponse();
    await handler(
      request('POST', '/api/save-slots/1/initialize'),
      response.response,
      () => undefined,
    );

    expect(response.statusCode()).toBe(400);
    expect(response.text()).toContain('must be an object');
    await expect(fs.access(path.join(slotsRoot, 'slot-1.json'))).rejects.toThrow();
  });

  it('deletes an initialized slot and returns an empty summary', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request, slotsRoot } = await createTestContext(tempRoot);

    const initRes = createResponse();
    await handler(
      request('POST', '/api/save-slots/2/initialize', JSON.stringify({ saveName: 'Slot 2' })),
      initRes.response,
      () => undefined,
    );
    expect(initRes.statusCode()).toBe(200);

    const deleteRes = createResponse();
    await handler(request('DELETE', '/api/save-slots/2'), deleteRes.response, () => undefined);

    expect(deleteRes.statusCode()).toBe(200);
    expect(deleteRes.json()).toEqual({
      summary: {
        slotId: 2,
        saveName: null,
        updatedAt: null,
        deckCardCount: null,
        leaderName: null,
        isEmpty: true,
      },
    });
    await expect(fs.stat(path.join(slotsRoot, 'slot-2.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const summaries = await listSaveSlotSummaries(slotsRoot);
    expect(summaries.slots[1]).toMatchObject({ slotId: 2, isEmpty: true });

    const repeatedDeleteRes = createResponse();
    await handler(
      request('DELETE', '/api/save-slots/2'),
      repeatedDeleteRes.response,
      () => undefined,
    );
    expect(repeatedDeleteRes.statusCode()).toBe(200);
  });

  it('normalizes legacy card instances when reading an existing slot', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request, slotsRoot } = await createTestContext(tempRoot);
    await fs.mkdir(slotsRoot, { recursive: true });
    await fs.writeFile(
      path.join(slotsRoot, 'slot-1.json'),
      JSON.stringify({
        schemaVersion: 1,
        slotId: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        saveName: 'Legacy Save',
        deck: {
          id: 'deck-legacy',
          leader: {
            instanceId: 'leader-legacy',
            definitionId: 'leader_minerva',
            owner: 'PLAYER',
            zone: 'LEADER',
            level: 1,
            exp: 0,
            currentHp: 17,
            currentAttack: 2,
          },
          cards: [],
        },
      }),
      'utf8',
    );
    const req = request('GET', '/api/save-slots/1');
    const res = createResponse();

    await handler(req, res.response, () => undefined);

    expect(res.statusCode()).toBe(200);
    const body = res.json() as SaveSlotState;
    expect(body.deck.leader).toMatchObject({
      id: 'leader_minerva',
      name: '미네르바',
      instanceId: 'leader-legacy',
      // 저장본이 들고 온 currentHp가 아니라 카탈로그 정의에서 다시 계산한 값이다.
      hp: 18,
      attack: 2,
    });
    expect(body.schemaVersion).toBe(SAVE_SLOT_SCHEMA_VERSION);
    expect(body.collection.cards).toEqual([]);
    expect(body.equipment).toEqual({ equipped: [] });
    expect(body.deck.leader).not.toHaveProperty('definitionId');
    expect(body.deck.leader.abilities).toEqual([]);
    expect(body.stageProgress).toEqual({
      clearedStageIds: [],
      lastSelectedStageId: null,
      stageBgmIds: {},
    });
    expect(body.resources).toEqual({ gold: 0, manaStone: 0, summonTicket: 0 });
  });

  it('keeps resource balances through a save and reload, and defaults them for older slots', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request, slotsRoot } = await createTestContext(tempRoot);
    await fs.mkdir(slotsRoot, { recursive: true });

    // schemaVersion 5에는 resources가 없다. 없는 필드는 기본값으로 채워 열려야 한다.
    const initialize = createResponse();
    await handler(
      request('POST', '/api/save-slots/1/initialize', JSON.stringify({ saveName: 'Slot 1' })),
      initialize.response,
      () => undefined,
    );
    const initialized = initialize.json() as { state: SaveSlotState };
    const legacy = { ...initialized.state, schemaVersion: 5 };
    delete (legacy as Partial<SaveSlotState>).resources;
    await fs.writeFile(path.join(slotsRoot, 'slot-1.json'), JSON.stringify(legacy), 'utf8');

    const migrated = createResponse();
    await handler(request('GET', '/api/save-slots/1'), migrated.response, () => undefined);

    expect(migrated.statusCode()).toBe(200);
    expect((migrated.json() as SaveSlotState).resources).toEqual({
      gold: 0,
      manaStone: 0,
      summonTicket: 0,
    });

    // 재화는 서버가 늘린다. 본문에 적어 보내도 디스크 값이 그대로 남는다.
    const spent = createResponse();
    await handler(
      request(
        'PUT',
        '/api/save-slots/1',
        JSON.stringify({
          ...initialized.state,
          resources: { gold: 125_680, manaStone: 8_420, summonTicket: 12 },
        }),
      ),
      spent.response,
      () => undefined,
    );

    expect(spent.statusCode()).toBe(200);
    expect((spent.json() as SaveSlotState).resources).toEqual({
      gold: 0,
      manaStone: 0,
      summonTicket: 0,
    });

    const reloaded = createResponse();
    await handler(request('GET', '/api/save-slots/1'), reloaded.response, () => undefined);

    expect((reloaded.json() as SaveSlotState).resources).toEqual({
      gold: 0,
      manaStone: 0,
      summonTicket: 0,
    });
  });

  it('schemaVersion 6 로비에 없던 standing 설정을 기본값으로 승격한다', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request, slotsRoot } = await createTestContext(tempRoot);
    await fs.mkdir(slotsRoot, { recursive: true });
    const state = await createInitialSaveState({ slotId: 1 });
    const legacy = {
      ...state,
      schemaVersion: 6,
      lobby: {
        ownedBackgroundIds: state.lobby.ownedBackgroundIds,
        selectedBackgroundId: state.lobby.selectedBackgroundId,
      },
    };
    await fs.writeFile(path.join(slotsRoot, 'slot-1.json'), JSON.stringify(legacy), 'utf8');

    const response = createResponse();
    await handler(request('GET', '/api/save-slots/1'), response.response, () => undefined);

    expect(response.statusCode()).toBe(200);
    expect((response.json() as SaveSlotState).lobby).toMatchObject({
      standingVisible: true,
      standingMediaType: 'auto',
      standingPositionX: 56,
      standingPositionY: 0,
      standingScale: 100,
    });
  });

  it('schemaVersion 7 로비에 없던 standing 세로 위치를 기본값으로 승격한다', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request, slotsRoot } = await createTestContext(tempRoot);
    await fs.mkdir(slotsRoot, { recursive: true });
    const state = await createInitialSaveState({ slotId: 1 });
    const legacy = {
      ...state,
      schemaVersion: 7,
      lobby: {
        ownedBackgroundIds: state.lobby.ownedBackgroundIds,
        selectedBackgroundId: state.lobby.selectedBackgroundId,
        standingVisible: state.lobby.standingVisible,
        standingPositionX: state.lobby.standingPositionX,
        standingScale: state.lobby.standingScale,
      },
    };
    await fs.writeFile(path.join(slotsRoot, 'slot-1.json'), JSON.stringify(legacy), 'utf8');

    const response = createResponse();
    await handler(request('GET', '/api/save-slots/1'), response.response, () => undefined);

    expect(response.statusCode()).toBe(200);
    expect((response.json() as SaveSlotState).lobby).toMatchObject({
      standingMediaType: 'auto',
      standingPositionY: 0,
    });
  });

  it('schemaVersion 8 로비에 없던 standing 미디어 선택을 자동으로 승격한다', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request, slotsRoot } = await createTestContext(tempRoot);
    await fs.mkdir(slotsRoot, { recursive: true });
    const state = await createInitialSaveState({ slotId: 1 });
    const legacy = {
      ...state,
      schemaVersion: 8,
      lobby: {
        ownedBackgroundIds: state.lobby.ownedBackgroundIds,
        selectedBackgroundId: state.lobby.selectedBackgroundId,
        standingVisible: state.lobby.standingVisible,
        standingPositionX: state.lobby.standingPositionX,
        standingPositionY: state.lobby.standingPositionY,
        standingScale: state.lobby.standingScale,
      },
    };
    await fs.writeFile(path.join(slotsRoot, 'slot-1.json'), JSON.stringify(legacy), 'utf8');

    const response = createResponse();
    await handler(request('GET', '/api/save-slots/1'), response.response, () => undefined);

    expect(response.statusCode()).toBe(200);
    expect((response.json() as SaveSlotState).lobby.standingMediaType).toBe('auto');
  });

  it('schemaVersion 9 로비에 없던 BGM 플레이리스트를 기본값으로 승격한다', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request, slotsRoot } = await createTestContext(tempRoot);
    await fs.mkdir(slotsRoot, { recursive: true });
    const state = await createInitialSaveState({ slotId: 1 });
    const legacy = {
      ...state,
      schemaVersion: 9,
      lobby: {
        ownedBackgroundIds: state.lobby.ownedBackgroundIds,
        selectedBackgroundId: state.lobby.selectedBackgroundId,
        standingVisible: state.lobby.standingVisible,
        standingMediaType: state.lobby.standingMediaType,
        standingPositionX: state.lobby.standingPositionX,
        standingPositionY: state.lobby.standingPositionY,
        standingScale: state.lobby.standingScale,
      },
    };
    await fs.writeFile(path.join(slotsRoot, 'slot-1.json'), JSON.stringify(legacy), 'utf8');

    const response = createResponse();
    await handler(request('GET', '/api/save-slots/1'), response.response, () => undefined);

    expect(response.statusCode()).toBe(200);
    expect((response.json() as SaveSlotState).lobby).toMatchObject({
      bgmTrackIds: [],
      bgmPlayMode: 'sequential',
    });
  });

  it('schemaVersion 10 진행 상태에 없던 스테이지 BGM 표를 기본값으로 승격한다', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request, slotsRoot } = await createTestContext(tempRoot);
    await fs.mkdir(slotsRoot, { recursive: true });
    const state = await createInitialSaveState({ slotId: 1 });
    const legacy = {
      ...state,
      schemaVersion: 10,
      stageProgress: {
        clearedStageIds: state.stageProgress.clearedStageIds,
        lastSelectedStageId: state.stageProgress.lastSelectedStageId,
      },
    };
    await fs.writeFile(path.join(slotsRoot, 'slot-1.json'), JSON.stringify(legacy), 'utf8');

    const response = createResponse();
    await handler(request('GET', '/api/save-slots/1'), response.response, () => undefined);

    expect(response.statusCode()).toBe(200);
    expect((response.json() as SaveSlotState).stageProgress.stageBgmIds).toEqual({});
  });

  it('rejects a resource balance that is not a count', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request } = await createTestContext(tempRoot);
    const initialize = createResponse();
    await handler(
      request('POST', '/api/save-slots/1/initialize', JSON.stringify({ saveName: 'Slot 1' })),
      initialize.response,
      () => undefined,
    );
    const { state } = initialize.json() as { state: SaveSlotState };

    const negative = createResponse();
    await handler(
      request(
        'PUT',
        '/api/save-slots/1',
        JSON.stringify({
          ...state,
          resources: { gold: -1, manaStone: 0, summonTicket: 0 },
        }),
      ),
      negative.response,
      () => undefined,
    );

    expect(negative.statusCode()).toBe(400);
  });

  it('rejects collection cards outside the collection zone', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request } = await createTestContext(tempRoot);

    const initReq = request(
      'POST',
      '/api/save-slots/1/initialize',
      JSON.stringify({ saveName: 'Slot 1' }),
    );
    const initRes = createResponse();
    await handler(initReq, initRes.response, () => undefined);
    const initBody = initRes.json() as { state: SaveSlotState };
    const invalidState: SaveSlotState = {
      ...initBody.state,
      collection: {
        cards: [
          {
            ...initBody.state.deck.cards[0]!,
            instanceId: 'bad-collection-zone',
            zone: 'DECK',
          },
        ],
      },
    };

    const putReq = request('PUT', '/api/save-slots/1', JSON.stringify(invalidState));
    const putRes = createResponse();
    await handler(putReq, putRes.response, () => undefined);

    expect(putRes.statusCode()).toBe(400);
    expect(putRes.text()).toBe('collection must be a card collection');
  });

  it('persists valid equipment attachments and rejects invalid equipment references', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request } = await createTestContext(tempRoot);

    const initReq = request(
      'POST',
      '/api/save-slots/1/initialize',
      JSON.stringify({ saveName: 'Slot 1' }),
    );
    const initRes = createResponse();
    await handler(initReq, initRes.response, () => undefined);
    const initBody = initRes.json() as { state: SaveSlotState };
    const target = initBody.state.deck.cards.find((card) => card.id === 'unit_elf_guardian_001')!;
    const equipment = initBody.state.collection.cards.find(
      (card) => card.id === 'equipment_rapier_001',
    )!;
    const validState: SaveSlotState = {
      ...initBody.state,
      equipment: {
        equipped: [
          {
            targetCardInstanceId: target.instanceId,
            equipmentCardInstanceId: equipment.instanceId,
          },
        ],
      },
    };

    const putReq = request('PUT', '/api/save-slots/1', JSON.stringify(validState));
    const putRes = createResponse();
    await handler(putReq, putRes.response, () => undefined);

    expect(putRes.statusCode()).toBe(200);
    expect((putRes.json() as SaveSlotState).equipment.equipped).toEqual(
      validState.equipment.equipped,
    );

    const invalidState: SaveSlotState = {
      ...validState,
      equipment: {
        equipped: [
          {
            targetCardInstanceId: initBody.state.deck.cards.find(
              (card) => card.id === 'unit_elf_scout_001',
            )!.instanceId,
            equipmentCardInstanceId: equipment.instanceId,
          },
        ],
      },
    };
    const invalidReq = request('PUT', '/api/save-slots/1', JSON.stringify(invalidState));
    const invalidRes = createResponse();
    await handler(invalidReq, invalidRes.response, () => undefined);

    expect(invalidRes.statusCode()).toBe(400);
    expect(invalidRes.text()).toContain('Equipment slot limit exceeded');
  });

  it('rejects invalid slot numbers', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request } = await createTestContext(tempRoot);
    const req = request('PUT', '/api/save-slots/9', '{}');
    const res = createResponse();

    await handler(req, res.response, () => undefined);

    expect(res.statusCode()).toBe(404);
    expect(res.text()).toBe('Not found');
  });

  it('조작한 카드 수치는 저장되지 않고 카탈로그 값으로 되돌아온다', async () => {
    // 전투 엔진이 서버에 있어도 저장본이 오염되면 서버가 그 수치로 전투를 만든다. 그 입구를 막는다.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request } = await createTestContext(tempRoot);

    const initReq = request(
      'POST',
      '/api/save-slots/1/initialize',
      JSON.stringify({ saveName: 'T' }),
    );
    const initRes = createResponse();
    await handler(initReq, initRes.response, () => undefined);
    const initial = (initRes.json() as { state: SaveSlotState }).state;
    const originalHp = initial.deck.leader.hp;
    const originalAttack = initial.deck.cards[0]!.attack;

    const tampered: SaveSlotState = {
      ...initial,
      deck: {
        ...initial.deck,
        leader: { ...initial.deck.leader, hp: 9999, attack: 9999 },
        cards: initial.deck.cards.map((card, index) =>
          index === 0 ? { ...card, attack: 9999, dominance: 99, level: 9 } : card,
        ),
      },
    };
    const putReq = request('PUT', '/api/save-slots/1', JSON.stringify(tampered));
    const putRes = createResponse();
    await handler(putReq, putRes.response, () => undefined);

    expect(putRes.statusCode()).toBe(200);
    const stored = putRes.json() as SaveSlotState;
    expect(stored.deck.leader.hp).toBe(originalHp);
    expect(stored.deck.leader.attack).toBe(initial.deck.leader.attack);
    expect(stored.deck.cards[0]!.attack).toBe(originalAttack);
    expect(stored.deck.cards[0]!.level).toBe(1);

    // 디스크에 남은 것도 되돌린 값이어야 한다. 다시 읽어 전투를 열 때 쓰이는 값이다.
    const getReq = request('GET', '/api/save-slots/1');
    const getRes = createResponse();
    await handler(getReq, getRes.response, () => undefined);
    expect((getRes.json() as SaveSlotState).deck.leader.hp).toBe(originalHp);
  });

  it('조작한 능력과 이름도 카탈로그 정의로 되돌린다', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request } = await createTestContext(tempRoot);

    const initReq = request(
      'POST',
      '/api/save-slots/1/initialize',
      JSON.stringify({ saveName: 'T' }),
    );
    const initRes = createResponse();
    await handler(initReq, initRes.response, () => undefined);
    const initial = (initRes.json() as { state: SaveSlotState }).state;
    const original = initial.deck.cards[0]!;

    const tampered: SaveSlotState = {
      ...initial,
      deck: {
        ...initial.deck,
        cards: initial.deck.cards.map((card, index) =>
          index === 0
            ? {
                ...card,
                cost: 0,
                abilities: [
                  {
                    id: 'guardian_block',
                    category: 'GLOBAL' as const,
                    name: '훔친 능력',
                    text: '',
                  },
                ],
              }
            : card,
        ),
      },
    };
    const putReq = request('PUT', '/api/save-slots/1', JSON.stringify(tampered));
    const putRes = createResponse();
    await handler(putReq, putRes.response, () => undefined);

    const stored = (putRes.json() as SaveSlotState).deck.cards[0]!;
    expect(stored.cost).toBe(original.cost);
    expect(stored.abilities).toEqual(original.abilities);
  });

  it('카탈로그에 없는 카드 id는 거절한다', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request } = await createTestContext(tempRoot);

    const initReq = request(
      'POST',
      '/api/save-slots/1/initialize',
      JSON.stringify({ saveName: 'T' }),
    );
    const initRes = createResponse();
    await handler(initReq, initRes.response, () => undefined);
    const initial = (initRes.json() as { state: SaveSlotState }).state;

    const forged: SaveSlotState = {
      ...initial,
      collection: {
        cards: [{ ...initial.deck.cards[0]!, id: 'unit_forged_999', zone: 'COLLECTION' as const }],
      },
    };
    const putReq = request('PUT', '/api/save-slots/1', JSON.stringify(forged));
    const putRes = createResponse();
    await handler(putReq, putRes.response, () => undefined);

    expect(putRes.statusCode()).toBe(400);
    expect(putRes.text()).toContain('Unknown card id');
  });

  it('진행도는 본문에서 읽지 않고 디스크 값을 지킨다', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request } = await createTestContext(tempRoot);
    const initRes = createResponse();
    await handler(
      request('POST', '/api/save-slots/1/initialize', JSON.stringify({ saveName: 'T' })),
      initRes.response,
      () => undefined,
    );
    const initial = (initRes.json() as { state: SaveSlotState }).state;

    const tampered: SaveSlotState = {
      ...initial,
      resources: { gold: 999_999, manaStone: 999, summonTicket: 99 },
      stageProgress: {
        ...initial.stageProgress,
        clearedStageIds: ['level01', 'level07'],
      },
      deck: {
        ...initial.deck,
        leader: { ...initial.deck.leader, exp: 999_999 },
        cards: initial.deck.cards.map((card, index) =>
          index === 0 ? { ...card, exp: 999_999 } : card,
        ),
      },
    };
    const putRes = createResponse();
    await handler(
      request('PUT', '/api/save-slots/1', JSON.stringify(tampered)),
      putRes.response,
      () => undefined,
    );

    expect(putRes.statusCode()).toBe(200);
    const stored = putRes.json() as SaveSlotState;
    expect(stored.resources).toEqual(initial.resources);
    expect(stored.stageProgress.clearedStageIds).toEqual([]);
    expect(stored.deck.leader.exp).toBe(0);
    expect(stored.deck.cards[0]!.exp).toBe(0);
    // EXP를 못 올렸으니 레벨과 수치도 그대로다.
    expect(stored.deck.cards[0]!.level).toBe(1);
    expect(stored.deck.cards[0]!.hp).toBe(initial.deck.cards[0]!.hp);
  });

  it('사용자가 정하는 값은 그대로 저장한다', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request } = await createTestContext(tempRoot);
    const initRes = createResponse();
    await handler(
      request('POST', '/api/save-slots/1/initialize', JSON.stringify({ saveName: 'T' })),
      initRes.response,
      () => undefined,
    );
    const initial = (initRes.json() as { state: SaveSlotState }).state;

    // 덱에서 카드 한 장을 보유함으로 옮기고 로비와 이름도 바꾼다. 전부 사용자가 정하는 값이다.
    const moved = { ...initial.deck.cards[0]!, zone: 'COLLECTION' as const };
    const edited: SaveSlotState = {
      ...initial,
      saveName: '내 저장',
      deck: { ...initial.deck, cards: initial.deck.cards.slice(1) },
      collection: { cards: [...initial.collection.cards, moved] },
      lobby: { ...initial.lobby, standingVisible: !initial.lobby.standingVisible },
      stageProgress: { ...initial.stageProgress, lastSelectedStageId: 'level01' },
    };
    const putRes = createResponse();
    await handler(
      request('PUT', '/api/save-slots/1', JSON.stringify(edited)),
      putRes.response,
      () => undefined,
    );

    expect(putRes.statusCode()).toBe(200);
    const stored = putRes.json() as SaveSlotState;
    expect(stored.saveName).toBe('내 저장');
    expect(stored.deck.cards).toHaveLength(initial.deck.cards.length - 1);
    expect(stored.collection.cards.map((card) => card.instanceId)).toContain(moved.instanceId);
    expect(stored.lobby.standingVisible).toBe(edited.lobby.standingVisible);
    expect(stored.stageProgress.lastSelectedStageId).toBe('level01');
  });

  it('재료 성장은 전용 API에서 서버가 계산한다', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request } = await createTestContext(tempRoot);
    const initRes = createResponse();
    await handler(
      request('POST', '/api/save-slots/1/initialize', JSON.stringify({ saveName: 'T' })),
      initRes.response,
      () => undefined,
    );
    const initial = (initRes.json() as { state: SaveSlotState }).state;
    const target = initial.deck.cards.find((card) => card.type === 'UNIT')!;
    const material = initial.collection.cards.find((card) => card.type === 'UNIT');
    if (!material) {
      // 초기 보유함에 UNIT이 없으면 이 시나리오를 세울 수 없다.
      return;
    }

    const growRes = createResponse();
    await handler(
      request(
        'POST',
        '/api/save-slots/1/growth',
        JSON.stringify({
          growths: [
            {
              targetDeckCardInstanceId: target.instanceId,
              materialCollectionCardInstanceIds: [material.instanceId],
            },
          ],
        }),
      ),
      growRes.response,
      () => undefined,
    );

    expect(growRes.statusCode()).toBe(200);
    const grown = growRes.json() as SaveSlotState;
    const grownTarget = grown.deck.cards.find((card) => card.instanceId === target.instanceId)!;
    expect(grownTarget.exp).toBeGreaterThan(0);
    // 재료는 보유함에서 빠진다.
    expect(grown.collection.cards.map((card) => card.instanceId)).not.toContain(
      material.instanceId,
    );
  });

  it('덱에 없는 카드를 성장 대상으로 보내면 거절한다', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const { handler, request } = await createTestContext(tempRoot);
    await handler(
      request('POST', '/api/save-slots/1/initialize', JSON.stringify({ saveName: 'T' })),
      createResponse().response,
      () => undefined,
    );

    const growRes = createResponse();
    await handler(
      request(
        'POST',
        '/api/save-slots/1/growth',
        JSON.stringify({
          growths: [
            { targetDeckCardInstanceId: 'nope', materialCollectionCardInstanceIds: ['nope-2'] },
          ],
        }),
      ),
      growRes.response,
      () => undefined,
    );

    expect(growRes.statusCode()).toBe(400);
    expect(growRes.text()).toContain('Deck growth target not found');
  });

  describe('카드 구성 검증', () => {
    async function createSlot() {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
      const context = await createTestContext(tempRoot);
      const initRes = createResponse();
      await context.handler(
        context.request('POST', '/api/save-slots/1/initialize', JSON.stringify({ saveName: 'T' })),
        initRes.response,
        () => undefined,
      );

      return { ...context, initial: (initRes.json() as { state: SaveSlotState }).state };
    }

    async function put(
      context: Awaited<ReturnType<typeof createSlot>>,
      state: SaveSlotState,
    ): Promise<{ status: number | undefined; text: string }> {
      const res = createResponse();
      await context.handler(
        context.request('PUT', '/api/save-slots/1', JSON.stringify(state)),
        res.response,
        () => undefined,
      );

      return { status: res.statusCode(), text: res.text() };
    }

    it('얻지 않은 카드를 보유함에 적어 넣으면 거절한다', async () => {
      // 보유함의 장비는 전투 유닛에 붙어 전투에 들어간다. 수치가 정직해도 가질 자격은 별개다.
      const context = await createSlot();
      const forged = {
        ...structuredClone(context.initial.deck.cards[0]!),
        instanceId: 'forged-1',
        zone: 'COLLECTION' as const,
      };
      const result = await put(context, {
        ...context.initial,
        collection: { cards: [...context.initial.collection.cards, forged] },
      });

      expect(result.status).toBe(400);
      expect(result.text).toContain('Card was not obtained');
    });

    it('카드를 몰래 지우면 거절한다', async () => {
      const context = await createSlot();
      const result = await put(context, {
        ...context.initial,
        deck: { ...context.initial.deck, cards: context.initial.deck.cards.slice(1) },
      });

      expect(result.status).toBe(400);
      expect(result.text).toContain('Card is missing from the save');
    });

    it('같은 카드를 두 번 적어 넣으면 거절한다', async () => {
      const context = await createSlot();
      const result = await put(context, {
        ...context.initial,
        deck: {
          ...context.initial.deck,
          cards: [...context.initial.deck.cards, context.initial.deck.cards[0]!],
        },
      });

      expect(result.status).toBe(400);
      expect(result.text).toContain('Duplicate card instanceId');
    });

    it('instanceId는 그대로 두고 다른 카드로 바꿔치기하면 거절한다', async () => {
      const context = await createSlot();
      const other = context.initial.deck.cards.find(
        (card) => card.id !== context.initial.deck.cards[0]!.id,
      )!;
      const result = await put(context, {
        ...context.initial,
        deck: {
          ...context.initial.deck,
          cards: context.initial.deck.cards.map((card, index) =>
            index === 0 ? { ...card, id: other.id } : card,
          ),
        },
      });

      expect(result.status).toBe(400);
      expect(result.text).toContain('Card id changed');
    });

    it('덱과 보유함 사이 이동은 그대로 통과한다', async () => {
      const context = await createSlot();
      const moved = { ...context.initial.deck.cards[0]!, zone: 'COLLECTION' as const };
      const result = await put(context, {
        ...context.initial,
        deck: { ...context.initial.deck, cards: context.initial.deck.cards.slice(1) },
        collection: { cards: [...context.initial.collection.cards, moved] },
      });

      expect(result.status).toBe(200);
    });

    it('리더 자리에는 LEADER 카드만 둘 수 있다', async () => {
      const context = await createSlot();
      const unit = context.initial.deck.cards[0]!;
      const result = await put(context, {
        ...context.initial,
        deck: {
          ...context.initial.deck,
          leader: { ...unit, zone: 'LEADER' as const },
          cards: [
            ...context.initial.deck.cards.slice(1),
            { ...context.initial.deck.leader, zone: 'DECK' as const },
          ],
        },
      });

      expect(result.status).toBe(400);
      expect(result.text).toContain('Deck leader must be a LEADER card');
    });

    it('덱에는 UNIT 카드만 둘 수 있다', async () => {
      const context = await createSlot();
      const equipment = context.initial.collection.cards.find((card) => card.type === 'EQUIPMENT');
      if (!equipment) {
        return;
      }

      const result = await put(context, {
        ...context.initial,
        deck: {
          ...context.initial.deck,
          cards: [...context.initial.deck.cards, { ...equipment, zone: 'DECK' as const }],
        },
        collection: {
          cards: context.initial.collection.cards.filter(
            (card) => card.instanceId !== equipment.instanceId,
          ),
        },
      });

      expect(result.status).toBe(400);
      expect(result.text).toContain('Deck card must be a UNIT card');
    });

    it('서버가 지급한 카드는 다음 저장에서 정상으로 통과한다', async () => {
      const context = await createSlot();
      const granted = {
        ...structuredClone(context.initial.deck.cards[0]!),
        instanceId: 'granted-1',
        zone: 'COLLECTION' as const,
      };

      // 전투 보상처럼 서버가 직접 쓴다. 이 경로에는 보존 검사를 걸지 않는다.
      await writeAccountSaveSlotState({
        dataRoot: context.dataRoot,
        accountId: context.accountId,
        state: {
          ...context.initial,
          collection: { cards: [...context.initial.collection.cards, granted] },
        },
      });

      const getRes = createResponse();
      await context.handler(
        context.request('GET', '/api/save-slots/1'),
        getRes.response,
        () => undefined,
      );
      const withReward = getRes.json() as SaveSlotState;
      expect(withReward.collection.cards.map((card) => card.instanceId)).toContain('granted-1');

      // 브라우저가 그 상태를 그대로 되돌려 보내면 통과해야 한다.
      expect((await put(context, withReward)).status).toBe(200);
    });
  });

  it('isolates the same slot id between authenticated accounts', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const dataRoot = path.join(tempRoot, 'data');
    const authService = new AuthService({ dataRoot, startCleanupTimer: false });
    const first = await authService.register({ id: 'first_user', password: 'password-123' });
    const second = await authService.register({ id: 'second_user', password: 'password-123' });
    const handler = createSaveSlotsApiHandler({
      authService,
      dataRoot,
      projectRoot: process.cwd(),
    });
    const authenticatedRequest = (
      token: string,
      method: string,
      url: string,
      body?: string,
    ): IncomingMessage => {
      const request = createRequest(method, url, body);
      request.headers.cookie = `${AUTH_SESSION_COOKIE_NAME}=${token}`;
      return request;
    };

    const firstInit = createResponse();
    await handler(
      authenticatedRequest(
        first.token,
        'POST',
        '/api/save-slots/1/initialize',
        JSON.stringify({ saveName: 'Slot 1' }),
      ),
      firstInit.response,
      () => undefined,
    );
    expect(firstInit.statusCode()).toBe(200);

    const firstList = createResponse();
    await handler(
      authenticatedRequest(first.token, 'GET', '/api/save-slots'),
      firstList.response,
      () => undefined,
    );
    const secondList = createResponse();
    await handler(
      authenticatedRequest(second.token, 'GET', '/api/save-slots'),
      secondList.response,
      () => undefined,
    );

    const firstSlots = firstList.json() as { slots: Array<{ slotId: number; isEmpty: boolean }> };
    const secondSlots = secondList.json() as { slots: Array<{ slotId: number; isEmpty: boolean }> };
    expect(firstSlots.slots[0]).toMatchObject({ slotId: 1, isEmpty: false });
    expect(secondSlots.slots[0]).toMatchObject({ slotId: 1, isEmpty: true });
    await expect(
      fs.stat(path.join(dataRoot, 'users', first.accountId, 'save-slots', 'slot-1.json')),
    ).resolves.toBeDefined();
    await expect(
      fs.stat(path.join(dataRoot, 'users', second.accountId, 'save-slots', 'slot-1.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('validates and copies legacy slots without removing their originals', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-slots-'));
    const legacyRoot = path.join(tempRoot, 'legacy');
    const targetRoot = path.join(tempRoot, 'target');
    const state = await createInitialSaveState({ slotId: 1, projectRoot: process.cwd() });
    await fs.mkdir(legacyRoot, { recursive: true });
    await fs.writeFile(
      path.join(legacyRoot, 'slot-1.json'),
      `${JSON.stringify(state, null, 2)}\n`,
      'utf8',
    );

    await migrateLegacySaveSlots({
      legacySaveSlotsRoot: legacyRoot,
      targetSaveSlotsRoot: targetRoot,
    });

    await expect(fs.readFile(path.join(legacyRoot, 'slot-1.json'), 'utf8')).resolves.toContain(
      'leader_minerva',
    );
    const copied = JSON.parse(await fs.readFile(path.join(targetRoot, 'slot-1.json'), 'utf8')) as {
      slotId: number;
      schemaVersion: number;
    };
    expect(copied).toMatchObject({ slotId: 1, schemaVersion: SAVE_SLOT_SCHEMA_VERSION });
  });
});
