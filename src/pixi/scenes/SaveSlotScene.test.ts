import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveSlotSummary } from '../../game/save/types';
import type { SaveSlotView } from '../../dom/screens/save-slot-view';
import { SaveSlotScene } from './SaveSlotScene';

const deleteSaveSlot = vi.fn<(slotId: 1 | 2 | 3) => Promise<SaveSlotSummary>>();
const fetchSummaries = vi.fn<() => Promise<SaveSlotSummary[]>>();
const initialize = vi.fn();
const fetchSlot = vi.fn();
const logout = vi.fn();

const occupiedSlot: SaveSlotSummary = {
  slotId: 1,
  saveName: 'Slot 1',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deckCardCount: 29,
  leaderName: '미네르바',
  isEmpty: false,
};

const emptySlot: SaveSlotSummary = {
  slotId: 2,
  saveName: null,
  updatedAt: null,
  deckCardCount: null,
  leaderName: null,
  isEmpty: true,
};

type SaveSlotSceneHarness = {
  slotSummaries: SaveSlotSummary[];
  deleteMode: boolean;
  isSlotActionPending: boolean;
  toggleDeleteMode: () => void;
  handleSlotSelection: (slot: SaveSlotSummary) => Promise<void>;
};

function createMockView(): SaveSlotView & {
  setStatus: ReturnType<typeof vi.fn>;
  setBusy: ReturnType<typeof vi.fn>;
  setDeleteMode: ReturnType<typeof vi.fn>;
  renderSlots: ReturnType<typeof vi.fn>;
  showRetry: ReturnType<typeof vi.fn>;
  showDeleteButton: ReturnType<typeof vi.fn>;
} {
  return {
    element: {} as HTMLElement,
    setStatus: vi.fn(),
    setBusy: vi.fn(),
    setDeleteMode: vi.fn(),
    renderSlots: vi.fn(),
    showRetry: vi.fn(),
    showDeleteButton: vi.fn(),
  };
}

function createHarness(view = createMockView()): {
  scene: SaveSlotSceneHarness;
  mockView: ReturnType<typeof createMockView>;
} {
  const scene = new SaveSlotScene({
    services: {
      auth: { logout } as never,
      saveSlots: {
        delete: deleteSaveSlot,
        fetchSummaries,
        initialize,
        fetch: fetchSlot,
      } as never,
    },
    backgroundImageUrl: '/tcg/ui/title-screen.png',
    onBack: vi.fn(),
    onLoggedOut: vi.fn(),
    onSessionReady: vi.fn(),
    view,
  }) as unknown as SaveSlotSceneHarness;

  scene.slotSummaries = [occupiedSlot, emptySlot];
  return { scene, mockView: view };
}

describe('SaveSlotScene delete mode', () => {
  beforeEach(() => {
    deleteSaveSlot.mockReset();
    fetchSummaries.mockReset();
    initialize.mockReset();
    fetchSlot.mockReset();
    logout.mockReset();
  });

  it('requires the delete button before selecting a slot for deletion', () => {
    const { scene, mockView } = createHarness();

    scene.toggleDeleteMode();

    expect(scene.deleteMode).toBe(true);
    expect(mockView.setDeleteMode).toHaveBeenCalledWith(true);
    expect(mockView.renderSlots).toHaveBeenCalledWith(scene.slotSummaries, true);
    expect(mockView.setStatus).toHaveBeenCalledWith(
      'Delete mode: select a saved slot to delete.',
      'danger',
    );
  });

  it('deletes an occupied slot and leaves delete mode afterward', async () => {
    const deletedSummary = { ...emptySlot, slotId: 1 as const };
    deleteSaveSlot.mockResolvedValue(deletedSummary);
    const { scene, mockView } = createHarness();
    scene.deleteMode = true;

    await scene.handleSlotSelection(occupiedSlot);

    expect(deleteSaveSlot).toHaveBeenCalledWith(1);
    expect(scene.slotSummaries[0]).toEqual(deletedSummary);
    expect(scene.deleteMode).toBe(false);
    expect(scene.isSlotActionPending).toBe(false);
    expect(mockView.setStatus).toHaveBeenLastCalledWith(
      'Slot 1 deleted. Select a slot to continue.',
      'normal',
    );
  });

  it('does not call the delete API for an empty slot', async () => {
    const { scene, mockView } = createHarness();
    scene.deleteMode = true;

    await scene.handleSlotSelection(emptySlot);

    expect(deleteSaveSlot).not.toHaveBeenCalled();
    expect(scene.deleteMode).toBe(true);
    expect(mockView.setStatus).toHaveBeenCalledWith('Slot 2 is already empty.', 'danger');
  });
});
