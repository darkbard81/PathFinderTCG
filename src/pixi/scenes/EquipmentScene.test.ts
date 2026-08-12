import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EquipmentView, EquipmentViewModel } from '../../dom/screens/equipment-view';
import { createInitialSaveState } from '../../game/save/create-initial-save';
import { createGameSession, type GameSession } from '../../game/save/session';
import { EquipmentScene } from './EquipmentScene';

const save = vi.fn();

type EquipmentHarness = {
  selectUnit: (instanceId: string) => void;
  equip: (instanceId: string) => void;
  unequip: (instanceId: string) => void;
  save: () => Promise<void>;
  draftSession: GameSession;
  savedSession: GameSession;
  selectedUnitId: string | null;
};

function createHarness(session: GameSession) {
  const view: EquipmentView & { render: ReturnType<typeof vi.fn> } = {
    element: {} as HTMLElement,
    showDetail: vi.fn(),
    render: vi.fn(),
  };
  const onBack = vi.fn();
  const scene = new EquipmentScene({
    services: { auth: {} as never, saveSlots: { save } as never, battle: {} as never },
    backgroundImageUrl: '/tcg/ui/title-screen.png',
    assetBaseUrl: '/tcg',
    session,
    onBack,
    view,
  }) as unknown as EquipmentHarness;

  return { scene, view, onBack };
}

function lastModel(view: { render: ReturnType<typeof vi.fn> }): EquipmentViewModel {
  const call = view.render.mock.calls.at(-1);
  if (!call) {
    throw new Error('render was never called');
  }

  return call[0] as EquipmentViewModel;
}

async function createSession(): Promise<GameSession> {
  return createGameSession(await createInitialSaveState({ slotId: 1 }));
}

function findEquipment(session: GameSession): string | null {
  return (
    session.collection.cards.find((card) => card.definition.type === 'EQUIPMENT')?.instance
      .instanceId ?? null
  );
}

describe('EquipmentScene', () => {
  beforeEach(() => {
    save.mockReset();
  });

  it('첫 덱 카드를 기본 대상으로 고른다', async () => {
    const session = await createSession();
    const { scene } = createHarness(session);

    expect(scene.selectedUnitId).toBe(session.deck.cards[0]?.instance.instanceId ?? null);
  });

  it('장비를 장착하면 장착표가 늘고 dirty가 된다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);
    const equipmentId = findEquipment(session);

    if (!equipmentId) {
      return;
    }

    scene.equip(equipmentId);

    expect(scene.draftSession.equipment.equipped).toHaveLength(
      session.equipment.equipped.length + 1,
    );
    expect(lastModel(view).isDirty).toBe(true);
  });

  it('장착한 장비를 해제하면 장착표에서 빠진다', async () => {
    const session = await createSession();
    const { scene } = createHarness(session);
    const equipmentId = findEquipment(session);

    if (!equipmentId) {
      return;
    }

    scene.equip(equipmentId);
    scene.unequip(equipmentId);

    expect(scene.draftSession.equipment.equipped).toHaveLength(session.equipment.equipped.length);
  });

  it('없는 장비를 장착하려 하면 draft를 바꾸지 않고 오류를 알린다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);

    scene.equip('없는-장비');

    expect(scene.draftSession).toBe(session);
    expect(lastModel(view).statusIsError).toBe(true);
    expect(lastModel(view).isDirty).toBe(false);
  });

  it('대상 없이 장착하려 하면 거절한다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);
    scene.selectedUnitId = null;

    scene.equip('무엇이든');

    expect(scene.draftSession).toBe(session);
    expect(lastModel(view).statusIsError).toBe(true);
  });

  it('바뀐 것이 없으면 저장을 보내지 않는다', async () => {
    const { scene } = createHarness(await createSession());

    await scene.save();

    expect(save).not.toHaveBeenCalled();
  });

  it('저장이 실패하면 dirty를 유지한다', async () => {
    const session = await createSession();
    const { scene, view } = createHarness(session);
    const equipmentId = findEquipment(session);

    if (!equipmentId) {
      return;
    }

    scene.equip(equipmentId);
    save.mockRejectedValue(new Error('network down'));

    await scene.save();

    expect(lastModel(view).isDirty).toBe(true);
    expect(lastModel(view).statusIsError).toBe(true);
  });
});
