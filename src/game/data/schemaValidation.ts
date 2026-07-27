import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';

import cardSchema from '../cards/card.schema.json';
import type { CardDefinition } from '../cards/card.js';
import type {
  BattleCardInstance,
  BattleDeck,
  CardInstance,
  CardPresentation,
  CompletedStageRun,
  EnemyDeckBlueprint,
  OwnedCollection,
  SavedDeck,
  SaveProgress,
  SaveSlotState,
  StageDefinition,
} from './contracts.js';
import gameDataSchema from './game-data.schema.json';

export interface SchemaValidationIssue {
  readonly instancePath: string;
  readonly schemaPath: string;
  readonly keyword: string;
  readonly message: string;
}

export type SchemaParseResult<T> =
  | {
      readonly success: true;
      readonly value: T;
      readonly issues: readonly [];
    }
  | {
      readonly success: false;
      readonly issues: readonly SchemaValidationIssue[];
    };

const GAME_DATA_SCHEMA_ID = 'urn:pathfinder-tcg:schema:game-data';

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
});

ajv.addSchema(cardSchema);
ajv.addSchema(gameDataSchema);

function getValidator<T>(schemaReference: string): ValidateFunction<T> {
  const validator = ajv.getSchema<T>(schemaReference);

  if (validator === undefined) {
    throw new Error(`JSON Schema validator를 찾을 수 없습니다: ${schemaReference}`);
  }

  return validator;
}

function toIssues(
  errors: readonly ErrorObject[] | null | undefined,
): readonly SchemaValidationIssue[] {
  return (errors ?? []).map((error) => ({
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? 'JSON Schema 검증에 실패했습니다.',
  }));
}

function parseWithSchema<T>(validator: ValidateFunction<T>, value: unknown): SchemaParseResult<T> {
  if (validator(value)) {
    return {
      success: true,
      value,
      issues: [],
    };
  }

  return {
    success: false,
    issues: toIssues(validator.errors),
  };
}

const cardDefinitionValidator = getValidator<CardDefinition>(
  'urn:pathfinder-tcg:schema:card-definition',
);
const cardPresentationValidator = getValidator<CardPresentation>(
  `${GAME_DATA_SCHEMA_ID}#/$defs/cardPresentation`,
);
const cardInstanceValidator = getValidator<CardInstance>(
  `${GAME_DATA_SCHEMA_ID}#/$defs/cardInstance`,
);
const ownedCollectionValidator = getValidator<OwnedCollection>(
  `${GAME_DATA_SCHEMA_ID}#/$defs/ownedCollection`,
);
const savedDeckValidator = getValidator<SavedDeck>(`${GAME_DATA_SCHEMA_ID}#/$defs/savedDeck`);
const playableSavedDeckValidator = getValidator<SavedDeck>(
  `${GAME_DATA_SCHEMA_ID}#/$defs/playableSavedDeck`,
);
const enemyDeckBlueprintValidator = getValidator<EnemyDeckBlueprint>(
  `${GAME_DATA_SCHEMA_ID}#/$defs/enemyDeckBlueprint`,
);
const battleCardInstanceValidator = getValidator<BattleCardInstance>(
  `${GAME_DATA_SCHEMA_ID}#/$defs/battleCardInstance`,
);
const battleDeckValidator = getValidator<BattleDeck>(`${GAME_DATA_SCHEMA_ID}#/$defs/battleDeck`);
const stageDefinitionValidator = getValidator<StageDefinition>(
  `${GAME_DATA_SCHEMA_ID}#/$defs/stageDefinition`,
);
const saveProgressValidator = getValidator<SaveProgress>(
  `${GAME_DATA_SCHEMA_ID}#/$defs/saveProgress`,
);
const completedStageRunValidator = getValidator<CompletedStageRun>(
  `${GAME_DATA_SCHEMA_ID}#/$defs/completedStageRun`,
);
const saveSlotStateValidator = getValidator<SaveSlotState>(
  `${GAME_DATA_SCHEMA_ID}#/$defs/saveSlotState`,
);

export function parseCardDefinition(value: unknown): SchemaParseResult<CardDefinition> {
  return parseWithSchema(cardDefinitionValidator, value);
}

export function parseCardPresentation(value: unknown): SchemaParseResult<CardPresentation> {
  return parseWithSchema(cardPresentationValidator, value);
}

export function parseCardInstance(value: unknown): SchemaParseResult<CardInstance> {
  return parseWithSchema(cardInstanceValidator, value);
}

export function parseOwnedCollection(value: unknown): SchemaParseResult<OwnedCollection> {
  return parseWithSchema(ownedCollectionValidator, value);
}

export function parseSavedDeck(value: unknown): SchemaParseResult<SavedDeck> {
  return parseWithSchema(savedDeckValidator, value);
}

export function parsePlayableSavedDeck(value: unknown): SchemaParseResult<SavedDeck> {
  return parseWithSchema(playableSavedDeckValidator, value);
}

export function parseEnemyDeckBlueprint(value: unknown): SchemaParseResult<EnemyDeckBlueprint> {
  return parseWithSchema(enemyDeckBlueprintValidator, value);
}

export function parseBattleCardInstance(value: unknown): SchemaParseResult<BattleCardInstance> {
  return parseWithSchema(battleCardInstanceValidator, value);
}

export function parseBattleDeck(value: unknown): SchemaParseResult<BattleDeck> {
  return parseWithSchema(battleDeckValidator, value);
}

export function parseStageDefinition(value: unknown): SchemaParseResult<StageDefinition> {
  return parseWithSchema(stageDefinitionValidator, value);
}

export function parseSaveProgress(value: unknown): SchemaParseResult<SaveProgress> {
  return parseWithSchema(saveProgressValidator, value);
}

export function parseCompletedStageRun(value: unknown): SchemaParseResult<CompletedStageRun> {
  return parseWithSchema(completedStageRunValidator, value);
}

export function parseSaveSlotState(value: unknown): SchemaParseResult<SaveSlotState> {
  return parseWithSchema(saveSlotStateValidator, value);
}
