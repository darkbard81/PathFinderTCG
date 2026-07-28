import { describe, expect, it, vi } from 'vitest';

import { createPhaseOneFixtures } from '../data/testFixtures.js';
import { PathfinderApiError, type PathfinderGameApi } from '../client/PathfinderApiClient.js';
import { DETERMINISTIC_BATTLE_DECISIONS, chooseBattleAiAction } from './battle/index.js';
import { GameSession, type GameSessionContent } from './GameSession.js';

function createApi(overrides: Partial<PathfinderGameApi> = {}): PathfinderGameApi {
  const fixture = createPhaseOneFixtures();

  return {
    register: vi.fn().mockResolvedValue({ id: 'user-1', username: 'aelira' }),
    login: vi.fn().mockResolvedValue({ id: 'user-1', username: 'aelira' }),
    logout: vi.fn().mockResolvedValue(undefined),
    getAuthenticatedUser: vi.fn().mockResolvedValue({ id: 'user-1', username: 'aelira' }),
    listSaveSlots: vi.fn().mockResolvedValue([
      {
        slotId: 1,
        status: 'OCCUPIED',
        lastModifiedAt: fixture.saveSlot.lastModifiedAt,
        selectedDeckId: fixture.saveSlot.selectedDeckId,
        deckCount: 1,
        ownedCardCount: fixture.collection.cardInstances.length,
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
    ]),
    createSaveSlot: vi.fn().mockResolvedValue(fixture.saveSlot),
    getSaveSlot: vi.fn().mockResolvedValue(fixture.saveSlot),
    updateDeck: vi.fn().mockResolvedValue(fixture.saveSlot),
    startStageRun: vi.fn().mockResolvedValue({
      runId: 'stage-run-started',
      stageId: fixture.stage.id,
      seed: 42,
      startedAt: fixture.saveSlot.lastModifiedAt,
    }),
    completeStageRun: vi.fn().mockResolvedValue({
      stageRun: fixture.saveSlot.completedStageRuns[0],
      saveSlot: fixture.saveSlot,
    }),
    deleteSaveSlot: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createFixtureContent(): GameSessionContent {
  const fixture = createPhaseOneFixtures();

  return {
    cardCatalog: fixture.cardCatalog,
    stages: [
      {
        definition: fixture.stage,
        presentation: {
          name: 'Fixture Stage',
          description: 'GameSession 테스트용 Stage',
          rewardSummary: '승리 시 1장',
        },
      },
    ],
    enemyDeckBlueprints: [fixture.enemyDeckBlueprint],
  };
}

describe('GameSession', () => {
  it('restores authentication and keeps account/save state outside Phaser', async () => {
    const api = createApi();
    const session = new GameSession(api);

    await expect(session.restoreAuthentication()).resolves.toBe(true);
    await session.refreshSaveSlots();
    await session.openSaveSlot(1);

    expect(session.getState()).toMatchObject({
      user: {
        id: 'user-1',
        username: 'aelira',
      },
      activeSaveSlot: {
        slotId: 1,
      },
    });
    expect(session.getState().saveSlots).toHaveLength(3);
  });

  it('treats an unauthenticated restore as the login route', async () => {
    const api = createApi({
      getAuthenticatedUser: vi.fn().mockRejectedValue(
        new PathfinderApiError(401, {
          code: 'UNAUTHENTICATED',
          message: '로그인이 필요합니다.',
          details: [],
        }),
      ),
    });
    const session = new GameSession(api);

    await expect(session.restoreAuthentication()).resolves.toBe(false);
    expect(session.getState()).toEqual({
      user: null,
      saveSlots: [],
      activeSaveSlot: null,
      activeStageRun: null,
      battleState: null,
      lastBattle: null,
    });
  });

  it('registers, logs in, creates a slot, and notifies active subscribers', async () => {
    const api = createApi();
    const register = vi.spyOn(api, 'register');
    const login = vi.spyOn(api, 'login');
    const session = new GameSession(api);
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    await session.registerAndLogin('Aelira', 'long-password');
    await session.createSaveSlot(1);
    unsubscribe();
    await session.refreshSaveSlots();

    expect(register).toHaveBeenCalledWith('Aelira', 'long-password');
    expect(login).toHaveBeenCalledWith('Aelira', 'long-password');
    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({
      activeSaveSlot: {
        slotId: 1,
      },
    });
  });

  it('saves incomplete drafts through the storage-valid API boundary', async () => {
    const fixture = createPhaseOneFixtures();
    const api = createApi();
    const updateDeck = vi.spyOn(api, 'updateDeck');
    const session = new GameSession(api, createFixtureContent());
    await session.restoreAuthentication();
    await session.openSaveSlot(1);
    const incomplete = {
      ...fixture.deck,
      unitInstanceIds: fixture.deck.unitInstanceIds.slice(0, 3),
    };

    await session.saveDeck(incomplete);

    expect(updateDeck).toHaveBeenCalledWith(1, incomplete.id, incomplete);
  });

  it('does not expose its mutable save-slot summary array', async () => {
    const session = new GameSession(createApi());
    await session.restoreAuthentication();
    await session.refreshSaveSlots();
    const snapshot = session.getState();

    await session.logout();

    expect(snapshot.saveSlots).toHaveLength(3);
    expect(session.getState().saveSlots).toHaveLength(0);
  });

  it('creates an independent seeded battle from a server Stage run and persists its final result', async () => {
    const fixture = createPhaseOneFixtures();
    const stageRun = {
      runId: 'server-stage-run-01',
      stageId: fixture.stage.id,
      seed: 0x1234_5678,
      startedAt: '2026-07-28T06:00:00.000Z',
    };
    const startStageRun = vi.fn().mockResolvedValue(stageRun);
    const completeStageRun = vi.fn<PathfinderGameApi['completeStageRun']>(
      (_slotId, runId, result) => {
        const rewardDefinition = fixture.unitDefinitions[0];

        if (rewardDefinition === undefined) {
          throw new Error('보상 fixture 정의가 없습니다.');
        }

        const rewardCardInstanceId = result === 'WIN' ? 'server-reward-01' : null;
        const completedStageRun = {
          runId,
          stageId: fixture.stage.id,
          result,
          rewardCardInstanceId,
          completedAt: '2026-07-28T06:10:00.000Z',
        } as const;
        const saveSlot = {
          ...fixture.saveSlot,
          collection: {
            cardInstances:
              rewardCardInstanceId === null
                ? fixture.saveSlot.collection.cardInstances
                : [
                    ...fixture.saveSlot.collection.cardInstances,
                    {
                      id: rewardCardInstanceId,
                      cardDefinitionId: rewardDefinition.id,
                    },
                  ],
          },
          progress: {
            ...fixture.saveSlot.progress,
            clearedStageIds:
              result === 'WIN' ? [fixture.stage.id] : fixture.saveSlot.progress.clearedStageIds,
          },
          completedStageRuns: [...fixture.saveSlot.completedStageRuns, completedStageRun],
          lastModifiedAt: completedStageRun.completedAt,
        };

        return Promise.resolve({
          stageRun: completedStageRun,
          saveSlot,
        });
      },
    );
    const api = createApi({ startStageRun, completeStageRun });
    const session = new GameSession(api, createFixtureContent());
    await session.restoreAuthentication();
    await session.openSaveSlot(1);

    const initialBattle = await session.startStageBattle(fixture.stage.id);
    expect(startStageRun).toHaveBeenCalledWith(1, fixture.stage.id);
    expect(initialBattle.activePlayerId).toBe('PLAYER');
    expect(session.getState().activeStageRun).toEqual(stageRun);
    const savedInstanceIds = new Set(
      fixture.saveSlot.collection.cardInstances.map((instance) => instance.id),
    );
    expect(initialBattle.cards.every((card) => !savedInstanceIds.has(card.id))).toBe(true);
    expect(initialBattle.players.PLAYER.battleDeckId).not.toBe(
      initialBattle.players.ENEMY.battleDeckId,
    );

    let actionCount = 0;
    while (session.getState().battleState?.result.type === 'ONGOING') {
      if (actionCount >= 128) {
        throw new Error('GameSession AI 전투가 128 Action 안에 끝나지 않았습니다.');
      }

      const state = session.getState().battleState;
      if (state === null) {
        throw new Error('진행 중인 전투 상태가 없습니다.');
      }
      const action = chooseBattleAiAction(state, fixture.cardCatalog.cardDefinitions);
      session.resolveBattleAction(action, DETERMINISTIC_BATTLE_DECISIONS);
      actionCount += 1;
    }

    const finalState = session.getState().battleState;
    if (finalState === null || finalState.result.type === 'ONGOING') {
      throw new Error('완료된 전투 상태가 없습니다.');
    }
    const expectedResult =
      finalState.result.type === 'DRAW'
        ? 'DRAW'
        : finalState.result.winnerId === 'PLAYER'
          ? 'WIN'
          : 'LOSS';
    const completed = await session.completeStageBattle();

    expect(completeStageRun).toHaveBeenCalledWith(1, stageRun.runId, expectedResult);
    expect(completed.stageRun.result).toBe(expectedResult);
    expect(completed.reward === null).toBe(expectedResult !== 'WIN');
    expect(session.getState()).toMatchObject({
      activeStageRun: null,
      battleState: null,
      lastBattle: {
        stageRun: {
          runId: stageRun.runId,
          result: expectedResult,
        },
      },
    });
  });

  it('completes an abandoned active Stage run as a rewardless loss', async () => {
    const fixture = createPhaseOneFixtures();
    const stageRun = {
      runId: 'abandoned-stage-run',
      stageId: fixture.stage.id,
      seed: 7,
      startedAt: '2026-07-28T06:00:00.000Z',
    };
    const completedStageRun = {
      runId: stageRun.runId,
      stageId: stageRun.stageId,
      result: 'LOSS',
      rewardCardInstanceId: null,
      completedAt: '2026-07-28T06:01:00.000Z',
    } as const;
    const saveSlot = {
      ...fixture.saveSlot,
      completedStageRuns: [...fixture.saveSlot.completedStageRuns, completedStageRun],
      lastModifiedAt: completedStageRun.completedAt,
    };
    const completeStageRun = vi.fn().mockResolvedValue({
      stageRun: completedStageRun,
      saveSlot,
    });
    const session = new GameSession(
      createApi({
        startStageRun: vi.fn().mockResolvedValue(stageRun),
        completeStageRun,
      }),
      createFixtureContent(),
    );
    await session.restoreAuthentication();
    await session.openSaveSlot(1);
    await session.startStageBattle(fixture.stage.id);

    await session.abandonStageBattle();

    expect(completeStageRun).toHaveBeenCalledWith(1, stageRun.runId, 'LOSS');
    const state = session.getState();
    expect(
      state.activeSaveSlot?.completedStageRuns.some(
        (run) => run.runId === stageRun.runId && run.result === 'LOSS',
      ),
    ).toBe(true);
    expect(state).toMatchObject({
      activeStageRun: null,
      battleState: null,
      lastBattle: null,
    });
  });
});
