import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialSaveState } from '../game/save/create-initial-save';
import {
  findCardDefinition,
  requireCardDefinition,
  type CardDefinition,
} from '../game/save/card-catalog';
import { consumeCollectionMaterialsForDeckGrowth } from '../game/save/card-growth';
import { canonicalizeCardInstance } from '../game/save/card-stats';
import {
  createGameSession,
  createSaveSlotStateFromGameSession,
  type GameSession,
} from '../game/save/session-core';
import { readServerCardDefinitions } from './card-definition-catalog';
import { migrateLegacyCardTraits, needsCardTraitMigration } from '../game/save/migrate-card-traits';
import { normalizeSaveName } from '../game/save/save-name';
import {
  SAVE_SLOT_IDS,
  SAVE_SLOT_SCHEMA_VERSION,
  type CardCollection,
  type CardGrowthRequest,
  type CardInstance,
  type DeckInstance,
  type EquipmentState,
  type SaveSlotId,
  type SaveSlotState,
  type SaveSlotsResponse,
} from '../game/save/types';
import { normalizeLobbyState } from '../game/lobby/lobby-state';
import { normalizeResourceState } from '../game/resources/resource-state';
import { normalizeStageProgressState } from '../game/stage/progress';
import { authenticateHttpRequest } from './auth-api';
import type { AuthService } from './auth-service';

type SaveSlotsApiOptions = {
  authService: AuthService;
  projectRoot?: string;
  dataRoot?: string;
};

type JsonRecord = Record<string, unknown>;

const defaultProjectRoot = fileURLToPath(new URL('../..', import.meta.url));
const defaultDataRoot = path.join(defaultProjectRoot, '.data');
const defaultSaveSlotsRoot = path.join(defaultDataRoot, 'save-slots');
/**
 * 저장본의 카드 수치를 되돌릴 때 기준이 되는 카드 정의다.
 *
 * `cards/deck_*.json` 전체를 쓴다. 좁은 카탈로그만 보면 다른 덱에서 얻은 보상 카드를
 * 모르는 카드로 취급하게 된다. 파일을 한 번만 읽고 재사용한다.
 */
let cachedCardDefinitions: readonly CardDefinition[] | null = null;

function readCanonicalCardDefinitions(): readonly CardDefinition[] {
  cachedCardDefinitions ??= readServerCardDefinitions();
  return cachedCardDefinitions;
}

/**
 * `/api/save-slots/...` 요청을 처리하는 공용 API 핸들러를 만든다.
 * 1~3번 슬롯의 조회, 저장, 초기화, 삭제만 허용한다.
 */
