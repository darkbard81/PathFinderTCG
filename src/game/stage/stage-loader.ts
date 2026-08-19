import type {
  StageAdvAssetKey,
  StageAdvBeatDefinition,
  StageAdvDefinition,
  StageAdvInitialBeatDefinition,
  StageAdvStandingDefinition,
  StageDefeatCondition,
  StageDefinition,
  StageEnemyDeckPath,
  StageRewardDefinition,
  StageUnlockCondition,
  StageVictoryCondition,
} from './types';

type JsonRecord = Record<string, unknown>;

const ENEMY_DECK_PATH_PATTERN = /^cards\/deck_[A-Za-z0-9_-]+\.json$/;
const ADV_ASSET_KEY_PATTERN = /^adv\.[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Stage JSON 모듈 목록을 런타임 Stage 정의 배열로 변환한다.
 * 파일별 구조 검증과 전체 목록의 중복 검사를 함께 수행해 잘못된 Stage 데이터를 즉시 실패시킨다.
 */
export function loadStageDefinitions(stageFiles: Record<string, unknown>): StageDefinition[] {
  const stageDefinitions = Object.entries(stageFiles).map(([stagePath, stageData]) =>
    normalizeStageDefinition(stageData, stagePath),
  );

  assertUniqueStageValues(stageDefinitions, 'id');
  assertUniqueStageValues(stageDefinitions, 'order');

  return [...stageDefinitions].sort((left, right) => left.order - right.order);
}

function normalizeStageDefinition(value: unknown, stagePath: string): StageDefinition {
  const record = requireRecord(value, stagePath);
  const enemyDeckPath = readEnemyDeckPath(record, stagePath);

  return {
    id: readString(record, 'id', stagePath),
    order: readInteger(record, 'order', stagePath),
    name: readString(record, 'name', stagePath),
    description: readString(record, 'description', stagePath),
    enemyDeckId: readString(record, 'enemyDeckId', stagePath),
    enemyDeckPath,
    victoryCondition: readVictoryCondition(record.victoryCondition, stagePath),
    defeatConditions: readDefeatConditions(record.defeatConditions, stagePath),
    rewards: readRewards(record.rewards, stagePath),
    unlock: readUnlockCondition(record.unlock, stagePath),
    startAdv: readNullableAdvDefinition(record, 'startAdv', stagePath),
    endAdv: readNullableAdvDefinition(record, 'endAdv', stagePath),
    battleBgmId: readNullableString(record, 'battleBgmId', stagePath),
  };
}

function readNullableAdvDefinition(
  record: JsonRecord,
  key: 'startAdv' | 'endAdv',
  stagePath: string,
): StageAdvDefinition | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }

  const advPath = `${stagePath}.${key}`;
  const adv = requireRecord(value, advPath);

  return {
    beats: readAdvBeats(adv.beats, advPath),
  };
}

function readAdvStandings(value: unknown, advPath: string): StageAdvStandingDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error(`${advPath}.standings must be an array`);
  }

  const standings = value.map((standing, index) => {
    const standingPath = `${advPath}.standings[${index}]`;
    const record = requireRecord(standing, standingPath);
    const position = readAdvStandingPosition(record, standingPath);

    return {
      assetKey: readAdvAssetKey(record.assetKey, `${standingPath}.assetKey`),
      position,
    };
  });

  const seenPositions = new Set<StageAdvStandingDefinition['position']>();
  for (const standing of standings) {
    if (seenPositions.has(standing.position)) {
      throw new Error(`${advPath}.standings has duplicate position: ${standing.position}`);
    }
    seenPositions.add(standing.position);
  }

  return standings;
}

function readAdvStandingPosition(
  record: JsonRecord,
  path: string,
): StageAdvStandingDefinition['position'] {
  const position = readString(record, 'position', path);
  if (position !== 'left' && position !== 'center' && position !== 'right') {
    throw new Error(`${path}.position is not supported: ${position}`);
  }

  return position;
}

function readAdvBeats(value: unknown, advPath: string): StageAdvDefinition['beats'] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${advPath}.beats must contain at least one beat`);
  }

  const beats = value.map((beat, index) => readAdvBeat(beat, index, advPath));
  const firstBeat = beats[0];
  if (!firstBeat?.cutsceneAssetKey) {
    throw new Error(`${advPath}.beats[0].cutsceneAssetKey must be an adv.* asset key`);
  }

  const initialBeat: StageAdvInitialBeatDefinition = {
    ...firstBeat,
    cutsceneAssetKey: firstBeat.cutsceneAssetKey,
  };
  return [initialBeat, ...beats.slice(1)];
}

function readAdvBeat(value: unknown, index: number, advPath: string): StageAdvBeatDefinition {
  const beatPath = `${advPath}.beats[${index}]`;
  const record = requireRecord(value, beatPath);
  const cutsceneAssetKey = readOptionalAdvAssetKey(
    record,
    'cutsceneAssetKey',
    `${beatPath}.cutsceneAssetKey`,
  );
  const standings =
    record.standings === undefined ? undefined : readAdvStandings(record.standings, beatPath);

  return {
    speaker: readRequiredNullableString(record.speaker, `${beatPath}.speaker`),
    text: readString(record, 'text', beatPath),
    faceAssetKey: readNullableAdvAssetKey(record.faceAssetKey, `${beatPath}.faceAssetKey`),
    ...(cutsceneAssetKey === undefined ? {} : { cutsceneAssetKey }),
    ...(standings === undefined ? {} : { standings }),
  };
}

function readAdvAssetKey(value: unknown, path: string): StageAdvAssetKey {
  if (typeof value !== 'string' || !ADV_ASSET_KEY_PATTERN.test(value)) {
    throw new Error(`${path} must be an adv.* asset key`);
  }

  return value as StageAdvAssetKey;
}

function readNullableAdvAssetKey(value: unknown, path: string): StageAdvAssetKey | null {
  if (value === null) {
    return null;
  }

  return readAdvAssetKey(value, path);
}

function readOptionalAdvAssetKey(
  record: JsonRecord,
  key: string,
  path: string,
): StageAdvAssetKey | undefined {
  const value = record[key];
  return value === undefined ? undefined : readAdvAssetKey(value, path);
}

function readRequiredNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path} must be a non-empty string or null`);
  }

  return value;
}

