import type { SavedDeck, SaveSlotState } from '../game/data/index.js';
import {
  parseSaveSlotState,
  validateSavedDeckForStorage,
  validateSaveSlotState,
  type DataValidationIssue,
  type SchemaValidationIssue,
} from '../game/data/index.js';
import type { Clock } from './auth.js';
import type { GameDatabase, PersistedSaveSlot } from './database.js';
import type { SaveSlotId, ServerGameContent } from './gameContent.js';

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
  readonly selectedDeckId: string | null;
  readonly deckCount: number;
  readonly ownedCardCount: number;
}

export type SaveSlotSummary = EmptySaveSlotSummary | OccupiedSaveSlotSummary;

type SaveValidationIssue = DataValidationIssue | SchemaValidationIssue;

export class SaveSlotNotFoundError extends Error {
  constructor(slotId: SaveSlotId) {
    super(`생성되지 않은 세이브 슬롯입니다: ${slotId}`);
    this.name = 'SaveSlotNotFoundError';
  }
}

export class DeckNotFoundError extends Error {
  constructor(deckId: string) {
    super(`세이브 슬롯에 없는 덱입니다: ${deckId}`);
    this.name = 'DeckNotFoundError';
  }
}

export class InvalidDeckError extends Error {
  readonly issues: readonly SaveValidationIssue[];

  constructor(message: string, issues: readonly SaveValidationIssue[]) {
    super(message);
    this.name = 'InvalidDeckError';
    this.issues = issues;
  }
}

export class InvalidPersistedSaveSlotError extends Error {
  readonly issues: readonly SaveValidationIssue[];

  constructor(message: string, issues: readonly SaveValidationIssue[] = []) {
    super(message);
    this.name = 'InvalidPersistedSaveSlotError';
    this.issues = issues;
  }
}

function validateState(
  value: unknown,
  content: ServerGameContent,
  expectedSlotId: SaveSlotId,
): SaveSlotState {
  const schemaResult = parseSaveSlotState(value);

  if (!schemaResult.success) {
    throw new InvalidPersistedSaveSlotError(
      '세이브 슬롯 JSON이 현재 Schema를 만족하지 않습니다.',
      schemaResult.issues,
    );
  }

  if (schemaResult.value.slotId !== expectedSlotId) {
    throw new InvalidPersistedSaveSlotError(
      `세이브 슬롯 ID가 DB 키와 일치하지 않습니다: ${schemaResult.value.slotId} != ${expectedSlotId}`,
    );
  }

  const semanticResult = validateSaveSlotState(
    schemaResult.value,
    content.cardDefinitions,
    content.stages,
  );

  if (!semanticResult.valid) {
    throw new InvalidPersistedSaveSlotError(
      '세이브 슬롯이 현재 게임 데이터 계약을 만족하지 않습니다.',
      semanticResult.issues,
    );
  }

  return schemaResult.value;
}

function parsePersistedSlot(
  persisted: PersistedSaveSlot,
  content: ServerGameContent,
): SaveSlotState {
  let value: unknown;

  try {
    value = JSON.parse(persisted.stateJson) as unknown;
  } catch {
    throw new InvalidPersistedSaveSlotError('DB의 세이브 슬롯 JSON을 파싱할 수 없습니다.');
  }

  const state = validateState(value, content, persisted.slotId);

  if (state.schemaVersion !== persisted.schemaVersion) {
    throw new InvalidPersistedSaveSlotError(
      `세이브 Schema 버전이 DB 열과 일치하지 않습니다: ${state.schemaVersion} != ${persisted.schemaVersion}`,
    );
  }

  if (state.lastModifiedAt !== persisted.updatedAt) {
    throw new InvalidPersistedSaveSlotError(
      '세이브의 lastModifiedAt이 DB updated_at과 일치하지 않습니다.',
    );
  }

  return state;
}

function toPersistedSlot(state: SaveSlotState): PersistedSaveSlot {
  return {
    slotId: state.slotId,
    schemaVersion: state.schemaVersion,
    stateJson: JSON.stringify(state),
    updatedAt: state.lastModifiedAt,
  };
}