export function createSaveSlotsApiHandler(
  options: SaveSlotsApiOptions,
): (request: IncomingMessage, response: ServerResponse, next: () => void) => Promise<boolean> {
  const projectRoot = options.projectRoot ?? defaultProjectRoot;
  const dataRoot = options.dataRoot ?? defaultDataRoot;

  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/save-slots')) {
      return false;
    }

    try {
      const account = authenticateHttpRequest(options.authService, request, response);
      if (!account) {
        return true;
      }
      const saveSlotsRoot = getAccountSaveSlotsRoot(dataRoot, account.accountId);

      if (request.method === 'GET' && url.pathname === '/api/save-slots') {
        sendJson(response, await listSaveSlotSummaries(saveSlotsRoot));
        return true;
      }

      const slotId = parseSlotId(url.pathname);
      if (!slotId) {
        response.statusCode = 404;
        response.end('Not found');
        return true;
      }

      if (request.method === 'GET') {
        const state = await readSaveSlotState(saveSlotsRoot, slotId);
        if (!state) {
          response.statusCode = 404;
          sendJson(response, { empty: true, slotId });
          return true;
        }

        sendJson(response, state);
        return true;
      }

      if (request.method === 'PUT') {
        // 진행도는 디스크에 적힌 것이 정답이다. 본문에서는 사용자가 정하는 것만 읽는다.
        const previous = await readSaveSlotState(saveSlotsRoot, slotId);
        const body = validateSaveSlotState(
          await readRequestJson(request),
          slotId,
          previous ? readServerOwnedState(previous) : null,
        );
        await writeSaveSlotState(saveSlotsRoot, body);
        sendJson(response, body);
        return true;
      }

      if (request.method === 'DELETE' && url.pathname === `/api/save-slots/${slotId}`) {
        await deleteSaveSlotState(saveSlotsRoot, slotId);
        sendJson(response, { summary: createEmptySummary(slotId) });
        return true;
      }

      if (request.method === 'POST' && url.pathname.endsWith('/growth')) {
        const state = await readSaveSlotState(saveSlotsRoot, slotId);
        if (!state) {
          response.statusCode = 404;
          sendJson(response, { empty: true, slotId });
          return true;
        }

        const grown = applyCardGrowths(state, readGrowthRequests(await readRequestJson(request)));
        await writeSaveSlotState(saveSlotsRoot, grown);
        sendJson(response, grown);
        return true;
      }

      if (request.method === 'POST' && url.pathname.endsWith('/initialize')) {
        const existing = await readSaveSlotState(saveSlotsRoot, slotId);
        if (existing) {
          response.statusCode = 409;
          sendJson(response, {
            error: `Save slot ${slotId} already exists`,
            slotId,
          });
          return true;
        }

        // 저장 이름은 필수값이다. 본문이 없으면 기본 이름으로 만들지 않고 거절한다.
        const saveName = readInitializeSaveName(await readRequestJson(request));
        const initialState = await createInitialSaveState({ slotId, saveName, projectRoot });
        await writeSaveSlotState(saveSlotsRoot, initialState);
        sendJson(response, {
          state: initialState,
          summary: toSaveSlotSummary(initialState),
        });
        return true;
      }

      response.statusCode = 405;
      response.end('Method Not Allowed');
      return true;
    } catch (error) {
      response.statusCode = getErrorStatusCode(error);
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end(error instanceof Error ? error.message : String(error));
      return true;
    }
  };
}

export async function listSaveSlotSummaries(
  saveSlotsRoot: string = defaultSaveSlotsRoot,
): Promise<SaveSlotsResponse> {
  const slots = await Promise.all(
    SAVE_SLOT_IDS.map(async (slotId) => {
      const state = await readSaveSlotState(saveSlotsRoot, slotId);
      return state ? toSaveSlotSummary(state) : createEmptySummary(slotId);
    }),
  );

  return { slots };
}

/**
 * 계정이 소유한 저장 슬롯을 디스크에서 읽는다.
 *
 * 전투를 시작할 때 서버가 덱을 직접 읽는 통로다. 브라우저가 보낸 덱을 그대로 쓰면
 * 아무 수치나 적어 보낼 수 있어, 전투에 들어가는 카드는 저장된 것만 쓴다.
 */
export async function readAccountSaveSlotState(options: {
  dataRoot: string;
  accountId: string;
  slotId: SaveSlotId;
}): Promise<SaveSlotState | null> {
  return readSaveSlotState(
    getAccountSaveSlotsRoot(options.dataRoot, options.accountId),
    options.slotId,
  );
}

/**
 * 계정이 소유한 저장 슬롯을 덮어쓴다.
 *
 * 전투 결과처럼 서버가 스스로 진행도를 적을 때 쓴다. HTTP 본문으로 들어온 것과 같은 검증을 지나므로
 * 서버가 쓰는 값도 카드 수치 canonical 규칙을 벗어나지 않는다.
 */
export async function writeAccountSaveSlotState(options: {
  dataRoot: string;
  accountId: string;
  state: SaveSlotState;
}): Promise<SaveSlotState> {
  const validated = validateSaveSlotState(options.state, options.state.slotId);
  await writeSaveSlotState(getAccountSaveSlotsRoot(options.dataRoot, options.accountId), validated);

  return validated;
}

