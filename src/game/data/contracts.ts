import type { CardDefinition } from '../cards/card.js';

export const GAME_DATA_SCHEMA_VERSION = 1 as const;

export const CORE_DECK_RULES = Object.freeze({
  totalCards: 30,
  leaderCards: 1,
  unitCards: 29,
  maxCopiesPerUnitDefinition: 2,
  minimumLowCostUnits: 8,
} as const);

export type StableId = string;
export type AssetKey = string;

export type CardRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type CardFrameVariant = CardRarity;

export interface CardPresentation {
  readonly cardDefinitionId: StableId;
  readonly rarity: CardRarity;
  readonly artAssetKey: AssetKey;
  readonly frameVariant: CardFrameVariant;
}

export interface CardInstance {
  readonly id: StableId;
  readonly cardDefinitionId: StableId;
}

export interface OwnedCollection {
  readonly cardInstances: readonly CardInstance[];
}

/**
 * 저장 중인 덱은 편집 도중의 미완성 상태를 허용한다.
 * Stage 진입 가능 여부는 validatePlayableSavedDeck으로 별도 판정한다.
 */
export interface SavedDeck {
  readonly id: StableId;
  readonly name: string;
  readonly leaderInstanceId: StableId | null;
  readonly unitInstanceIds: readonly StableId[];
}

export interface EnemyDeckEntry {
  readonly cardDefinitionId: StableId;
  readonly quantity: number;
}

export interface EnemyDeckBlueprint {
  readonly id: StableId;
  readonly leaderDefinitionId: StableId;
  readonly unitEntries: readonly EnemyDeckEntry[];
}

export type BattleZone = 'DECK' | 'HAND' | 'FIELD' | 'DROP' | 'EXILE';
export type CardStatusId = 'EXILED';

export type BattleFieldPosition =
  'FRONT_LEFT' | 'FRONT_CENTER' | 'FRONT_RIGHT' | 'BACK_LEFT' | 'BACK_CENTER' | 'BACK_RIGHT';

export type BattleCardSource =
  | {
      readonly type: 'OWNED';
      readonly cardInstanceId: StableId;
    }
  | {
      readonly type: 'BLUEPRINT';
      readonly enemyDeckBlueprintId: StableId;
      readonly copyIndex: number;
    };

export interface BattleCardInstance {
  readonly id: StableId;
  readonly cardDefinitionId: StableId;
  readonly source: BattleCardSource;
  readonly zone: BattleZone;
  readonly fieldPosition: BattleFieldPosition | null;
  readonly damage: number;
  readonly statusIds: readonly CardStatusId[];
  readonly isDeploymentPending: boolean;
}

export type BattleDeckSource =
  | {
      readonly type: 'SAVED_DECK';
      readonly savedDeckId: StableId;
    }
  | {
      readonly type: 'ENEMY_BLUEPRINT';
      readonly enemyDeckBlueprintId: StableId;
    };

/**
 * BattleCardInstance는 cards에 정확히 한 번 저장하고 각 존은 battle card ID만 참조한다.
 * drawPileIds의 첫 원소가 Deck의 맨 위 카드다.
 */
export interface BattleDeck {
  readonly id: StableId;
  readonly source: BattleDeckSource;
  readonly seed: number;
  readonly leaderId: StableId;
  readonly cards: readonly BattleCardInstance[];
  readonly drawPileIds: readonly StableId[];
  readonly handIds: readonly StableId[];
  readonly fieldIds: readonly StableId[];
  readonly dropIds: readonly StableId[];
  readonly exileIds: readonly StableId[];
}

export interface StageRewardEntry {
  readonly cardDefinitionId: StableId;
  readonly weight: number;
}

export interface StageDefinition {
  readonly id: StableId;
  readonly enemyDeckBlueprintId: StableId;
  readonly aiProfileId: StableId;
  readonly rewards: readonly StageRewardEntry[];
}

export interface SaveProgress {
  readonly unlockedStageIds: readonly StableId[];
  readonly clearedStageIds: readonly StableId[];
}

export type StageRunResult = 'WIN' | 'LOSS' | 'DRAW';

export interface CompletedStageRun {
  readonly runId: StableId;
  readonly stageId: StableId;
  readonly result: StageRunResult;
  readonly rewardCardInstanceId: StableId | null;
  readonly completedAt: string;
}

export interface SaveSlotState {
  readonly schemaVersion: typeof GAME_DATA_SCHEMA_VERSION;
  readonly slotId: 1 | 2 | 3;
  readonly collection: OwnedCollection;
  readonly decks: readonly SavedDeck[];
  readonly selectedDeckId: StableId | null;
  readonly progress: SaveProgress;
  readonly completedStageRuns: readonly CompletedStageRun[];
  readonly lastModifiedAt: string;
}

export interface CardCatalog {
  readonly cardDefinitions: readonly CardDefinition[];
  readonly cardPresentations: readonly CardPresentation[];
}
