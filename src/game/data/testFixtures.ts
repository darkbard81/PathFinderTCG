import type { CardDefinition } from '../cards/card.js';
import type { BattleIdFactory } from '../simulation/BattleDeckFactory.js';
import {
  GAME_DATA_SCHEMA_VERSION,
  type CardCatalog,
  type CardInstance,
  type EnemyDeckBlueprint,
  type OwnedCollection,
  type SavedDeck,
  type SaveSlotState,
  type StageDefinition,
} from './contracts.js';

const UNIT_COSTS = [1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6, 7] as const;

export interface PhaseOneFixtures {
  readonly cardCatalog: CardCatalog;
  readonly leaderDefinition: CardDefinition;
  readonly unitDefinitions: readonly CardDefinition[];
  readonly collection: OwnedCollection;
  readonly deck: SavedDeck;
  readonly enemyDeckBlueprint: EnemyDeckBlueprint;
  readonly stage: StageDefinition;
  readonly saveSlot: SaveSlotState;
}

function createLeaderDefinition(): CardDefinition {
  return {
    id: 'allied-leader',
    name: '아군 리더',
    description: 'Phase 1 데이터 계약 검증용 리더다.',
    type: 'LEADER',
    cost: 0,
    dominance: 1,
    hp: 20,
    attack: 2,
  };
}

function createUnitDefinition(index: number, cost: number): CardDefinition {
  const number = String(index + 1).padStart(2, '0');

  return {
    id: `allied-unit-${number}`,
    name: `아군 유닛 ${number}`,
    description: `Phase 1 데이터 계약 검증용 Cost ${cost} 유닛이다.`,
    type: 'UNIT',
    cost,
    dominance: Math.min(5, Math.ceil(cost / 2)),
    hp: Math.min(10, cost + 2),
    attack: Math.min(7, Math.max(1, cost - 1)),
  };
}

function createUnitInstances(unitDefinitions: readonly CardDefinition[]): readonly CardInstance[] {
  return unitDefinitions.flatMap((definition, definitionIndex) => {
    const quantity = definitionIndex === unitDefinitions.length - 1 ? 1 : 2;

    return Array.from({ length: quantity }, (_, copyIndex) => ({
      id: `owned-${definition.id}-${copyIndex + 1}`,
      cardDefinitionId: definition.id,
    }));
  });
}

export function createPhaseOneFixtures(): PhaseOneFixtures {
  const leaderDefinition = createLeaderDefinition();
  const unitDefinitions = UNIT_COSTS.map((cost, index) => createUnitDefinition(index, cost));
  const cardDefinitions = [leaderDefinition, ...unitDefinitions];
  const rewardDefinition = unitDefinitions[0];

  if (rewardDefinition === undefined) {
    throw new Error('Phase 1 fixture에는 최소 한 개의 유닛 정의가 필요합니다.');
  }

  const leaderInstance: CardInstance = {
    id: 'owned-allied-leader-1',
    cardDefinitionId: leaderDefinition.id,
  };
  const unitInstances = createUnitInstances(unitDefinitions);
  const rewardInstance: CardInstance = {
    id: 'reward-allied-unit-01',
    cardDefinitionId: rewardDefinition.id,
  };
  const collection: OwnedCollection = {
    cardInstances: [leaderInstance, ...unitInstances, rewardInstance],
  };
  const deck: SavedDeck = {
    id: 'starter-deck',
    name: 'Starter Deck',
    leaderInstanceId: leaderInstance.id,
    unitInstanceIds: unitInstances.map((cardInstance) => cardInstance.id),
  };
  const enemyDeckBlueprint: EnemyDeckBlueprint = {
    id: 'enemy-blueprint-01',
    leaderDefinitionId: leaderDefinition.id,
    unitEntries: unitDefinitions.map((definition, index) => ({
      cardDefinitionId: definition.id,
      quantity: index === unitDefinitions.length - 1 ? 1 : 2,
    })),
  };
  const stage: StageDefinition = {
    id: 'stage-01',
    enemyDeckBlueprintId: enemyDeckBlueprint.id,
    aiProfileId: 'ai-stage-01',
    rewards: cardDefinitions.map((definition) => ({
      cardDefinitionId: definition.id,
      weight: definition.type === 'LEADER' ? 10 : 100,
    })),
  };
  const cardCatalog: CardCatalog = {
    cardDefinitions,
    cardPresentations: cardDefinitions.map((definition) => {
      const rarity = definition.type === 'LEADER' ? 'LEGENDARY' : 'COMMON';

      return {
        cardDefinitionId: definition.id,
        rarity,
        artAssetKey: `cards.art.${definition.id}`,
        frameVariant: rarity,
      };
    }),
  };
  const saveSlot: SaveSlotState = {
    schemaVersion: GAME_DATA_SCHEMA_VERSION,
    slotId: 1,
    collection,
    decks: [deck],
    selectedDeckId: deck.id,
    progress: {
      unlockedStageIds: [stage.id],
      clearedStageIds: [stage.id],
    },
    completedStageRuns: [
      {
        runId: 'stage-run-01',
        stageId: stage.id,
        result: 'WIN',
        rewardCardInstanceId: rewardInstance.id,
        completedAt: '2026-07-27T05:00:00.000Z',
      },
    ],
    lastModifiedAt: '2026-07-27T05:00:00.000Z',
  };

  return {
    cardCatalog,
    leaderDefinition,
    unitDefinitions,
    collection,
    deck,
    enemyDeckBlueprint,
    stage,
    saveSlot,
  };
}

export function createSequentialBattleIdFactory(namespace: string): BattleIdFactory {
  let sequence = 0;

  return ({ kind, sourceId, ordinal }) => {
    const id = `${namespace}-${kind.toLowerCase()}-${sourceId}-${ordinal}-${sequence}`;
    sequence += 1;
    return id;
  };
}