/** 첫 계정 생성 시 기존 공용 슬롯을 검증한 뒤 개인 저장소에 복사한다. */
export async function migrateLegacySaveSlots(options: {
  legacySaveSlotsRoot: string;
  targetSaveSlotsRoot: string;
}): Promise<void> {
  const states = await Promise.all(
    SAVE_SLOT_IDS.map((slotId) => readSaveSlotState(options.legacySaveSlotsRoot, slotId)),
  );
  for (const state of states) {
    if (state) {
      await writeSaveSlotState(options.targetSaveSlotsRoot, state);
    }
  }
}

async function readSaveSlotState(
  saveSlotsRoot: string,
  slotId: SaveSlotId,
): Promise<SaveSlotState | null> {
  const slotPath = getSaveSlotPath(saveSlotsRoot, slotId);
  try {
    return validateSaveSlotState(JSON.parse(await fs.readFile(slotPath, 'utf8')), slotId);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }

    throw error instanceof Error ? error : new Error(String(error));
  }
}

async function writeSaveSlotState(saveSlotsRoot: string, state: SaveSlotState): Promise<void> {
  await fs.mkdir(saveSlotsRoot, { recursive: true });
  await fs.writeFile(
    getSaveSlotPath(saveSlotsRoot, state.slotId),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  );
}

async function deleteSaveSlotState(saveSlotsRoot: string, slotId: SaveSlotId): Promise<void> {
  await fs.rm(getSaveSlotPath(saveSlotsRoot, slotId), { force: true });
}

function createEmptySummary(slotId: SaveSlotId) {
  return {
    slotId,
    saveName: null,
    updatedAt: null,
    deckCardCount: null,
    leaderName: null,
    isEmpty: true,
  };
}

function toSaveSlotSummary(state: SaveSlotState) {
  const leaderDefinition = findCardDefinition(state.deck.leader.id, readCanonicalCardDefinitions());

  return {
    slotId: state.slotId,
    saveName: state.saveName,
    updatedAt: state.updatedAt,
    deckCardCount: state.deck.cards.length,
    leaderName: leaderDefinition?.name ?? null,
    isEmpty: false,
  };
}

function getSaveSlotPath(saveSlotsRoot: string, slotId: SaveSlotId): string {
  return path.join(saveSlotsRoot, `slot-${slotId}.json`);
}

function getAccountSaveSlotsRoot(dataRoot: string, accountId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
    throw new Error('Invalid authenticated account id');
  }
  return path.join(dataRoot, 'users', accountId, 'save-slots');
}

/**
 * 재료 성장을 서버에서 실행한다.
 *
 * EXP 계산과 재료 소모를 브라우저가 하면 결과를 아무 값이나 적어 보낼 수 있다.
 * 브라우저는 '어느 카드에 어떤 재료를'만 보내고, 서버가 자기 저장본 위에서 같은 규칙을 다시 돌린다.
 */
function applyCardGrowths(
  state: SaveSlotState,
  growths: readonly CardGrowthRequest[],
): SaveSlotState {
  let session: GameSession = createGameSession(state, readCanonicalCardDefinitions());
  for (const growth of growths) {
    session = consumeCollectionMaterialsForDeckGrowth(session, {
      targetDeckCardInstanceId: growth.targetDeckCardInstanceId,
      materialCollectionCardInstanceIds: growth.materialCollectionCardInstanceIds,
    }).session;
  }

  // 서버가 만든 상태라 진행도를 지킬 이전 값을 넘기지 않는다. 이 결과가 곧 새 진행도다.
  return validateSaveSlotState(createSaveSlotStateFromGameSession(session), state.slotId);
}