export class SaveSlotService {
  private readonly database: GameDatabase;
  private readonly content: ServerGameContent;
  private readonly now: Clock;

  constructor(database: GameDatabase, content: ServerGameContent, now: Clock = () => new Date()) {
    this.database = database;
    this.content = content;
    this.now = now;
  }

  list(userId: string): readonly SaveSlotSummary[] {
    const occupiedSlots = new Map(
      this.database
        .listSaveSlots(userId)
        .map((persisted) => [persisted.slotId, this.parseAndMigrate(userId, persisted)]),
    );

    return ([1, 2, 3] as const).map((slotId): SaveSlotSummary => {
      const state = occupiedSlots.get(slotId);

      if (state === undefined) {
        return {
          slotId,
          status: 'EMPTY',
          lastModifiedAt: null,
          selectedDeckId: null,
          deckCount: 0,
          ownedCardCount: 0,
        };
      }

      return {
        slotId,
        status: 'OCCUPIED',
        lastModifiedAt: state.lastModifiedAt,
        selectedDeckId: state.selectedDeckId,
        deckCount: state.decks.length,
        ownedCardCount: state.collection.cardInstances.length,
      };
    });
  }

  create(userId: string, slotId: SaveSlotId): SaveSlotState {
    const state = validateState(
      this.content.createInitialSaveSlotState(slotId, this.now()),
      this.content,
      slotId,
    );

    this.database.createSaveSlot(userId, toPersistedSlot(state));
    return state;
  }

  get(userId: string, slotId: SaveSlotId): SaveSlotState {
    const persisted = this.database.findSaveSlot(userId, slotId);

    if (persisted === null) {
      throw new SaveSlotNotFoundError(slotId);
    }

    return this.parseAndMigrate(userId, persisted);
  }

  updateDeck(userId: string, slotId: SaveSlotId, deckId: string, deck: SavedDeck): SaveSlotState {
    if (deck.id !== deckId) {
      throw new InvalidDeckError('URL의 deckId와 요청 본문의 덱 ID가 일치해야 합니다.', []);
    }

    const currentState = this.get(userId, slotId);
    const deckIndex = currentState.decks.findIndex((candidate) => candidate.id === deckId);

    if (deckIndex === -1) {
      throw new DeckNotFoundError(deckId);
    }

    const deckValidation = validateSavedDeckForStorage(deck, {
      collection: currentState.collection,
      cardDefinitions: this.content.cardDefinitions,
    });

    if (!deckValidation.valid) {
      throw new InvalidDeckError(
        '저장 덱이 카드·소유권 계약을 만족하지 않습니다.',
        deckValidation.issues,
      );
    }

    const decks = [...currentState.decks];
    decks[deckIndex] = deck;
    const updatedState: SaveSlotState = {
      ...currentState,
      decks,
      lastModifiedAt: this.now().toISOString(),
    };
    const validatedState = validateState(updatedState, this.content, slotId);

    if (!this.database.updateSaveSlot(userId, toPersistedSlot(validatedState))) {
      throw new SaveSlotNotFoundError(slotId);
    }

    return validatedState;
  }

  delete(userId: string, slotId: SaveSlotId): void {
    if (!this.database.deleteSaveSlot(userId, slotId)) {
      throw new SaveSlotNotFoundError(slotId);
    }
  }

  replaceState(userId: string, state: SaveSlotState): SaveSlotState {
    const validatedState = validateState(state, this.content, state.slotId);

    if (!this.database.updateSaveSlot(userId, toPersistedSlot(validatedState))) {
      throw new SaveSlotNotFoundError(state.slotId);
    }

    return validatedState;
  }

  private parseAndMigrate(userId: string, persisted: PersistedSaveSlot): SaveSlotState {
    const state = parsePersistedSlot(persisted, this.content);
    const migrated = this.content.migrateSaveSlotState(state, this.now());

    if (migrated === state) {
      return state;
    }

    const validated = validateState(migrated, this.content, persisted.slotId);

    if (!this.database.updateSaveSlot(userId, toPersistedSlot(validated))) {
      throw new SaveSlotNotFoundError(persisted.slotId);
    }

    return validated;
  }
}
