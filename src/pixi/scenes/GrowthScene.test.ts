import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrowthView, GrowthViewModel } from '../../dom/screens/growth-view';
import { readCardExp } from '../../game/save/card-growth';
import { createInitialSaveState } from '../../game/save/create-initial-save';
import { createGameSession, type GameSession } from '../../game/save/session';
import { findFirstGrowthTarget, GrowthScene } from './GrowthScene';

const save = vi.fn();

type GrowthHarness = {
  selectTarget: (instanceId: string) => void;
  toggleMaterial: (instanceId: string) => void;
  grow: () => void;
  save: () => Promise<void>;
  draftSession: GameSession;
  selectedTargetId: string | null;
  selectedMaterialIds: ReadonlySet<string>;
};

function createHarness(session: GameSession) {
  const view: GrowthView & { render: ReturnType<typeof vi.fn> } = {
    element: {} as HTMLElement,
    showDetail: vi.fn(),
    render: vi.fn(),
  };
  const scene = new GrowthScene({
    services: { auth: {} as never, saveSlots: { save } as never, battle: {} as never },
    backgroundImageUrl: '/tcg/ui/title-screen.png',
    assetBaseUrl: '/tcg',
    session,
    onBack: vi.fn(),
    view,
  }) as unknown as GrowthHarness;

  return { scene, view };
}

function lastModel(view: { render: ReturnType<typeof vi.fn> }): GrowthViewModel {
  const call = view.render.mock.calls.at(-1);
  if (!call) {
    throw new Error('render was never called');
  }

  return call[0] as GrowthViewModel;
}

async function createSession(): Promise<GameSession> {
  return createGameSession(await createInitialSaveState({ slotId: 1 }));
}

function findMaterial(session: GameSession): string | null {
  return (
    session.collection.cards.find((card) => card.definition.type === 'UNIT')?.instance.instanceId ??
    null
  );
}

describe('findFirstGrowthTarget', () => {
  it('덱의 첫 UNIT을 고른다', async () => {
    const session = await createSession();

    expect(findFirstGrowthTarget(session)?.definition.type).toBe('UNIT');
  });
});

describe('GrowthScene', () => {
  beforeEach(() => {
    save.mockReset();
  });

  it('재료를 고르면 예상 EXP를 계산한다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);
    const materialId = findMaterial(session);

    if (!materialId) {
      return;
    }

    scene.toggleMaterial(materialId);

    const model = lastModel(view);
    expect(model.selectedMaterialCount).toBe(1);
    expect(model.pendingExp).toBeGreaterThan(0);
    expect(model.canGrow).toBe(true);
  });

  it('같은 재료를 다시 누르면 선택이 풀린다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);
    const materialId = findMaterial(session);

    if (!materialId) {
      return;
    }

    scene.toggleMaterial(materialId);
    scene.toggleMaterial(materialId);

    expect(lastModel(view).selectedMaterialCount).toBe(0);
    expect(lastModel(view).canGrow).toBe(false);
  });

  it('성장을 실행하면 재료가 소모되고 대상 EXP가 오른다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);
    const materialId = findMaterial(session);
    const targetId = scene.selectedTargetId;

    if (!materialId || !targetId) {
      return;
    }

    const before = session.deck.cards.find((card) => card.instance.instanceId === targetId);
    scene.toggleMaterial(materialId);
    scene.grow();

    const after = scene.draftSession.deck.cards.find(
      (card) => card.instance.instanceId === targetId,
    );

    expect(readCardExp(after!)).toBeGreaterThan(readCardExp(before!));
    expect(
      scene.draftSession.collection.cards.some((card) => card.instance.instanceId === materialId),
    ).toBe(false);
    expect(lastModel(view).isDirty).toBe(true);
    expect(lastModel(view).selectedMaterialCount).toBe(0);
  });

  it('재료를 고르지 않으면 성장을 실행하지 않는다', async () => {
    const session = await createSession();
    const { scene } = createHarness(session);

    scene.grow();

    expect(scene.draftSession).toBe(session);
  });

  it('대상을 바꾸면 재료 선택을 비운다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);
    const materialId = findMaterial(session);
    const otherTarget = session.deck.cards.find(
      (card) => card.instance.instanceId !== scene.selectedTargetId,
    );

    if (!materialId || !otherTarget) {
      return;
    }

    scene.toggleMaterial(materialId);
    scene.selectTarget(otherTarget.instance.instanceId);

    expect(lastModel(view).selectedMaterialCount).toBe(0);
  });

  it('저장이 실패하면 dirty를 유지한다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);
    const materialId = findMaterial(session);

    if (!materialId) {
      return;
    }

    scene.toggleMaterial(materialId);
    scene.grow();
    save.mockRejectedValue(new Error('network down'));

    await scene.save();

    expect(lastModel(view).isDirty).toBe(true);
    expect(lastModel(view).statusIsError).toBe(true);
  });
});
