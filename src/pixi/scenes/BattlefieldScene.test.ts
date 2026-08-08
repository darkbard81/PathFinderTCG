import { describe, expect, it, vi } from 'vitest';
import type {
  BattleDragSource,
  BattlefieldView,
  BattlefieldViewModel,
} from '../../dom/screens/battlefield-view';
import { applyTurnEnd, listAttackActions, listBlockActions } from '../../game/battle/battle-engine';
import {
  INITIAL_HAND_SIZE,
  type BattleBlockDecision,
  type BattleCardRuntimeState,
  type BattleRuntimeState,
  type BattleSlotId,
} from '../../game/battle/types';
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

/** Scene의 비공개 조작을 테스트에서 직접 부르기 위한 표면이다. */
type BattlefieldHarness = Pick<BattlefieldScene, 'resize'> & {
  runtime: BattleRuntimeState;
  resolveTargets: (source: BattleDragSource) => BattleSlotId[];
  applyDrop: (source: BattleDragSource, slotId: BattleSlotId) => void;
  endTurn: () => void;
  resolveBlock: (blockerInstanceId: string | null) => void;
  pendingBlock: { decision: BattleBlockDecision; actionCount: number } | null;
};

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

  return { scene: scene as unknown as BattlefieldHarness, view, onLeave };
}

