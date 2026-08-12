import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StageView } from '../../dom/screens/stage-view';
import { createInitialSaveState } from '../../game/save/create-initial-save';
import { createGameSession, type GameSession } from '../../game/save/session';
import type { StageDefinition } from '../../game/stage/types';
import { resolveInitialSelectedStage, StageScene } from './StageScene';

const save = vi.fn();
const logout = vi.fn();

function createMockView(): StageView & {
  render: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  setBusy: ReturnType<typeof vi.fn>;
} {
  return {
    element: {} as HTMLElement,
    render: vi.fn(),
    setStatus: vi.fn(),
    setBusy: vi.fn(),
  };
}

type StageSceneHarness = {
  selectStage: (stageId: string) => void;
  handleStartBattle: () => Promise<void>;
  selectedStageId: string;
  isStartingBattle: boolean;
  session: GameSession;
};

function createHarness(session: GameSession, view = createMockView()) {
  const onStartBattle = vi.fn();
  const scene = new StageScene({
    services: {
      auth: { logout } as never,
      saveSlots: { save } as never,
      battle: {} as never,
    },
    backgroundImageUrl: '/tcg/ui/title-screen.png',
    session,
    onBack: vi.fn(),
    onStartBattle,
    view,
  }) as unknown as StageSceneHarness;

  return { scene, view, onStartBattle };
}

describe('resolveInitialSelectedStage', () => {
  const stages = [
    {
      id: 'stage-a',
      order: 1,
      unlock: { type: 'ALWAYS' },
    },
    {
      id: 'stage-b',
      order: 2,
      unlock: { type: 'STAGE_CLEARED', stageId: 'stage-a' },
    },
  ] as StageDefinition[];

  it('prefers the last selected unlocked stage', () => {
    const session = {
      stageProgress: {
        clearedStageIds: ['stage-a'],
        lastSelectedStageId: 'stage-b',
      },
    } as unknown as GameSession;

    expect(resolveInitialSelectedStage(stages, session).id).toBe('stage-b');
  });

  it('falls back to the first unlocked stage', () => {
    const session = {
      stageProgress: {
        clearedStageIds: [],
        lastSelectedStageId: 'stage-b',
      },
    } as unknown as GameSession;

    expect(resolveInitialSelectedStage(stages, session).id).toBe('stage-a');
  });
});

describe('StageScene', () => {
  beforeEach(() => {
    save.mockReset();
    logout.mockReset();
  });

  it('updates lastSelectedStageId when a stage card is selected', async () => {
    const session = createGameSession(await createInitialSaveState({ slotId: 1 }));
    const { scene, view } = createHarness(session);

    scene.selectStage('level02');

    expect(scene.selectedStageId).toBe('level02');
    expect(scene.session.stageProgress.lastSelectedStageId).toBe('level02');
    expect(view.render).toHaveBeenCalled();
  });

  it('does not start battle while another start is already pending', async () => {
    const session = createGameSession(await createInitialSaveState({ slotId: 1 }));
    const { scene, onStartBattle } = createHarness(session);
    scene.isStartingBattle = true;

    await scene.handleStartBattle();

    expect(save).not.toHaveBeenCalled();
    expect(onStartBattle).not.toHaveBeenCalled();
  });

  it('blocks battle start for a locked stage', async () => {
    const session = createGameSession(await createInitialSaveState({ slotId: 1 }));
    const { scene, view, onStartBattle } = createHarness(session);
    scene.selectStage('level02');

    await scene.handleStartBattle();

    expect(save).not.toHaveBeenCalled();
    expect(onStartBattle).not.toHaveBeenCalled();
    expect(view.render).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'This stage is locked.',
        statusIsError: true,
      }),
    );
  });

  it('saves progress then hands off to the battle callback', async () => {
    const initial = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(initial);
    const savedState = {
      ...initial,
      updatedAt: '2024-02-01T00:00:00.000Z',
      stageProgress: {
        ...initial.stageProgress,
        lastSelectedStageId: 'level01',
      },
    };
    save.mockResolvedValue(savedState);

    const { scene, onStartBattle } = createHarness(session);
    scene.selectStage('level01');

    await scene.handleStartBattle();

    expect(save).toHaveBeenCalledOnce();
    expect(onStartBattle).toHaveBeenCalledWith(
      expect.objectContaining({
        slotId: 1,
        stageProgress: expect.objectContaining({ lastSelectedStageId: 'level01' }),
      }),
      'level01',
    );
  });
});