function assertUniqueStageValues(
  stageDefinitions: readonly StageDefinition[],
  key: 'id' | 'order',
): void {
  const seenValues = new Set<string | number>();
  for (const stageDefinition of stageDefinitions) {
    const value = stageDefinition[key];
    if (seenValues.has(value)) {
      throw new Error(`Duplicate stage ${key}: ${String(value)}`);
    }

    seenValues.add(value);
  }
}

function readVictoryCondition(value: unknown, stagePath: string): StageVictoryCondition {
  const record = requireRecord(value, `${stagePath}.victoryCondition`);
  const type = readString(record, 'type', `${stagePath}.victoryCondition`);

  if (type === 'DEFEAT_ENEMY_LEADER') {
    return { type };
  }

  if (type === 'SURVIVE_TURNS') {
    return {
      type,
      turns: readInteger(record, 'turns', `${stagePath}.victoryCondition`),
    };
  }

  throw new Error(`${stagePath}.victoryCondition.type is not supported: ${type}`);
}

function readDefeatConditions(value: unknown, stagePath: string): StageDefeatCondition[] {
  if (!Array.isArray(value)) {
    throw new Error(`${stagePath}.defeatConditions must be an array`);
  }

  return value.map((condition, index) => readDefeatCondition(condition, stagePath, index));
}

function readDefeatCondition(
  value: unknown,
  stagePath: string,
  index: number,
): StageDefeatCondition {
  const conditionPath = `${stagePath}.defeatConditions[${index}]`;
  const record = requireRecord(value, conditionPath);
  const type = readString(record, 'type', conditionPath);

  if (type === 'PLAYER_LEADER_DEFEATED' || type === 'DECK_OUT') {
    return { type };
  }

  if (type === 'TURN_LIMIT') {
    return {
      type,
      turns: readInteger(record, 'turns', conditionPath),
    };
  }

  throw new Error(`${conditionPath}.type is not supported: ${type}`);
}

function readRewards(value: unknown, stagePath: string): StageRewardDefinition {
  const record = requireRecord(value, `${stagePath}.rewards`);

  return {
    description: readString(record, 'description', `${stagePath}.rewards`),
    enemyCardDrop: readEnemyCardDrop(record.enemyCardDrop, stagePath),
  };
}

function readEnemyCardDrop(
  value: unknown,
  stagePath: string,
): StageRewardDefinition['enemyCardDrop'] {
  if (value === null) {
    return null;
  }

  const dropPath = `${stagePath}.rewards.enemyCardDrop`;
  const record = requireRecord(value, dropPath);
  const source = readString(record, 'source', dropPath);
  if (source !== 'ENEMY_DROP') {
    throw new Error(`${dropPath}.source is not supported: ${source}`);
  }

  return {
    source,
    chancePercent: readNumber(record, 'chancePercent', dropPath),
    maxCards: readInteger(record, 'maxCards', dropPath),
    excludeLeader: readBoolean(record, 'excludeLeader', dropPath),
  };
}

function readUnlockCondition(value: unknown, stagePath: string): StageUnlockCondition {
  const record = requireRecord(value, `${stagePath}.unlock`);
  const type = readString(record, 'type', `${stagePath}.unlock`);

  if (type === 'ALWAYS') {
    return { type };
  }

  if (type === 'STAGE_CLEARED') {
    return {
      type,
      stageId: readString(record, 'stageId', `${stagePath}.unlock`),
    };
  }

  throw new Error(`${stagePath}.unlock.type is not supported: ${type}`);
}

function readEnemyDeckPath(record: JsonRecord, stagePath: string): StageEnemyDeckPath {
  const enemyDeckPath = readString(record, 'enemyDeckPath', stagePath);
  if (!isSupportedEnemyDeckPath(enemyDeckPath)) {
    throw new Error(`${stagePath}.enemyDeckPath is not supported: ${enemyDeckPath}`);
  }

  return enemyDeckPath;
}

function isSupportedEnemyDeckPath(value: string): value is StageEnemyDeckPath {
  return ENEMY_DECK_PATH_PATTERN.test(value);
}

function readString(record: JsonRecord, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path}.${key} must be a non-empty string`);
  }

  return value;
}

/**
 * 비워 둘 수 있는 문자열을 읽는다.
 *
 * 없거나 null이면 null이다. 빈 문자열은 거부한다. 값을 지운 것인지 오타인지
 * 구분할 수 없어, 지울 때는 null을 쓰게 한다.
 */
function readNullableString(record: JsonRecord, key: string, path: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path}.${key} must be a non-empty string or null`);
  }

  return value;
}

function readNumber(record: JsonRecord, key: string, path: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path}.${key} must be a finite number`);
  }

  return value;
}

function readInteger(record: JsonRecord, key: string, path: string): number {
  const value = readNumber(record, key, path);
  if (!Number.isInteger(value)) {
    throw new Error(`${path}.${key} must be an integer`);
  }

  return value;
}

function readBoolean(record: JsonRecord, key: string, path: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    throw new Error(`${path}.${key} must be a boolean`);
  }

  return value;
}

function requireRecord(value: unknown, path: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