function findSlot(model: BattlefieldViewModel, slotId: BattleSlotId) {
  return Object.values(model.slots)
    .flat()
    .find((slot) => slot.slotId === slotId);
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

describe('BattlefieldScene 손패 배치', () => {
  /** 리더 인접 칸에 실제로 놓을 수 있는 손패 카드 하나를 찾는다. */
  function findPlaceableCard(
    scene: BattlefieldHarness,
    model: BattlefieldViewModel,
  ): { instanceId: string; slotId: BattleSlotId } | null {
    for (const card of model.hand) {
      const [slotId] = scene.resolveTargets({ kind: 'hand', cardInstanceId: card.tile.instanceId });
      if (slotId) {
        return { instanceId: card.tile.instanceId, slotId };
      }
    }

    return null;
  }

  it('놓을 칸이 있는 카드만 playable로 표시한다', async () => {
    const { scene, view } = createHarness(await createSession());

    for (const card of lastModel(view).hand) {
      expect(card.playable).toBe(
        scene.resolveTargets({ kind: 'hand', cardInstanceId: card.tile.instanceId }).length > 0,
      );
    }
  });

  it('후보 칸은 전부 내 진영의 빈 칸이다', async () => {
    const { scene, view } = createHarness(await createSession());
    const model = lastModel(view);

    for (const card of model.hand) {
      for (const slotId of scene.resolveTargets({
        kind: 'hand',
        cardInstanceId: card.tile.instanceId,
      })) {
        expect(slotId.startsWith('player:')).toBe(true);
        expect(findSlot(model, slotId)?.card).toBeNull();
      }
    }
  });

  it('후보 칸에 놓으면 전장에 올라가고 손패에서 빠진다', async () => {
    const { scene, view } = createHarness(await createSession());
    const target = findPlaceableCard(scene, lastModel(view));

    if (!target) {
      throw new Error('놓을 수 있는 손패 카드가 없다');
    }

    scene.applyDrop({ kind: 'hand', cardInstanceId: target.instanceId }, target.slotId);
    const model = lastModel(view);

    expect(findSlot(model, target.slotId)?.card?.instanceId).toBe(target.instanceId);
    expect(model.hand).toHaveLength(INITIAL_HAND_SIZE - 1);
    expect(model.hand.map((card) => card.tile.instanceId)).not.toContain(target.instanceId);
  });

  it('카드를 놓으면 그 카드에 인접한 빈 칸의 지배력이 오른다', async () => {
    const { scene, view } = createHarness(await createSession());
    const target = findPlaceableCard(scene, lastModel(view));

    if (!target) {
      throw new Error('놓을 수 있는 손패 카드가 없다');
    }

    const before = lastModel(view);
    scene.applyDrop({ kind: 'hand', cardInstanceId: target.instanceId }, target.slotId);
    const after = lastModel(view);

    // 방금 채운 칸 자신은 카드가 생겼으니 제외하고, 나머지 빈 칸의 지배력 합계를 비교한다.
    const sumDominance = (model: BattlefieldViewModel): number =>
      Object.values(model.slots)
        .flat()
        .filter((slot) => slot.slotId !== target.slotId)
        .reduce((total, slot) => total + (slot.dominance ?? 0), 0);

    expect(sumDominance(after)).toBeGreaterThan(sumDominance(before));
  });

  it('후보가 아닌 칸에 놓으면 전장을 건드리지 않고 오류로 알린다', async () => {
    const { scene, view } = createHarness(await createSession());
    const cardId = lastModel(view).hand[0]?.tile.instanceId;

    if (!cardId) {
      throw new Error('손패가 비어 있다');
    }

    // enemy 진영 칸은 어떤 손패 카드로도 후보가 되지 않는다.
    scene.applyDrop({ kind: 'hand', cardInstanceId: cardId }, 'enemy:FC');
    const model = lastModel(view);

    expect(model.statusIsError).toBe(true);
    expect(model.hand).toHaveLength(INITIAL_HAND_SIZE);
    expect(findSlot(model, 'enemy:FC')?.card).toBeNull();
  });

  it('놓을 곳이 없는 카드는 후보 목록도 비어 있다', async () => {
    const { scene, view } = createHarness(await createSession());
    const unplayable = lastModel(view).hand.find((card) => !card.playable);

    if (!unplayable) {
      return;
    }

    expect(
      scene.resolveTargets({ kind: 'hand', cardInstanceId: unplayable.tile.instanceId }),
    ).toEqual([]);
  });
});

describe('BattlefieldScene 전장 카드 조작', () => {
  /** 내 리더는 시작부터 전장에 있고 인접 빈 칸이 있어서 이동 검증의 고정 기준으로 쓰기 좋다. */
  function readLeaderId(model: BattlefieldViewModel): string {
    const leader = findSlot(model, 'player:BC')?.card;
    if (!leader) {
      throw new Error('내 리더가 전장에 없다');
    }

    return leader.instanceId;
  }

  it('시작 상태에서는 어느 카드도 공격할 수 없다', async () => {
    const { scene, view } = createHarness(await createSession());
    const leaderId = readLeaderId(lastModel(view));

    // 양측 리더가 후위에 있다. 후위 카드는 기본 공격을 못 하므로 후보는 전부 내 진영 빈 칸이다.
    for (const slotId of scene.resolveTargets({ kind: 'card', cardInstanceId: leaderId })) {
      expect(slotId.startsWith('player:')).toBe(true);
      expect(findSlot(lastModel(view), slotId)?.card).toBeNull();
    }
  });

  it('내 카드는 ready, 적 카드는 판정하지 않는다', async () => {
    const { view } = createHarness(await createSession());
    const model = lastModel(view);

    expect(findSlot(model, 'player:BC')?.ready).toBe(true);
    expect(findSlot(model, 'enemy:BC')?.ready).toBeNull();
    expect(findSlot(model, 'enemy:BC')?.skills).toEqual([]);
  });

  it('빈 칸은 ready를 판정하지 않는다', async () => {
    const { view } = createHarness(await createSession());

    expect(findSlot(lastModel(view), 'player:FL')?.ready).toBeNull();
  });

  it('인접 빈 칸으로 옮기면 카드가 그 칸으로 간다', async () => {
    const { scene, view } = createHarness(await createSession());
    const leaderId = readLeaderId(lastModel(view));

    scene.applyDrop({ kind: 'card', cardInstanceId: leaderId }, 'player:FC');
    const model = lastModel(view);

    expect(findSlot(model, 'player:FC')?.card?.instanceId).toBe(leaderId);
    expect(findSlot(model, 'player:BC')?.card).toBeNull();
  });

  it('이번 턴에 이동한 카드는 다시 이동할 수 없다', async () => {
    const { scene, view } = createHarness(await createSession());
    const leaderId = readLeaderId(lastModel(view));

    scene.applyDrop({ kind: 'card', cardInstanceId: leaderId }, 'player:FC');

    expect(scene.resolveTargets({ kind: 'card', cardInstanceId: leaderId })).toEqual([]);
    expect(findSlot(lastModel(view), 'player:FC')?.ready).toBe(false);
  });

  it('인접하지 않은 칸으로는 옮길 수 없다', async () => {
    const { scene, view } = createHarness(await createSession());
    const leaderId = readLeaderId(lastModel(view));

    // player:BC에서 player:FL은 대각선이라 인접이 아니다.
    scene.applyDrop({ kind: 'card', cardInstanceId: leaderId }, 'player:FL');
    const model = lastModel(view);

    expect(model.statusIsError).toBe(true);
    expect(findSlot(model, 'player:BC')?.card?.instanceId).toBe(leaderId);
    expect(findSlot(model, 'player:FL')?.card).toBeNull();
  });

  it('전위로 나간 카드는 다음 턴에 적을 공격할 수 있다', async () => {
    const { scene, view } = createHarness(await createSession());
    const leaderId = readLeaderId(lastModel(view));

    // 등장 턴에는 공격할 수 없다. 내 턴 → 적 턴 → 내 턴으로 넘겨 등장 턴을 벗어난다.
    applyTurnEnd(scene.runtime);
    applyTurnEnd(scene.runtime);
    scene.resize({ width: 1024, height: 768, scale: 1 });
    scene.applyDrop({ kind: 'card', cardInstanceId: leaderId }, 'player:FC');

    const targets = scene.resolveTargets({ kind: 'card', cardInstanceId: leaderId });
    // 적 전위가 비어 있으면 후위의 적 리더까지 닿는다.
    expect(targets).toContain('enemy:BC');

    const before = findSlot(lastModel(view), 'enemy:BC')?.card?.hp ?? 0;
    scene.applyDrop({ kind: 'card', cardInstanceId: leaderId }, 'enemy:BC');
    const after = lastModel(view);

    expect(after.statusIsError).toBe(false);
    expect(findSlot(after, 'enemy:BC')?.card?.hp ?? 0).toBeLessThan(before);
  });

  it('스킬 배지는 지금 쓸 수 있는 스킬만 만든다', async () => {
    const { scene, view } = createHarness(await createSession());
    const model = lastModel(view);

    for (const slot of Object.values(model.slots).flat()) {
      for (const skill of slot.skills) {
        const cardInstanceId = slot.card?.instanceId ?? '';
        expect(
          scene.resolveTargets({ kind: 'skill', cardInstanceId, skillId: skill.skillId }).length,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('스킬 대상이 아닌 칸에 놓으면 전장을 건드리지 않는다', async () => {
    const { scene, view } = createHarness(await createSession());
    const leaderId = readLeaderId(lastModel(view));

    scene.applyDrop(
      { kind: 'skill', cardInstanceId: leaderId, skillId: 'unknown_skill' },
      'enemy:BC',
    );

    expect(lastModel(view).statusIsError).toBe(true);
  });
});

describe('BattlefieldScene 턴 진행', () => {
  it('내 차례에는 턴을 넘길 수 있다', async () => {
    const { view } = createHarness(await createSession());

    expect(lastModel(view).canEndTurn).toBe(true);
  });

  it('턴을 넘기면 적 차례가 끝나고 다시 내 차례로 돌아온다', async () => {
    const { scene, view } = createHarness(await createSession());

    scene.endTurn();
    const model = lastModel(view);

    // 적 자동 턴은 한 번에 끝까지 돈다. 첫 턴에는 방어 후보가 없어 중간에 멈추지 않는다.
    expect(model.blockPrompt).toBeNull();
    expect(model.currentSide).toBe('player');
    expect(model.turnNumber).toBe(2);
  });

  it('턴을 넘기면 양쪽 다 카드를 한 장씩 뽑는다', async () => {
    const { scene, view } = createHarness(await createSession());
    const before = lastModel(view);

    scene.endTurn();
    const after = lastModel(view);

    expect(after.player.deckCount).toBe(before.player.deckCount - 1);
    expect(after.enemy.deckCount).toBeLessThan(before.enemy.deckCount);
  });

  it('적 차례의 행동이 기록에 남는다', async () => {
    const { scene, view } = createHarness(await createSession());

    scene.endTurn();
    const log = lastModel(view).log;

    expect(log[0]).toBe('나: 턴을 넘겼다');
    expect(log.some((line) => line.startsWith('적 차례 시작'))).toBe(true);
  });

  it('내 행동도 기록에 남는다', async () => {
    const { scene, view } = createHarness(await createSession());
    const leaderId = findSlot(lastModel(view), 'player:BC')?.card?.instanceId ?? '';

    scene.applyDrop({ kind: 'card', cardInstanceId: leaderId }, 'player:FC');

    expect(lastModel(view).log).toEqual(['나: 카드를 이동했습니다.']);
  });

  it('실패한 행동은 기록에 남기지 않는다', async () => {
    const { scene, view } = createHarness(await createSession());
    const leaderId = findSlot(lastModel(view), 'player:BC')?.card?.instanceId ?? '';

    scene.applyDrop({ kind: 'card', cardInstanceId: leaderId }, 'player:FL');

    expect(lastModel(view).log).toEqual([]);
  });

  it('승패가 나면 결과를 넘기고 턴 종료를 막는다', async () => {
    const { scene, view } = createHarness(await createSession());

    for (let turn = 0; turn < 60 && !lastModel(view).result; turn += 1) {
      if (lastModel(view).blockPrompt) {
        scene.resolveBlock(null);
        continue;
      }
      scene.endTurn();
    }

    const model = lastModel(view);

    // 내가 아무것도 하지 않으면 리더가 맞아 죽는다. 결과는 반드시 난다.
    expect(model.result?.title).toBe('패배');
    expect(model.canEndTurn).toBe(false);
    expect(model.phaseLabel).toBe('종료');
  });
});

/**
 * 방어 선택은 `guardian_block` 능력을 가진 카드가 있어야 생긴다.
 * 지금 배포되는 덱에는 그 능력이 없어서 실제 대전으로는 이 경로에 닿지 않는다.
 * 엔진은 이미 지원하므로, 상황을 직접 세워 UI 배선만 검증한다.
 */
describe('BattlefieldScene 방어 선택', () => {
  function placeOnField(
    runtime: BattleRuntimeState,
    card: BattleCardRuntimeState,
    slotId: BattleSlotId,
  ): void {
    const participant = card.side === 'player' ? runtime.player : runtime.enemy;
    participant.hand = participant.hand.filter((candidate) => candidate !== card);
    card.zone = 'BATTLEFIELD';
    card.battlefieldSlot = slotId;
    // 등장 턴에는 공격할 수 없다. 0턴에 나온 것으로 두어 그 제한을 벗어난다.
    card.enteredBattlefieldTurnNumber = 0;
    card.handIndex = null;
    runtime.battlefield.push(card);
  }

  async function createBlockScenario() {
    const harness = createHarness(await createSession());
    const { runtime } = harness.scene;

    const [target, blocker] = runtime.player.hand;
    const [attacker] = runtime.enemy.hand;
    if (!target || !blocker || !attacker) {
      throw new Error('시나리오를 세울 손패가 모자라다');
    }

    placeOnField(runtime, target, 'player:FC');
    placeOnField(runtime, blocker, 'player:FR');
    placeOnField(runtime, attacker, 'enemy:FC');
    // 정의는 같은 카드끼리 공유한다. 능력을 붙이기 전에 이 인스턴스 몫으로 복사한다.
    blocker.card = {
      instance: blocker.card.instance,
      definition: {
        ...blocker.card.definition,
        abilities: [
          ...blocker.card.definition.abilities,
          { id: 'guardian_block', category: 'GLOBAL', name: '수호', text: '' },
        ],
      },
    };
    attacker.card.instance.attack = 3;
    target.card.instance.hp = 9;
    blocker.card.instance.hp = 9;
    runtime.currentSide = 'enemy';

    const [attackAction] = listAttackActions(runtime, 'enemy').filter(
      (action) =>
        action.attackerInstanceId === attacker.card.instance.instanceId &&
        action.targetInstanceId === target.card.instance.instanceId,
    );
    if (!attackAction) {
      throw new Error('세운 상황에서 합법 공격이 나오지 않았다');
    }

    const blockActions = listBlockActions(runtime, attackAction);
    harness.scene.pendingBlock = { decision: { attackAction, blockActions }, actionCount: 0 };
    harness.scene.resize({ width: 1024, height: 768, scale: 1 });

    return { ...harness, target, blocker, attacker };
  }

  it('막을 수 있는 유닛을 물음으로 내놓는다', async () => {
    const { view, blocker } = await createBlockScenario();
    const prompt = lastModel(view).blockPrompt;

    expect(prompt?.blockers.map((option) => option.instanceId)).toEqual([
      blocker.card.instance.instanceId,
    ]);
    expect(prompt?.message).toContain('3 피해');
  });

  it('방어를 고르는 동안에는 턴을 넘길 수 없다', async () => {
    const { view } = await createBlockScenario();

    expect(lastModel(view).canEndTurn).toBe(false);
  });

  it('막기를 고르면 원래 대상 대신 막은 유닛이 맞는다', async () => {
    const { scene, view, target, blocker } = await createBlockScenario();

    scene.resolveBlock(blocker.card.instance.instanceId);

    expect(lastModel(view).blockPrompt).toBeNull();
    expect(blocker.card.instance.hp).toBe(6);
    expect(target.card.instance.hp).toBe(9);
  });

  it('막지 않기를 고르면 원래 대상이 그대로 맞는다', async () => {
    const { scene, view, target, blocker } = await createBlockScenario();

    scene.resolveBlock(null);

    expect(lastModel(view).blockPrompt).toBeNull();
    expect(target.card.instance.hp).toBe(6);
    expect(blocker.card.instance.hp).toBe(9);
  });
});