function readGrowthRequests(value: unknown): CardGrowthRequest[] {
  if (!isRecord(value) || !Array.isArray(value.growths) || value.growths.length === 0) {
    throw new Error('growth body must contain a non-empty growths array');
  }

  return value.growths.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.targetDeckCardInstanceId !== 'string' ||
      !Array.isArray(entry.materialCollectionCardInstanceIds) ||
      !entry.materialCollectionCardInstanceIds.every((id) => typeof id === 'string')
    ) {
      throw new Error('growth entry must name a target card and material cards');
    }

    return {
      targetDeckCardInstanceId: entry.targetDeckCardInstanceId,
      materialCollectionCardInstanceIds: [...entry.materialCollectionCardInstanceIds],
    };
  });
}

function parseSlotId(pathname: string): SaveSlotId | null {
  const match = pathname.match(/^\/api\/save-slots\/([123])(?:\/initialize|\/growth)?$/);
  if (!match) {
    return null;
  }

  return Number(match[1]) as SaveSlotId;
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

/**
 * 저장된 상태 중 브라우저가 정하지 못하는 값이다.
 *
 * 이 값들이 있으면 본문에 뭐라고 적혀 있든 무시하고 이쪽을 쓴다.
 * 브라우저가 보낸 저장 요청에만 넘긴다. 디스크를 읽거나 서버가 스스로 쓸 때는 그 값이 곧 정답이다.
 */
type ServerOwnedSaveSlotState = {
  createdAt: string;
  /** instanceId별 누적 EXP다. 레벨과 수치가 여기서 나오므로 브라우저가 정할 수 없다. */
  expByInstanceId: ReadonlyMap<string, number>;
  /** 지금 갖고 있는 카드다. `instanceId → 카드 정의 id`. 브라우저는 이 목록을 바꿀 수 없다. */
  cardIdByInstanceId: ReadonlyMap<string, string>;
  resources: SaveSlotState['resources'];
  clearedStageIds: readonly string[];
};

function listAllCards(state: SaveSlotState): CardInstance[] {
  return [state.deck.leader, ...state.deck.cards, ...state.collection.cards];
}

function readServerOwnedState(state: SaveSlotState): ServerOwnedSaveSlotState {
  const expByInstanceId = new Map<string, number>();
  const cardIdByInstanceId = new Map<string, string>();
  for (const card of listAllCards(state)) {
    expByInstanceId.set(card.instanceId, card.exp ?? 0);
    cardIdByInstanceId.set(card.instanceId, card.id);
  }

  return {
    createdAt: state.createdAt,
    expByInstanceId,
    cardIdByInstanceId,
    resources: structuredClone(state.resources),
    clearedStageIds: [...state.stageProgress.clearedStageIds],
  };
}

/**
 * 브라우저가 보낸 저장본이 갖고 있는 카드를 바꾸지 않았는지 확인한다.
 *
 * 브라우저가 할 수 있는 일은 카드를 덱과 보유함 사이로 옮기는 것뿐이다. 카드가 생기고 없어지는 것은
 * 전투 보상과 재료 성장뿐이고 둘 다 서버가 쓴다. 그래서 저장 요청 앞뒤로 카드 목록은 같아야 한다.
 *
 * 여기서 막지 않으면 보유함에 강한 장비를 적어 넣을 수 있다. 장비는 전투 유닛에 붙어 전투에 들어간다.
 */
function assertCardsUnchanged(
  cards: readonly CardInstance[],
  owned: ServerOwnedSaveSlotState,
): void {
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.instanceId)) {
      throw new Error(`Duplicate card instanceId: ${card.instanceId}`);
    }
    seen.add(card.instanceId);

    const ownedCardId = owned.cardIdByInstanceId.get(card.instanceId);
    if (ownedCardId === undefined) {
      throw new Error(`Card was not obtained: ${card.instanceId}`);
    }
    if (ownedCardId !== card.id) {
      throw new Error(`Card id changed for ${card.instanceId}: expected ${ownedCardId}`);
    }
  }

  if (seen.size !== owned.cardIdByInstanceId.size) {
    // 카드를 버리는 방법은 재료 성장뿐이고 그건 서버가 한다. 조용히 사라지면 되돌릴 방법이 없다.
    throw new Error(
      `Card is missing from the save: expected ${owned.cardIdByInstanceId.size} cards`,
    );
  }
}

