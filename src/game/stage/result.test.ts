import { describe, expect, it } from 'vitest';
import { createInitialBattleRuntime } from '../battle/create-battle-runtime';
import type { BattleCardRuntimeState, BattleRuntimeState } from '../battle/types';
import { CARD_DEFINITIONS } from '../save/card-catalog';
import { createInitialSaveState } from '../save/create-initial-save';
import { createGameSession, createSaveSlotStateFromGameSession } from '../save/session';
import type { CardInstance } from '../save/types';
import type { StageGrowthResult } from './types';
import { requireStageDefinition } from './stage-definitions';
import {
  applyStageBattleResultToSession,
  calculateStageRewards,
  createStageBattleResult,
} from './result';

const TEST_STAGE_DEFINITION = requireStageDefinition('test-stage-dark');

describe('stage battle result', () => {
  it('maps enemy leader defeat to a win result', async () => {
    const runtime = await createRuntime();
    runtime.phase = 'GAME_OVER';
    runtime.outcome = {
      winner: 'player',
      loser: 'enemy',
      reason: 'LEADER_DEFEATED',
    };

    const result = createStageBattleResult(runtime, TEST_STAGE_DEFINITION, {
      random: () => 1,
    });

    expect(result).toMatchObject({
      stageId: 'test-stage-dark',
      outcome: 'WIN',
      reason: 'ENEMY_LEADER_DEFEATED',
      turnNumber: 1,
      rewardCards: [],
      rewardCardInstanceIds: [],
      rewardCardNames: [],
      growth: {
        expPerCard: 100,
        cardInstanceIds: expect.arrayContaining([
          runtime.player.leader.card.instance.instanceId,
          runtime.player.hand[0]!.card.instance.instanceId,
        ]),
      },
    });
  });

  it('maps player leader defeat to a lose result without rewards', async () => {
    const runtime = await createRuntime();
    moveEnemyDeckCardToDrop(runtime, 'unit_dark_guardian_001');
    runtime.phase = 'GAME_OVER';
    runtime.outcome = {
      winner: 'enemy',
      loser: 'player',
      reason: 'LEADER_DEFEATED',
    };

    const result = createStageBattleResult(runtime, TEST_STAGE_DEFINITION, {
      random: () => 0,
    });

    expect(result).toMatchObject({
      outcome: 'LOSE',
      reason: 'PLAYER_LEADER_DEFEATED',
      rewardCards: [],
      rewardCardInstanceIds: [],
      rewardCardNames: [],
      growth: {
        expPerCard: 0,
        cardInstanceIds: [],
        cardNames: [],
      },
    });
  });

  it('selects only enemy unit cards from drop rewards', async () => {
    const runtime = await createRuntime();
    const enemyUnit = moveEnemyDeckCardToDrop(runtime, 'unit_dark_guardian_001');
    movePlayerHandCardToEnemyDrop(runtime);
    runtime.enemy.drop.push(runtime.enemy.leader);

    const rewards = calculateStageRewards(
      runtime,
      {
        ...TEST_STAGE_DEFINITION,
        rewards: {
          ...TEST_STAGE_DEFINITION.rewards,
          enemyCardDrop: {
            source: 'ENEMY_DROP',
            chancePercent: 100,
            maxCards: 3,
            excludeLeader: true,
          },
        },
      },
      { random: () => 0, createRewardCardId: () => 'reward-card-1' },
    );

    expect(rewards).toEqual({
      rewardCards: [
        expect.objectContaining({
          id: enemyUnit.card.definition.id,
          instanceId: 'reward-card-1',
          owner: 'PLAYER',
          zone: 'COLLECTION',
        }),
      ],
      rewardCardInstanceIds: ['reward-card-1'],
      rewardCardNames: [enemyUnit.card.instance.name],
    });
  });

  it('honors reward chance and maximum count', async () => {
    const runtime = await createRuntime();
    const firstUnit = moveEnemyDeckCardToDrop(runtime, 'unit_dark_guardian_001');
    const firstUnitOriginalHp = firstUnit.card.definition.hp ?? 0;
    firstUnit.card.instance.hp = 1;
    moveEnemyDeckCardToDrop(runtime, 'unit_dark_archer_001');

    const rewards = calculateStageRewards(
      runtime,
      {
        ...TEST_STAGE_DEFINITION,
        rewards: {
          ...TEST_STAGE_DEFINITION.rewards,
          enemyCardDrop: {
            source: 'ENEMY_DROP',
            chancePercent: 50,
            maxCards: 1,
            excludeLeader: true,
          },
        },
      },
      { random: () => 0.49, createRewardCardId: () => 'reward-first' },
    );

    expect(rewards.rewardCardInstanceIds).toEqual(['reward-first']);
    expect(rewards.rewardCardNames).toEqual([firstUnit.card.instance.name]);
    expect(rewards.rewardCards[0]).toMatchObject({
      id: firstUnit.card.definition.id,
      instanceId: 'reward-first',
      hp: firstUnitOriginalHp,
      owner: 'PLAYER',
      zone: 'COLLECTION',
    });
  });

  it('updates stage progress for wins without duplicating cleared stage ids', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession({
      ...state,
      stageProgress: {
        clearedStageIds: ['test-stage-dark'],
        lastSelectedStageId: null,
      },
    });

    const nextSession = applyStageBattleResultToSession(session, {
      stageId: 'test-stage-dark',
      outcome: 'WIN',
      reason: 'ENEMY_LEADER_DEFEATED',
      rewardCards: [],
      rewardCardInstanceIds: [],
      rewardCardNames: [],
      growth: createStageGrowthResult(),
      turnNumber: 1,
    });

    expect(nextSession.stageProgress).toEqual({
      clearedStageIds: ['test-stage-dark'],
      lastSelectedStageId: 'test-stage-dark',
    });
  });

  it('adds win rewards to the session collection without changing the battle deck', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const rewardCard = createRewardCard(state.deck.cards[0]!, 'reward-card-1');

    const nextSession = applyStageBattleResultToSession(session, {
      stageId: 'test-stage-dark',
      outcome: 'WIN',
      reason: 'ENEMY_LEADER_DEFEATED',
      rewardCards: [rewardCard],
      rewardCardInstanceIds: [rewardCard.instanceId],
      rewardCardNames: [rewardCard.name],
      growth: createStageGrowthResult(),
      turnNumber: 1,
    });
    const savedState = createSaveSlotStateFromGameSession(nextSession, {
      now: new Date('2024-01-02T00:00:00.000Z'),
    });
    const reloadedSession = createGameSession(savedState);

    expect(nextSession.deck.cards).toHaveLength(session.deck.cards.length);
    expect(savedState.collection.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instanceId: 'reward-card-1',
          owner: 'PLAYER',
          zone: 'COLLECTION',
        }),
      ]),
    );
    expect(reloadedSession.collection.cards.map((card) => card.instance.instanceId)).toContain(
      'reward-card-1',
    );
  });

  it('preserves cleared stage ids for losses', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession({
      ...state,
      stageProgress: {
        clearedStageIds: [],
        lastSelectedStageId: null,
      },
    });

    const nextSession = applyStageBattleResultToSession(session, {
      stageId: 'test-stage-dark',
      outcome: 'LOSE',
      reason: 'PLAYER_LEADER_DEFEATED',
      rewardCards: [createRewardCard(state.deck.cards[0]!, 'ignored-reward')],
      rewardCardInstanceIds: [],
      rewardCardNames: [],
      growth: createStageGrowthResult(),
      turnNumber: 1,
    });

    expect(nextSession.stageProgress).toEqual({
      clearedStageIds: [],
      lastSelectedStageId: 'test-stage-dark',
    });
    expect(nextSession.collection.cards.map((card) => card.definition.id)).toEqual(
      CARD_DEFINITIONS.filter((definition) => definition.type === 'EQUIPMENT').map(
        (definition) => definition.id,
      ),
    );
  });

  it('does not apply battle participation exp after a defeat', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const runtime = createInitialBattleRuntime(session, TEST_STAGE_DEFINITION);
    runtime.phase = 'GAME_OVER';
    runtime.outcome = {
      winner: 'enemy',
      loser: 'player',
      reason: 'LEADER_DEFEATED',
    };

    const result = createStageBattleResult(runtime, TEST_STAGE_DEFINITION);
    const nextSession = applyStageBattleResultToSession(session, result);

    expect(result.growth).toEqual({
      expPerCard: 0,
      cardInstanceIds: [],
      cardNames: [],
    });
    expect(nextSession.deck.leader.instance.exp).toBe(session.deck.leader.instance.exp);
    expect(nextSession.deck.cards.map((card) => card.instance.exp)).toEqual(
      session.deck.cards.map((card) => card.instance.exp),
    );
  });

  it('does not persist battle-time player stat changes after applying a stage result', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const originalLeaderStats = {
      hp: session.deck.leader.instance.hp,
      attack: session.deck.leader.instance.attack,
      cost: session.deck.leader.instance.cost,
      dominance: session.deck.leader.instance.dominance,
    };
    const originalFirstCardStats = {
      hp: session.deck.cards[0]!.instance.hp,
      attack: session.deck.cards[0]!.instance.attack,
      cost: session.deck.cards[0]!.instance.cost,
      dominance: session.deck.cards[0]!.instance.dominance,
    };
    const runtime = createInitialBattleRuntime(session, TEST_STAGE_DEFINITION);

    runtime.player.leader.card.instance.hp = 1;
    runtime.player.leader.card.instance.attack = 1;
    runtime.player.leader.card.instance.cost = 0;
    runtime.player.leader.card.instance.dominance = 0;
    runtime.player.hand[0]!.card.instance.hp = 1;
    runtime.player.hand[0]!.card.instance.attack = 1;
    runtime.player.hand[0]!.card.instance.cost = 0;
    runtime.player.hand[0]!.card.instance.dominance = 0;
    runtime.phase = 'GAME_OVER';
    runtime.outcome = {
      winner: 'player',
      loser: 'enemy',
      reason: 'LEADER_DEFEATED',
    };

    const result = createStageBattleResult(runtime, TEST_STAGE_DEFINITION, {
      random: () => 1,
    });
    const nextSession = applyStageBattleResultToSession(session, result);
    const savedState = createSaveSlotStateFromGameSession(nextSession, {
      now: new Date('2024-01-02T00:00:00.000Z'),
    });

    expect({
      hp: savedState.deck.leader.hp,
      attack: savedState.deck.leader.attack,
      cost: savedState.deck.leader.cost,
      dominance: savedState.deck.leader.dominance,
    }).toEqual({
      ...originalLeaderStats,
      hp: (originalLeaderStats.hp ?? 0) + 1,
      attack: (originalLeaderStats.attack ?? 0) + 1,
    });
    expect({
      hp: savedState.deck.cards[0]!.hp,
      attack: savedState.deck.cards[0]!.attack,
      cost: savedState.deck.cards[0]!.cost,
      dominance: savedState.deck.cards[0]!.dominance,
    }).toEqual({
      ...originalFirstCardStats,
      hp: (originalFirstCardStats.hp ?? 0) + 1,
    });
  });

  it('applies battle participation exp and level growth to the saved deck', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const targetCard = session.deck.cards[0]!;

    const nextSession = applyStageBattleResultToSession(session, {
      stageId: 'test-stage-dark',
      outcome: 'WIN',
      reason: 'ENEMY_LEADER_DEFEATED',
      rewardCards: [],
      rewardCardInstanceIds: [],
      rewardCardNames: [],
      growth: createStageGrowthResult({
        expPerCard: 500,
        cardInstanceIds: [targetCard.instance.instanceId],
        cardNames: [targetCard.instance.name],
      }),
      turnNumber: 1,
    });
    const savedState = createSaveSlotStateFromGameSession(nextSession, {
      now: new Date('2024-01-02T00:00:00.000Z'),
    });
    const reloadedSession = createGameSession(savedState);
    const reloadedTarget = reloadedSession.deck.cards[0]!;

    expect(reloadedTarget.instance.exp).toBe(500);
    expect(reloadedTarget.instance.level).toBe(4);
    expect(reloadedTarget.instance.hp).toBe((targetCard.instance.hp ?? 0) + 2);
    expect(reloadedTarget.instance.attack).toBe((targetCard.instance.attack ?? 0) + 2);
  });
});

