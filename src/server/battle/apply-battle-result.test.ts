import { describe, expect, it } from 'vitest';
import { ALL_CARD_DEFINITIONS } from '../../game/save/auto-card-catalog';
import { BATTLE_PARTICIPATION_EXP } from '../../game/save/card-growth';
import { createInitialSaveState } from '../../game/save/create-initial-save';
import type { SaveSlotState } from '../../game/save/types';
import type { StageBattleResult } from '../../game/stage/types';
import { applyBattleResultToSaveSlot } from './apply-battle-result';

const STAGE_ID = 'level01';

function createWinResult(state: SaveSlotState): StageBattleResult {
  return {
    stageId: STAGE_ID,
    outcome: 'WIN',
    reason: 'ENEMY_LEADER_DEFEATED',
    rewardCards: [],
    rewardCardInstanceIds: [],
    rewardCardNames: [],
    growth: {
      expPerCard: BATTLE_PARTICIPATION_EXP,
      cardInstanceIds: [state.deck.leader.instanceId],
      cardNames: [state.deck.leader.name],
    },
    turnNumber: 4,
  };
}

describe('applyBattleResultToSaveSlot', () => {
  it('참여 EXP를 저장 슬롯에 적는다', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const next = applyBattleResultToSaveSlot({
      state,
      result: createWinResult(state),
      cardDefinitions: ALL_CARD_DEFINITIONS,
    });

    expect(state.deck.leader.exp).toBe(0);
    expect(next.deck.leader.exp).toBe(BATTLE_PARTICIPATION_EXP);
  });

  it('이긴 스테이지를 클리어 목록에 넣는다', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const next = applyBattleResultToSaveSlot({
      state,
      result: createWinResult(state),
      cardDefinitions: ALL_CARD_DEFINITIONS,
    });

    expect(next.stageProgress.clearedStageIds).toContain(STAGE_ID);
    expect(next.stageProgress.lastSelectedStageId).toBe(STAGE_ID);
  });

  it('보상 카드를 컬렉션에 넣는다', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const rewardCard = {
      ...structuredClone(state.deck.cards[0]!),
      instanceId: 'reward-1',
      zone: 'COLLECTION' as const,
    };
    const next = applyBattleResultToSaveSlot({
      state,
      result: {
        ...createWinResult(state),
        rewardCards: [rewardCard],
        rewardCardInstanceIds: [rewardCard.instanceId],
        rewardCardNames: [rewardCard.name],
      },
      cardDefinitions: ALL_CARD_DEFINITIONS,
    });

    expect(next.collection.cards.map((card) => card.instanceId)).toContain('reward-1');
    expect(state.collection.cards.map((card) => card.instanceId)).not.toContain('reward-1');
  });

  it('진 판은 클리어 목록을 늘리지 않는다', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const next = applyBattleResultToSaveSlot({
      state,
      result: {
        ...createWinResult(state),
        outcome: 'LOSE',
        reason: 'PLAYER_LEADER_DEFEATED',
        growth: { expPerCard: 0, cardInstanceIds: [], cardNames: [] },
      },
      cardDefinitions: ALL_CARD_DEFINITIONS,
    });

    expect(next.stageProgress.clearedStageIds).toEqual([]);
    expect(next.deck.leader.exp).toBe(0);
  });

  it('원본 저장 상태를 바꾸지 않는다', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const snapshot = structuredClone(state);
    applyBattleResultToSaveSlot({
      state,
      result: createWinResult(state),
      cardDefinitions: ALL_CARD_DEFINITIONS,
    });

    expect(state).toEqual(snapshot);
  });
});
