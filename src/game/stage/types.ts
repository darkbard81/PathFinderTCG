import type { CardDefinitionFile } from '../save/card-catalog';
import type { CardInstance } from '../save/types';

/** Stage가 참조하는 적 덱 파일을 실제 정의와 함께 묶은 값이다. */
export type StageEnemyDeckDefinition = {
  deckId: string;
  deckPath: StageEnemyDeckPath;
  cardDefinitionFile: CardDefinitionFile;
};

export type StageVictoryCondition =
  { type: 'DEFEAT_ENEMY_LEADER' } | { type: 'SURVIVE_TURNS'; turns: number };

export type StageDefeatCondition =
  { type: 'PLAYER_LEADER_DEFEATED' } | { type: 'TURN_LIMIT'; turns: number } | { type: 'DECK_OUT' };

export type StageUnlockCondition = { type: 'ALWAYS' } | { type: 'STAGE_CLEARED'; stageId: string };

export type StageEnemyDeckPath = `cards/deck_${string}.json`;

/** ADV 런타임 자산을 가리키는 manifest key다. */
export type StageAdvAssetKey = `adv.${string}`;

/** ADV 화면의 한 위치에 표시할 캐릭터 이미지다. */
export type StageAdvStandingDefinition = {
  assetKey: StageAdvAssetKey;
  position: 'left' | 'center' | 'right';
};

/** 사용자가 다음 입력으로 넘기는 선형 대사와 선택적 화면 변경분이다. */
export type StageAdvBeatDefinition = {
  speaker: string | null;
  text: string;
  faceAssetKey: StageAdvAssetKey | null;
  /** 생략하면 직전 컷씬을 유지한다. */
  cutsceneAssetKey?: StageAdvAssetKey;
  /** 생략하면 직전 구성을 유지하고, 빈 배열이면 스탠딩을 모두 숨긴다. */
  standings?: StageAdvStandingDefinition[];
};

/** ADV 진입 화면을 확정하기 위해 컷씬을 반드시 선언하는 첫 beat다. */
export type StageAdvInitialBeatDefinition = StageAdvBeatDefinition & {
  cutsceneAssetKey: StageAdvAssetKey;
};

/** Stage 전후에 매번 재생하는 최소 선형 ADV 정의다. */
export type StageAdvDefinition = {
  beats: [StageAdvInitialBeatDefinition, ...StageAdvBeatDefinition[]];
};

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
  /** 전투 직전에 재생할 ADV다. 없으면 바로 전투로 간다. */
  startAdv: StageAdvDefinition | null;
  /** 승리 직후 재생할 ADV다. 없으면 Stage 선택으로 돌아간다. */
  endAdv: StageAdvDefinition | null;
  /**
   * 전투 중 흘릴 BGM 트랙 id다. `sound/bgm/playlist.json`의 id를 쓴다.
   *
   * null이면 들어올 때 흐르던 곡을 그대로 둔다. 실제로 있는 곡인지는 확인하지 않는다.
   * 곡 목록은 빌드마다 바뀌는 런타임 자산이라 스테이지 데이터가 알 수 없다.
   */
  battleBgmId: string | null;
};

export type StageProgressState = {
  clearedStageIds: string[];
  lastSelectedStageId: string | null;
  /**
   * 스테이지마다 사용자가 고른 전투 BGM이다. 스테이지 id에서 곡 id로 잇는다.
   *
   * 여기 없는 스테이지는 데이터가 정한 `battleBgmId`를 그대로 쓴다. 즉 이 표는
   * 기본값을 덮어쓴 것만 담는다. 고르는 일은 깬 스테이지에서만 할 수 있다.
   *
   * 실제로 있는 곡인지는 확인하지 않는다. 곡 목록은 빌드마다 바뀌는 런타임 자산이라
   * 저장 스키마가 알 수 없다. 사라진 곡은 화면이 기본값으로 되돌려 보여 준다.
   */
  stageBgmIds: Record<string, string>;
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