/** 리더 자리에는 LEADER 카드만, 덱에는 UNIT 카드만 둘 수 있다. 덱 편성 화면이 지키는 규칙과 같다. */
function assertDeckCardTypes(deck: DeckInstance): void {
  if (deck.leader.type !== 'LEADER') {
    throw new Error(`Deck leader must be a LEADER card: ${deck.leader.instanceId}`);
  }

  for (const card of deck.cards) {
    if (card.type !== 'UNIT') {
      throw new Error(`Deck card must be a UNIT card: ${card.instanceId}`);
    }
  }
}

function validateSaveSlotState(
  value: unknown,
  slotId: SaveSlotId,
  serverOwned: ServerOwnedSaveSlotState | null = null,
): SaveSlotState {
  if (!isRecord(value)) {
    throw new Error('Save slot body must be an object');
  }

  if (
    value.schemaVersion !== SAVE_SLOT_SCHEMA_VERSION &&
    value.schemaVersion !== 1 &&
    value.schemaVersion !== 2 &&
    value.schemaVersion !== 3 &&
    value.schemaVersion !== 4 &&
    value.schemaVersion !== 5 &&
    value.schemaVersion !== 6 &&
    value.schemaVersion !== 7 &&
    value.schemaVersion !== 8 &&
    value.schemaVersion !== 9 &&
    value.schemaVersion !== 10
  ) {
    throw new Error(`Invalid schemaVersion: ${String(value.schemaVersion)}`);
  }
  const isLegacySchema = value.schemaVersion === 1;
  const isPreEquipmentSchema = value.schemaVersion === 1 || value.schemaVersion === 2;

  if (value.slotId !== slotId) {
    throw new Error(`slotId mismatch: expected ${slotId}, got ${String(value.slotId)}`);
  }

  if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') {
    throw new Error('createdAt and updatedAt must be strings');
  }

  const saveName = normalizeSaveName(value.saveName);

  if (!isDeckInstance(value.deck)) {
    throw new Error('deck must be a deck instance');
  }
  const deck = normalizeDeckInstance(value.deck, serverOwned);
  const collection = normalizeCardCollection(value.collection, isLegacySchema, serverOwned);
  const equipment = normalizeEquipmentState(
    value.equipment,
    isPreEquipmentSchema,
    deck,
    collection,
  );
  assertDeckCardTypes(deck);
  if (serverOwned) {
    assertCardsUnchanged([deck.leader, ...deck.cards, ...collection.cards], serverOwned);
  }

  const stageProgress = normalizeStageProgressState(value.stageProgress);
  const lobby = normalizeLobbyState(value.lobby);
  const resources = normalizeResourceState(value.resources);

  return {
    schemaVersion: SAVE_SLOT_SCHEMA_VERSION,
    slotId,
    createdAt: serverOwned?.createdAt ?? value.createdAt,
    updatedAt: value.updatedAt,
    saveName,
    deck,
    collection,
    equipment,
    stageProgress: {
      ...stageProgress,
      // 스테이지를 깼는지는 서버가 만든 전투 결과에서만 늘어난다.
      clearedStageIds: serverOwned
        ? [...serverOwned.clearedStageIds]
        : stageProgress.clearedStageIds,
    },
    lobby,
    // 재화도 서버가 늘린다. 지금은 늘리는 경로가 없어 이전 값이 그대로 유지된다.
    resources: serverOwned ? structuredClone(serverOwned.resources) : resources,
  };
}

function isDeckInstance(value: unknown): value is DeckInstance {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    isCardInstance(value.leader, 'LEADER') &&
    Array.isArray(value.cards) &&
    value.cards.every((entry) => isCardInstance(entry, 'DECK'))
  );
}

