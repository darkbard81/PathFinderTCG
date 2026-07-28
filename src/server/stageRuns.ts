import { randomInt, randomUUID } from 'node:crypto';

import {
  validatePlayableSavedDeck,
  type CompletedStageRun,
  type DataValidationIssue,
  type SaveSlotState,
  type StableId,
  type StageDefinition,
  type StageRewardEntry,
  type StageRunResult,
  type StartedStageRun,
} from '../game/data/index.js';
import type { Clock } from './auth.js';
import type { GameDatabase, PersistedStageRun } from './database.js';
import type { SaveSlotId, ServerGameContent } from './gameContent.js';
import { InvalidPersistedSaveSlotError } from './saveSlots.js';
import type { SaveSlotService } from './saveSlots.js';

const UINT32_RANGE = 0x1_0000_0000;

export interface StageRunFactories {
  readonly createRunId: () => StableId;
  readonly createRewardCardInstanceId: () => StableId;
  readonly createSeed: () => number;
}

export interface StartedStageRunReceipt {
  readonly stageRun: StartedStageRun;
  readonly created: boolean;
}

export interface CompletedStageRunReceipt {
  readonly stageRun: CompletedStageRun;
  readonly saveSlot: SaveSlotState;
}

export class StageNotFoundError extends Error {
  constructor(stageId: StableId) {
    super(`존재하지 않는 Stage입니다: ${stageId}`);
    this.name = 'StageNotFoundError';
  }
}

export class StageLockedError extends Error {
  constructor(stageId: StableId) {
    super(`아직 해금되지 않은 Stage입니다: ${stageId}`);
    this.name = 'StageLockedError';
  }
}

export class InvalidStageDeckError extends Error {
  readonly issues: readonly DataValidationIssue[];

  constructor(issues: readonly DataValidationIssue[]) {
    super('합법적인 선택 덱이 있어야 Stage를 시작할 수 있습니다.');
    this.name = 'InvalidStageDeckError';
    this.issues = issues;
  }
}

export class StageRunNotFoundError extends Error {
  constructor(runId: StableId) {
    super(`존재하지 않는 Stage 실행입니다: ${runId}`);
    this.name = 'StageRunNotFoundError';
  }
}

export class StageRunCompletionConflictError extends Error {
  constructor(runId: StableId) {
    super(`Stage 실행을 완료 상태로 전환하지 못했습니다: ${runId}`);
    this.name = 'StageRunCompletionConflictError';
  }
}

function assertStableId(value: string, label: string): void {
  if (value.length === 0) {
    throw new Error(`${label} ID는 비어 있을 수 없습니다.`);
  }
}

function assertSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed >= UINT32_RANGE) {
    throw new RangeError('Stage 실행 시드는 0~4294967295 범위의 정수여야 합니다.');
  }
}

function defaultFactories(): StageRunFactories {
  return {
    createRunId: () => randomUUID(),
    createRewardCardInstanceId: () => randomUUID(),
    createSeed: () => randomInt(0, UINT32_RANGE),
  };
}

function toStartedStageRun(run: PersistedStageRun): StartedStageRun {
  return Object.freeze({
    runId: run.runId,
    stageId: run.stageId,
    seed: run.seed,
    startedAt: run.startedAt,
  });
}

function toCompletedStageRun(
  run: Extract<PersistedStageRun, { readonly status: 'COMPLETED' }>,
): CompletedStageRun {
  return Object.freeze({
    runId: run.runId,
    stageId: run.stageId,
    result: run.result,
    rewardCardInstanceId: run.rewardCardInstanceId,
    completedAt: run.completedAt,
  });
}

function findStage(content: ServerGameContent, stageId: StableId): StageDefinition {
  const stage = content.stages.find((candidate) => candidate.id === stageId);

  if (stage === undefined) {
    throw new StageNotFoundError(stageId);
  }

  return stage;
}

export function selectWeightedStageReward(
  rewards: readonly StageRewardEntry[],
  seed: number,
): StageRewardEntry {
  assertSeed(seed);
  if (rewards.length === 0) {
    throw new Error('Stage 보상 후보가 비어 있습니다.');
  }

  let totalWeight = 0;
  for (const reward of rewards) {
    if (!Number.isInteger(reward.weight) || reward.weight <= 0) {
      throw new Error(`Stage 보상 가중치는 양의 정수여야 합니다: ${reward.cardDefinitionId}`);
    }
    totalWeight += reward.weight;
  }

  const roll = Math.floor((seed / UINT32_RANGE) * totalWeight);
  let cumulativeWeight = 0;

  for (const reward of rewards) {
    cumulativeWeight += reward.weight;
    if (roll < cumulativeWeight) {
      return reward;
    }
  }

  throw new Error('Stage 보상 가중치 선택 결과를 찾지 못했습니다.');
}

export class StageRunService {
  private readonly database: GameDatabase;
  private readonly saveSlots: SaveSlotService;
  private readonly content: ServerGameContent;
  private readonly now: Clock;
  private readonly factories: StageRunFactories;

