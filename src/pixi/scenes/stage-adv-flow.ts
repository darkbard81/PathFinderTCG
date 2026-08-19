import type {
  StageAdvDefinition,
  StageBattleResult,
  StageDefinition,
} from '../../game/stage/types';

/** 전투 직전 ADV가 있으면 반환하고, 없으면 바로 전투로 진행하게 null을 반환한다. */
export function resolveStartAdvDefinition(stage: StageDefinition): StageAdvDefinition | null {
  return stage.startAdv;
}

/** 같은 Stage에서 승리한 결과에만 End ADV를 붙인다. 패배와 중도 이탈은 건너뛴다. */
export function resolveEndAdvDefinition(
  stage: StageDefinition,
  result: StageBattleResult | null,
): StageAdvDefinition | null {
  if (!result || result.stageId !== stage.id || result.outcome !== 'WIN') {
    return null;
  }

  return stage.endAdv;
}