function normalizeDeckInstance(
  deck: DeckInstance,
  serverOwned: ServerOwnedSaveSlotState | null,
): DeckInstance {
  return {
    id: deck.id,
    leader: normalizeCardInstance(deck.leader, 'LEADER', serverOwned),
    cards: deck.cards.map((card) => normalizeCardInstance(card, 'DECK', serverOwned)),
  };
}

function normalizeCardCollection(
  value: unknown,
  allowMissing: boolean,
  serverOwned: ServerOwnedSaveSlotState | null,
): CardCollection {
  if (value === undefined && allowMissing) {
    return { cards: [] };
  }

  if (!isCardCollection(value)) {
    throw new Error('collection must be a card collection');
  }

  return {
    cards: value.cards.map((card) => normalizeCardInstance(card, 'COLLECTION', serverOwned)),
  };
}

function isCardCollection(value: unknown): value is CardCollection {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.cards) && value.cards.every((entry) => isCardInstance(entry, 'COLLECTION'))
  );
}

function normalizeEquipmentState(
  value: unknown,
  allowMissing: boolean,
  deck: DeckInstance,
  collection: CardCollection,
): EquipmentState {
  if (value === undefined && allowMissing) {
    return { equipped: [] };
  }

  if (!isEquipmentState(value)) {
    throw new Error('equipment must be an equipment state');
  }

  const equipment = {
    equipped: value.equipped.map((attachment) => ({
      targetCardInstanceId: attachment.targetCardInstanceId,
      equipmentCardInstanceId: attachment.equipmentCardInstanceId,
    })),
  };
  validateEquipmentState(equipment, deck, collection);

  return equipment;
}

function isEquipmentState(value: unknown): value is EquipmentState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.equipped) &&
    value.equipped.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.targetCardInstanceId === 'string' &&
        typeof entry.equipmentCardInstanceId === 'string',
    )
  );
}

function validateEquipmentState(
  equipment: EquipmentState,
  deck: DeckInstance,
  collection: CardCollection,
): void {
  const usedEquipmentIds = new Set<string>();
  const attachmentsByTarget = new Map<string, CardInstance[]>();
  for (const attachment of equipment.equipped) {
    if (usedEquipmentIds.has(attachment.equipmentCardInstanceId)) {
      throw new Error(`Equipment already equipped: ${attachment.equipmentCardInstanceId}`);
    }
    usedEquipmentIds.add(attachment.equipmentCardInstanceId);

    const target = deck.cards.find(
      (card) => card.instanceId === attachment.targetCardInstanceId && card.type === 'UNIT',
    );
    if (!target) {
      throw new Error(`Equipment target must be a deck UNIT: ${attachment.targetCardInstanceId}`);
    }

    const equipmentCard = collection.cards.find(
      (card) => card.instanceId === attachment.equipmentCardInstanceId && card.type === 'EQUIPMENT',
    );
    if (!equipmentCard) {
      throw new Error(
        `Equipment card must be a collection EQUIPMENT: ${attachment.equipmentCardInstanceId}`,
      );
    }

    const group = attachmentsByTarget.get(target.instanceId);
    if (group) {
      group.push(equipmentCard);
    } else {
      attachmentsByTarget.set(target.instanceId, [equipmentCard]);
    }
  }

  attachmentsByTarget.forEach((equipmentCards, targetCardInstanceId) => {
    const target = deck.cards.find((card) => card.instanceId === targetCardInstanceId)!;
    validateEquipmentCardsForTarget(target, equipmentCards);
  });
}