async function createRuntime(): Promise<BattleRuntimeState> {
  const state = await createInitialSaveState({ slotId: 1 });
  return createInitialBattleRuntime(createGameSession(state), TEST_STAGE_DEFINITION);
}

function createRewardCard(card: CardInstance, instanceId: string): CardInstance {
  return {
    ...structuredClone(card),
    instanceId,
    owner: 'PLAYER',
    zone: 'COLLECTION',
  };
}

function createStageGrowthResult(overrides: Partial<StageGrowthResult> = {}): StageGrowthResult {
  return {
    expPerCard: 0,
    cardInstanceIds: [],
    cardNames: [],
    ...overrides,
  };
}

function moveEnemyDeckCardToDrop(
  runtime: BattleRuntimeState,
  definitionId: string,
): BattleCardRuntimeState {
  const card = runtime.enemy.deck.find(
    (candidate) => candidate.card.definition.id === definitionId,
  );
  if (!card) {
    throw new Error(`Missing enemy deck card: ${definitionId}`);
  }

  runtime.enemy.deck = runtime.enemy.deck.filter((candidate) => candidate !== card);
  card.zone = 'DROP';
  card.deckIndex = null;
  runtime.enemy.drop.push(card);
  runtime.drop.push(card);
  return card;
}

function movePlayerHandCardToEnemyDrop(runtime: BattleRuntimeState): void {
  const card = runtime.player.hand[0];
  if (!card) {
    throw new Error('Missing player hand card');
  }

  runtime.player.hand = runtime.player.hand.filter((candidate) => candidate !== card);
  card.side = 'enemy';
  card.zone = 'DROP';
  runtime.enemy.drop.push(card);
  runtime.drop.push(card);
}
