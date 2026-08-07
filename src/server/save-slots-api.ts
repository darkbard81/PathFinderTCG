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
import {
  SAVE_SLOT_IDS,
  SAVE_SLOT_SCHEMA_VERSION,
  type CardCollection,
  type CardInstance,
  type DeckInstance,
  type EquipmentState,
  type SaveSlotId,
  type SaveSlotState,
  type SaveSlotsResponse,
} from '../game/save/types';
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
        const body = validateSaveSlotState(await readRequestJson(request), slotId);
        await writeSaveSlotState(saveSlotsRoot, body);
        sendJson(response, body);
        return true;
      }

      if (request.method === 'DELETE' && url.pathname === `/api/save-slots/${slotId}`) {
        await deleteSaveSlotState(saveSlotsRoot, slotId);
        sendJson(response, { summary: createEmptySummary(slotId) });
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

        const initialState = await createInitialSaveState({ slotId, projectRoot });
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
  const leaderDefinition = findCardDefinition(state.deck.leader.id);

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

function parseSlotId(pathname: string): SaveSlotId | null {
  const match = pathname.match(/^\/api\/save-slots\/([123])(?:\/initialize)?$/);
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

function validateSaveSlotState(value: unknown, slotId: SaveSlotId): SaveSlotState {
  if (!isRecord(value)) {
    throw new Error('Save slot body must be an object');
  }

  if (
    value.schemaVersion !== SAVE_SLOT_SCHEMA_VERSION &&
    value.schemaVersion !== 1 &&
    value.schemaVersion !== 2
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

  if (typeof value.saveName !== 'string' || value.saveName.trim().length === 0) {
    throw new Error('saveName must be a non-empty string');
  }

  if (!isDeckInstance(value.deck)) {
    throw new Error('deck must be a deck instance');
  }
  const deck = normalizeDeckInstance(value.deck);
  const collection = normalizeCardCollection(value.collection, isLegacySchema);
  const equipment = normalizeEquipmentState(
    value.equipment,
    isPreEquipmentSchema,
    deck,
    collection,
  );
  const stageProgress = normalizeStageProgressState(value.stageProgress);

  return {
    schemaVersion: SAVE_SLOT_SCHEMA_VERSION,
    slotId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    saveName: value.saveName,
    deck,
    collection,
    equipment,
    stageProgress,
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

function normalizeDeckInstance(deck: DeckInstance): DeckInstance {
  return {
    id: deck.id,
    leader: normalizeCardInstance(deck.leader, 'LEADER'),
    cards: deck.cards.map((card) => normalizeCardInstance(card, 'DECK')),
  };
}

function normalizeCardCollection(value: unknown, allowMissing: boolean): CardCollection {
  if (value === undefined && allowMissing) {
    return { cards: [] };
  }

  if (!isCardCollection(value)) {
    throw new Error('collection must be a card collection');
  }

  return {
    cards: value.cards.map((card) => normalizeCardInstance(card, 'COLLECTION')),
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

function normalizeCardInstance(instance: CardInstance, zone: CardInstance['zone']): CardInstance {
  if (isSchemaCardInstance(instance, zone)) {
    return instance;
  }

  const legacy = instance as unknown as JsonRecord;
  const definition = requireCardDefinition(String(legacy.definitionId));
  return {
    ...structuredClone(definition),
    level: readIntegerOrDefault(legacy.level, definition.level ?? 1),
    exp: readIntegerOrDefault(legacy.exp, definition.exp ?? 0),
    hp: readIntegerOrDefault(legacy.currentHp, definition.hp ?? 0),
    attack: readIntegerOrDefault(legacy.currentAttack, definition.attack ?? 0),
    instanceId: String(legacy.instanceId),
    owner: legacy.owner as CardInstance['owner'],
    zone,
  };
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
    typeof value.rarity === 'string' &&
    typeof value.type === 'string' &&
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
      error.message.startsWith('saveName must be a non-empty string') ||
      error.message.startsWith('deck must be a deck instance') ||
      error.message.startsWith('collection must be a card collection') ||
      error.message.startsWith('equipment must be an equipment state') ||
      error.message.startsWith('Equipment ') ||
      error.message.startsWith('Duplicate equipment ability:') ||
      error.message.startsWith('stageProgress') ||
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