function validateEquipmentCardsForTarget(
  target: CardInstance,
  equipmentCards: CardInstance[],
): void {
  const slotCapacity = Math.max(0, target.slot ?? 0);
  const usedSlot = equipmentCards.reduce(
    (total, equipment) => total + Math.max(0, equipment.slot ?? 0),
    0,
  );
  if (usedSlot > slotCapacity) {
    throw new Error(
      `Equipment slot limit exceeded for ${target.instanceId}: ${usedSlot}/${slotCapacity}`,
    );
  }

  const abilityIds = new Set(target.abilities.map((ability) => ability.id));
  for (const equipment of equipmentCards) {
    for (const ability of equipment.abilities) {
      if (abilityIds.has(ability.id)) {
        throw new Error(`Duplicate equipment ability: ${ability.id}`);
      }
      abilityIds.add(ability.id);
    }
  }
}

/**
 * 저장된 카드 한 장을 카탈로그 정의 기준으로 되돌린다.
 *
 * 저장 API는 브라우저가 보낸 본문을 그대로 받는다. 그래서 카드 수치를 여기서 다시 계산하지 않으면
 * 공격력 9999짜리 카드를 저장해 두고 전투를 열 수 있다. 전투 엔진이 서버에 있어도 입력이 오염된다.
 * 읽을 때도 같은 함수를 지나므로 이미 조작된 저장본도 다음에 읽힐 때 제자리로 돌아온다.
 */
function normalizeCardInstance(
  instance: CardInstance,
  zone: CardInstance['zone'],
  serverOwned: ServerOwnedSaveSlotState | null,
): CardInstance {
  if (isSchemaCardInstance(instance, zone)) {
    return canonicalizeSchemaCardInstance(migrateCardInstanceTraits(instance), zone, serverOwned);
  }

  const legacy = instance as unknown as JsonRecord;
  const definition = requireCardDefinition(
    String(legacy.definitionId),
    readCanonicalCardDefinitions(),
  );
  const instanceId = String(legacy.instanceId);
  return canonicalizeCardInstance(
    {
      ...structuredClone(definition),
      exp: readOwnedExp(
        instanceId,
        readIntegerOrDefault(legacy.exp, definition.exp ?? 0),
        serverOwned,
      ),
      instanceId,
      owner: legacy.owner as CardInstance['owner'],
      zone,
    },
    definition,
  );
}

function canonicalizeSchemaCardInstance(
  instance: CardInstance,
  zone: CardInstance['zone'],
  serverOwned: ServerOwnedSaveSlotState | null,
): CardInstance {
  const definition = findCardDefinition(instance.id, readCanonicalCardDefinitions());
  if (!definition) {
    // 카탈로그에 없는 카드는 수치를 되돌릴 기준이 없다. 어느 덱에도 없는 id라 정상 경로로는 생기지 않는다.
    throw new Error(`Unknown card id in ${zone} zone: ${instance.id}`);
  }

  return canonicalizeCardInstance(
    { ...instance, exp: readOwnedExp(instance.instanceId, instance.exp ?? 0, serverOwned) },
    definition,
  );
}

/**
 * 카드 한 장의 누적 EXP를 정한다.
 *
 * 브라우저가 보낸 저장 요청이면 디스크에 적혀 있던 값을 쓴다. 카드가 덱과 보유함을 오가도
 * `instanceId`가 그대로라 EXP가 카드를 따라간다. 서버가 모르는 카드는 처음 보는 것이므로 0에서 시작한다.
 */
function readOwnedExp(
  instanceId: string,
  requestedExp: number,
  serverOwned: ServerOwnedSaveSlotState | null,
): number {
  if (!serverOwned) {
    return requestedExp;
  }

  return serverOwned.expByInstanceId.get(instanceId) ?? 0;
}

/** schemaVersion 3 이하로 저장된 카드의 rarity 필드와 구 특성 표현을 canonical ID로 옮긴다. */
function migrateCardInstanceTraits(instance: CardInstance): CardInstance {
  const record = instance as unknown as JsonRecord;
  if (!needsCardTraitMigration(record)) {
    return instance;
  }

  const { rarity, traits, ...rest } = record;
  return { ...rest, traits: migrateLegacyCardTraits(traits, rarity) } as unknown as CardInstance;
}

