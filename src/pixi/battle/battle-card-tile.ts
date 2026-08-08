import {
  getEffectiveAttack,
  getEffectiveDominance,
  getEffectiveHp,
} from '../../game/battle/battle-engine';
import type { BattleCardRuntimeState, BattleRuntimeState } from '../../game/battle/types';
import { toCardTile, type CardTile } from '../../dom/screens/card-tile';

/**
 * 전투 중인 카드 한 장을 타일 값으로 바꾼다.
 * 수치는 저장 인스턴스가 아니라 능력·버프가 반영된 전투 유효값을 쓴다.
 * 그래야 화면에 보이는 숫자와 엔진이 판정에 쓰는 숫자가 어긋나지 않는다.
 */
export function toBattleCardTile(
  runtime: BattleRuntimeState,
  card: BattleCardRuntimeState,
  assetBaseUrl: string,
): CardTile {
  return {
    ...toCardTile(card.card, assetBaseUrl),
    dominance: getEffectiveDominance(runtime, card),
    attack: getEffectiveAttack(runtime, card),
    hp: getEffectiveHp(runtime, card),
  };
}
