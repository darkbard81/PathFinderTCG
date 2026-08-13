import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckBuildView, DeckBuildViewModel } from '../../dom/screens/deck-build-view';
import { createInitialSaveState } from '../../game/save/create-initial-save';
import { createGameSession, type GameSession } from '../../game/save/session';
import { DeckBuildScene } from './DeckBuildScene';

const save = vi.fn();

function createMockView(): DeckBuildView & { render: ReturnType<typeof vi.fn> } {
  return {
    element: {} as HTMLElement,
    showDetail: vi.fn(),
    render: vi.fn(),
  };
}

type DeckBuildHarness = {
  selectMode: (mode: 'UNIT' | 'LEADER') => void;
  handleDeckCardClick: (instanceId: string) => void;
  handleCollectionCardClick: (instanceId: string) => void;
  save: () => Promise<void>;
  draftSession: GameSession;
  savedSession: GameSession;
  isDirty: boolean;
};

function createHarness(session: GameSession) {
  const view = createMockView();
  const onBack = vi.fn();
  const scene = new DeckBuildScene({
    services: { auth: {} as never, saveSlots: { save } as never, battle: {} as never },
    backgroundImageUrl: '/tcg/ui/title-screen.png',
    assetBaseUrl: '/tcg',
    session,
    onBack,
    view,
  }) as unknown as DeckBuildHarness;

  return { scene, view, onBack };
}

function lastModel(view: { render: ReturnType<typeof vi.fn> }): DeckBuildViewModel {
  const call = view.render.mock.calls.at(-1);
  if (!call) {
    throw new Error('render was never called');
  }

  return call[0] as DeckBuildViewModel;
}

async function createSession(): Promise<GameSession> {
  return createGameSession(await createInitialSaveState({ slotId: 1 }));
}

describe('DeckBuildScene', () => {
  beforeEach(() => {
    save.mockReset();
  });

  it('덱 카드를 누르면 수집품으로 옮기고 dirty로 표시한다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);
    const movedId = session.deck.cards[0]!.instance.instanceId;

    scene.handleDeckCardClick(movedId);

    expect(scene.draftSession.deck.cards).toHaveLength(session.deck.cards.length - 1);
    expect(
      scene.draftSession.collection.cards.some((card) => card.instance.instanceId === movedId),
    ).toBe(true);
    expect(lastModel(view).isDirty).toBe(true);
  });

  it('수집품 유닛을 누르면 덱으로 넣는다', async () => {
    const session = await createSession();
    const { scene } = createHarness(session);
    const unit = session.collection.cards.find((card) => card.definition.type === 'UNIT');

    if (!unit) {
      return;
    }

    scene.handleCollectionCardClick(unit.instance.instanceId);

    expect(scene.draftSession.deck.cards).toHaveLength(session.deck.cards.length + 1);
  });

  it('LEADER 모드에서 덱 리더를 눌러도 이동하지 않고 안내만 한다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);

    scene.selectMode('LEADER');
    scene.handleDeckCardClick(session.deck.leader.instance.instanceId);

    expect(scene.draftSession.deck.leader.instance.instanceId).toBe(
      session.deck.leader.instance.instanceId,
    );
    expect(lastModel(view).statusIsError).toBe(true);
    expect(lastModel(view).isDirty).toBe(false);
  });

  it('도메인 규칙 위반은 draft를 바꾸지 않고 오류 상태로 남는다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);

    scene.handleDeckCardClick('없는-인스턴스');

    expect(scene.draftSession).toBe(session);
    expect(lastModel(view).statusIsError).toBe(true);
    expect(lastModel(view).isDirty).toBe(false);
  });

  it('저장하면 서버가 돌려준 세션으로 saved와 draft를 맞추고 dirty를 푼다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);
    scene.handleDeckCardClick(session.deck.cards[0]!.instance.instanceId);

    save.mockResolvedValue(await createInitialSaveState({ slotId: 1 }));

    await scene.save();

    expect(save).toHaveBeenCalledTimes(1);
    expect(lastModel(view).isDirty).toBe(false);
    expect(scene.savedSession).toBe(scene.draftSession);
  });

  it('바뀐 것이 없으면 저장을 보내지 않는다', async () => {
    const { scene } = createHarness(await createSession());

    await scene.save();

    expect(save).not.toHaveBeenCalled();
  });

  it('저장이 실패하면 dirty를 유지한 채 오류를 알린다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);
    scene.handleDeckCardClick(session.deck.cards[0]!.instance.instanceId);
    save.mockRejectedValue(new Error('network down'));

    await scene.save();

    const model = lastModel(view);
    expect(model.isDirty).toBe(true);
    expect(model.statusIsError).toBe(true);
    expect(model.status).toContain('network down');
  });

  it('모드를 바꾸면 코스트 필터를 초기화한다', async () => {
    const { scene, view } = createHarness(await createSession());

    scene.selectMode('LEADER');

    expect(lastModel(view).mode).toBe('LEADER');
    expect(lastModel(view).deck.costFilters.every((filter) => !filter.active)).toBe(true);
  });
});