function isCardInstance(value: unknown, zone: CardInstance['zone']): value is CardInstance {
  return isSchemaCardInstance(value, zone) || isLegacyCardInstance(value, zone);
}

function isSchemaCardInstance(value: unknown, zone: CardInstance['zone']): value is CardInstance {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.instanceId === 'string' &&
    value.owner === 'PLAYER' &&
    value.zone === zone &&
    isCardDefinition(value) &&
    Number.isInteger(value.level ?? 1) &&
    Number.isInteger(value.exp ?? 0) &&
    Number.isInteger(value.hp) &&
    Number.isInteger(value.attack)
  );
}

function isLegacyCardInstance(value: unknown, zone: CardInstance['zone']): value is CardInstance {
  if (!isRecord(value)) {
    return false;
  }

  return (
    zone !== 'COLLECTION' &&
    typeof value.instanceId === 'string' &&
    typeof value.definitionId === 'string' &&
    value.owner === 'PLAYER' &&
    value.zone === zone &&
    Number.isInteger(value.level) &&
    Number.isInteger(value.exp) &&
    Number.isInteger(value.currentHp) &&
    Number.isInteger(value.currentAttack)
  );
}

function isCardDefinition(value: JsonRecord): value is CardDefinition {
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.type === 'string' &&
    // 구 저장본은 `{key, text}` 배열, 현행은 canonical ID 배열이다. 둘 다 받아 마이그레이션한다.
    Array.isArray(value.traits) &&
    Array.isArray(value.abilities) &&
    typeof value.description === 'string' &&
    typeof value.note === 'string'
  );
}

function readIntegerOrDefault(value: unknown, fallback: number): number {
  return Number.isInteger(value) ? (value as number) : fallback;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function readInitializeSaveName(value: unknown): string {
  if (!isRecord(value)) {
    throw new Error('Save slot initialize body must be an object');
  }

  return normalizeSaveName(value.saveName);
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function getErrorStatusCode(error: unknown): number {
  if (error instanceof SyntaxError) {
    return 400;
  }

  if (error instanceof Error) {
    if (
      error.message.startsWith('Save slot body must be an object') ||
      error.message.startsWith('Invalid schemaVersion:') ||
      error.message.startsWith('slotId mismatch:') ||
      error.message.startsWith('createdAt and updatedAt must be strings') ||
      error.message.startsWith('saveName must') ||
      error.message.startsWith('Save slot initialize body must be an object') ||
      error.message.startsWith('deck must be a deck instance') ||
      error.message.startsWith('collection must be a card collection') ||
      error.message.startsWith('equipment must be an equipment state') ||
      error.message.startsWith('Equipment ') ||
      error.message.startsWith('Duplicate equipment ability:') ||
      error.message.startsWith('Unknown card id in') ||
      error.message.startsWith('Duplicate card instanceId:') ||
      error.message.startsWith('Card was not obtained:') ||
      error.message.startsWith('Card id changed for') ||
      error.message.startsWith('Card is missing from the save:') ||
      error.message.startsWith('Deck leader must be a') ||
      error.message.startsWith('Deck card must be a') ||
      error.message.startsWith('growth body must') ||
      error.message.startsWith('growth entry must') ||
      error.message.startsWith('Growth target') ||
      error.message.startsWith('Material card') ||
      error.message.startsWith('Collection material card not found:') ||
      error.message.startsWith('Deck growth target not found:') ||
      error.message.startsWith('At least one material card') ||
      error.message.startsWith('Material cards must be unique') ||
      error.message.startsWith('stageProgress') ||
      error.message.startsWith('lobby') ||
      error.message.startsWith('resources') ||
      error.message.startsWith('Expected exactly one LEADER card') ||
      error.message.startsWith('Expected at least one UNIT card') ||
      error.message.startsWith('Invalid ')
    ) {
      return 400;
    }
  }

  return 500;
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.statusCode = response.statusCode || 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}