  constructor(
    database: GameDatabase,
    saveSlots: SaveSlotService,
    content: ServerGameContent,
    now: Clock = () => new Date(),
    factories: StageRunFactories = defaultFactories(),
  ) {
    this.database = database;
    this.saveSlots = saveSlots;
    this.content = content;
    this.now = now;
    this.factories = factories;
  }

  start(userId: string, slotId: SaveSlotId, stageId: StableId): StartedStageRunReceipt {
    const stage = findStage(this.content, stageId);
    const saveSlot = this.saveSlots.get(userId, slotId);

    if (!saveSlot.progress.unlockedStageIds.includes(stage.id)) {
      throw new StageLockedError(stage.id);
    }

    const deck = saveSlot.decks.find((candidate) => candidate.id === saveSlot.selectedDeckId);
    const deckValidation =
      deck === undefined
        ? {
            valid: false as const,
            issues: [
              {
                code: 'SELECTED_DECK_NOT_FOUND' as const,
                path: '/selectedDeckId',
                message: '선택한 덱이 없습니다.',
              },
            ],
          }
        : validatePlayableSavedDeck(deck, {
            collection: saveSlot.collection,
            cardDefinitions: this.content.cardDefinitions,
          });

    if (!deckValidation.valid) {
      throw new InvalidStageDeckError(deckValidation.issues);
    }

    const pending = this.database.findPendingStageRun(userId, slotId, stage.id);
    if (pending !== null) {
      return Object.freeze({
        stageRun: toStartedStageRun(pending),
        created: false,
      });
    }

    const runId = this.factories.createRunId();
    const seed = this.factories.createSeed();
    const startedAt = this.now().toISOString();
    assertStableId(runId, 'Stage 실행');
    assertSeed(seed);
    const stageRun = {
      userId,
      slotId,
      runId,
      stageId: stage.id,
      seed,
      status: 'PENDING',
      result: null,
      rewardCardInstanceId: null,
      startedAt,
      completedAt: null,
    } as const;
    this.database.createStageRun(stageRun);

    return Object.freeze({
      stageRun: toStartedStageRun(stageRun),
      created: true,
    });
  }

  complete(
    userId: string,
    slotId: SaveSlotId,
    runId: StableId,
    result: StageRunResult,
  ): CompletedStageRunReceipt {
    return this.database.runInTransaction(() => {
      const persistedRun = this.database.findStageRun(userId, slotId, runId);

      if (persistedRun === null) {
        throw new StageRunNotFoundError(runId);
      }

      const currentState = this.saveSlots.get(userId, slotId);
      if (persistedRun.status === 'COMPLETED') {
        const savedRun = currentState.completedStageRuns.find(
          (candidate) => candidate.runId === persistedRun.runId,
        );

        if (savedRun === undefined) {
          throw new InvalidPersistedSaveSlotError(
            `완료 Stage 실행이 세이브 기록에 없습니다: ${persistedRun.runId}`,
          );
        }

        return Object.freeze({
          stageRun: toCompletedStageRun(persistedRun),
          saveSlot: currentState,
        });
      }

      const stage = findStage(this.content, persistedRun.stageId);
      const completedAt = this.now().toISOString();
      const reward =
        result === 'WIN' ? selectWeightedStageReward(stage.rewards, persistedRun.seed) : null;
      const rewardCardInstanceId =
        reward === null ? null : this.factories.createRewardCardInstanceId();

      if (rewardCardInstanceId !== null) {
        assertStableId(rewardCardInstanceId, '보상 카드 인스턴스');
      }

      const completedStageRun: CompletedStageRun = {
        runId: persistedRun.runId,
        stageId: persistedRun.stageId,
        result,
        rewardCardInstanceId,
        completedAt,
      };
      const clearedStageIds =
        result === 'WIN' && !currentState.progress.clearedStageIds.includes(stage.id)
          ? [...currentState.progress.clearedStageIds, stage.id]
          : currentState.progress.clearedStageIds;
      const updatedState: SaveSlotState = {
        ...currentState,
        collection: {
          cardInstances:
            reward === null || rewardCardInstanceId === null
              ? currentState.collection.cardInstances
              : [
                  ...currentState.collection.cardInstances,
                  {
                    id: rewardCardInstanceId,
                    cardDefinitionId: reward.cardDefinitionId,
                  },
                ],
        },
        progress: {
          ...currentState.progress,
          clearedStageIds,
        },
        completedStageRuns: [...currentState.completedStageRuns, completedStageRun],
        lastModifiedAt: completedAt,
      };
      const savedState = this.saveSlots.replaceState(userId, updatedState);
      const completed = this.database.completeStageRun(
        userId,
        slotId,
        runId,
        result,
        rewardCardInstanceId,
        completedAt,
      );

      if (!completed) {
        throw new StageRunCompletionConflictError(runId);
      }

      return Object.freeze({
        stageRun: Object.freeze(completedStageRun),
        saveSlot: savedState,
      });
    });
  }
}
