import type { CardInstance } from '../save/types';

export type StageVictoryCondition =
  { type: 'DEFEAT_ENEMY_LEADER' } | { type: 'SURVIVE_TURNS'; turns: number };

export type StageDefeatCondition =
  { type: 'PLAYER_LEADER_DEFEATED' } | { type: 'TURN_LIMIT'; turns: number } | { type: 'DECK_OUT' };

export type StageUnlockCondition = { type: 'ALWAYS' } | { type: 'STAGE_CLEARED'; stageId: string };

export type StageEnemyDeckPath = `cards/deck_${string}.json`;

export type StageRewardDefinition = {
  description: string;
  enemyCardDrop: {
    source: 'ENEMY_DROP';
    chancePercent: number;
    maxCards: number;
    excludeLeader: boolean;
  } | null;
};

export type StageDefinition = {
  id: string;
  order: number;
  name: string;
  description: string;
  enemyDeckId: string;
  enemyDeckPath: StageEnemyDeckPath;
  victoryCondition: StageVictoryCondition;
  defeatConditions: StageDefeatCondition[];
  rewards: StageRewardDefinition;
  unlock: StageUnlockCondition;
};

export type StageProgressState = {
  clearedStageIds: string[];
  lastSelectedStageId: string | null;
};

export type StageBattleResult = {
  stageId: string;
  outcome: 'WIN' | 'LOSE';
  reason: 'ENEMY_LEADER_DEFEATED' | 'PLAYER_LEADER_DEFEATED';
  rewardCards: CardInstance[];
  rewardCardInstanceIds: string[];
  rewardCardNames: string[];
  growth: StageGrowthResult;
  turnNumber: number;
};

export type StageRewardResult = {
  rewardCards: CardInstance[];
  rewardCardInstanceIds: string[];
  rewardCardNames: string[];
};

export type StageGrowthResult = {
  expPerCard: number;
  cardInstanceIds: string[];
  cardNames: string[];
};
