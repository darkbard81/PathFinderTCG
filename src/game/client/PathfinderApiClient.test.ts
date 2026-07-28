import { describe, expect, it, vi } from 'vitest';

import { createPhaseOneFixtures } from '../data/testFixtures.js';
import { PathfinderApiClient, PathfinderApiError, type ApiFetch } from './PathfinderApiClient.js';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

describe('PathfinderApiClient', () => {
  it('uses the same-origin cookie session and parses user responses', async () => {
    const fetcher = vi.fn<ApiFetch>().mockResolvedValue(
      jsonResponse({
        user: {
          id: 'user-1',
          username: 'aelira',
        },
      }),
    );
    const client = new PathfinderApiClient(fetcher);

    await expect(client.login('Aelira', 'long-password')).resolves.toEqual({
      id: 'user-1',
      username: 'aelira',
    });
    expect(fetcher).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'Aelira',
        password: 'long-password',
      }),
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
      },
    });
  });

  it('parses the fixed three-slot list and full save state', async () => {
    const fixture = createPhaseOneFixtures();
    const fetcher = vi
      .fn<ApiFetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          saveSlots: [
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
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ saveSlot: fixture.saveSlot }));
    const client = new PathfinderApiClient(fetcher);

    await expect(client.listSaveSlots()).resolves.toHaveLength(3);
    await expect(client.getSaveSlot(1)).resolves.toEqual(fixture.saveSlot);
  });

  it('preserves the API error code, status, and details', async () => {
    const fetcher = vi.fn<ApiFetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'INVALID_DECK',
            message: '덱이 유효하지 않습니다.',
            details: [{ code: 'DECK_TOO_LARGE' }],
          },
        },
        422,
      ),
    );
    const client = new PathfinderApiClient(fetcher);

    const error = await client
      .updateDeck(1, 'deck-1', createPhaseOneFixtures().deck)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PathfinderApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'INVALID_DECK',
      message: '덱이 유효하지 않습니다.',
      details: [{ code: 'DECK_TOO_LARGE' }],
    });
  });

  it('starts a Stage run with the requested Stage ID and parses the server seed', async () => {
    const fetcher = vi.fn<ApiFetch>().mockResolvedValue(
      jsonResponse(
        {
          stageRun: {
            runId: 'run/with space',
            stageId: 'stage-01',
            seed: 0xffff_ffff,
            startedAt: '2026-07-28T06:00:00.000Z',
          },
        },
        201,
      ),
    );
    const client = new PathfinderApiClient(fetcher);

    await expect(client.startStageRun(2, 'stage-01')).resolves.toEqual({
      runId: 'run/with space',
      stageId: 'stage-01',
      seed: 0xffff_ffff,
      startedAt: '2026-07-28T06:00:00.000Z',
    });
    expect(fetcher).toHaveBeenCalledWith('/api/save-slots/2/stage-runs', {
      method: 'POST',
      body: JSON.stringify({ stageId: 'stage-01' }),
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
      },
    });
  });

  it('completes an encoded run ID only when its receipt matches the returned save', async () => {
    const fixture = createPhaseOneFixtures();
    const fixtureRun = fixture.saveSlot.completedStageRuns[0];

    if (fixtureRun === undefined) {
      throw new Error('완료 Stage 실행 fixture가 없습니다.');
    }

    const completedRun = {
      ...fixtureRun,
      runId: 'stage:run:01',
    };
    const saveSlot = {
      ...fixture.saveSlot,
      completedStageRuns: [completedRun],
    };
    const fetcher = vi.fn<ApiFetch>().mockResolvedValue(
      jsonResponse({
        stageRun: completedRun,
        saveSlot,
      }),
    );
    const client = new PathfinderApiClient(fetcher);

    await expect(client.completeStageRun(1, 'stage:run:01', 'WIN')).resolves.toEqual({
      stageRun: completedRun,
      saveSlot,
    });
    expect(fetcher).toHaveBeenCalledWith('/api/save-slots/1/stage-runs/stage%3Arun%3A01/complete', {
      method: 'POST',
      body: JSON.stringify({ result: 'WIN' }),
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
      },
    });
  });

  it('rejects a completion receipt that disagrees with the save record', async () => {
    const fixture = createPhaseOneFixtures();
    const completedRun = fixture.saveSlot.completedStageRuns[0];

    if (completedRun === undefined) {
      throw new Error('완료 Stage 실행 fixture가 없습니다.');
    }

    const fetcher = vi.fn<ApiFetch>().mockResolvedValue(
      jsonResponse({
        stageRun: {
          ...completedRun,
          rewardCardInstanceId: 'different-reward',
        },
        saveSlot: fixture.saveSlot,
      }),
    );
    const client = new PathfinderApiClient(fetcher);

    await expect(client.completeStageRun(1, completedRun.runId, 'WIN')).rejects.toThrow(
      '영수증이 세이브 슬롯 기록과 일치하지 않습니다',
    );
  });
});
