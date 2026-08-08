import { describe, expect, it, vi } from 'vitest';
import type { BattlefieldView, BattlefieldViewModel } from '../../dom/screens/battlefield-view';
import { INITIAL_HAND_SIZE } from '../../game/battle/types';
import { createInitialSaveState } from '../../game/save/create-initial-save';
import { createGameSession, type GameSession } from '../../game/save/session';
import { listStageDefinitions } from '../../game/stage/stage-definitions';
import { BattlefieldScene } from './BattlefieldScene';

/** 전투 시작 상태를 매번 같게 만들어 슬롯·손패 검증이 셔플에 흔들리지 않게 한다. */
function fixedRandom(): number {
  return 0;
}

async function createSession(): Promise<GameSession> {
  return createGameSession(await createInitialSaveState({ slotId: 1 }));
}

function createHarness(session: GameSession) {
  const view: BattlefieldView & { render: ReturnType<typeof vi.fn> } = {
    element: {} as HTMLElement,
    render: vi.fn(),
  };
  const onLeave = vi.fn();
  const scene = new BattlefieldScene({
    backgroundImageUrl: '/tcg/ui/title-screen.png',
    assetBaseUrl: '/tcg',
    session,
    stageId: listStageDefinitions()[0]!.id,
    onLeave,
    view,
    random: fixedRandom,
  });

  scene.resize({ width: 1024, height: 768, scale: 1 });

  return { scene, view, onLeave };
}

function lastModel(view: { render: ReturnType<typeof vi.fn> }): BattlefieldViewModel {
  const call = view.render.mock.calls.at(-1);
  if (!call) {
    throw new Error('render was never called');
  }

  return call[0] as BattlefieldViewModel;
}

describe('BattlefieldScene', () => {
  it('양측 리더를 각자의 후위 가운데 슬롯에 놓는다', async () => {
    const { view } = createHarness(await createSession());
    const model = lastModel(view);

    const playerBackCenter = model.slots.playerBack.find((slot) => slot.slotId === 'player:BC');
    const enemyBackCenter = model.slots.enemyBack.find((slot) => slot.slotId === 'enemy:BC');

    expect(playerBackCenter?.card).not.toBeNull();
    expect(enemyBackCenter?.card).not.toBeNull();
  });

  it('리더가 놓인 칸 외에는 전부 비어 있다', async () => {
    const { view } = createHarness(await createSession());
    const model = lastModel(view);
    const occupied = Object.values(model.slots)
      .flat()
      .filter((slot) => slot.card !== null)
      .map((slot) => slot.slotId);

    expect(occupied.sort()).toEqual(['enemy:BC', 'player:BC']);
  });

  it('리더에 인접한 빈 칸에 지배력 합계를 적는다', async () => {
    const { view } = createHarness(await createSession());
    const model = lastModel(view);
    // player:BC 리더에 인접한 칸이다. 리더 지배력이 그대로 이 칸의 배치 한도가 된다.
    const adjacent = model.slots.playerFront.find((slot) => slot.slotId === 'player:FC');

    expect(adjacent?.card).toBeNull();
    expect(adjacent?.dominance).toBeGreaterThan(0);
  });

  it('리더와 떨어진 빈 칸은 지배력이 0이다', async () => {
    const { view } = createHarness(await createSession());
    const model = lastModel(view);
    const distant = model.slots.playerFront.find((slot) => slot.slotId === 'player:FL');

    expect(distant?.dominance).toBe(0);
  });

  it('시작 손패를 초기 매수만큼 넘긴다', async () => {
    const { view } = createHarness(await createSession());

    expect(lastModel(view).hand).toHaveLength(INITIAL_HAND_SIZE);
  });

  it('덱 수는 초기 손패를 뺀 나머지다', async () => {
    const session = await createSession();
    const { view } = createHarness(session);
    const model = lastModel(view);

    expect(model.player.deckCount).toBe(session.deck.cards.length - INITIAL_HAND_SIZE);
    expect(model.player.dropCount).toBe(0);
    expect(model.player.exileCount).toBe(0);
  });

  it('첫 차례는 플레이어이고 메인 단계에서 시작한다', async () => {
    const { view } = createHarness(await createSession());
    const model = lastModel(view);

    expect(model.currentSide).toBe('player');
    expect(model.phaseLabel).toBe('메인');
    expect(model.turnNumber).toBe(1);
  });

  it('뷰포트가 바뀌면 카드 크기를 다시 계산해 넘긴다', async () => {
    const { scene, view } = createHarness(await createSession());
    const small = lastModel(view).metrics.cardHeight;

    scene.resize({ width: 1600, height: 1000, scale: 1 });

    expect(lastModel(view).metrics.cardHeight).toBeGreaterThan(small);
  });
});
