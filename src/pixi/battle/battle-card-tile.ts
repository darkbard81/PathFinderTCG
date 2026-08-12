import type { BattlePublicCard } from '../../game/battle/protocol';
import { toCardTile, type CardTile } from '../../dom/screens/card-tile';

/**
 * 전투 중인 카드 한 장을 타일 값으로 바꾼다.
 * 수치는 저장 인스턴스가 아니라 능력·버프가 반영된 전투 유효값을 쓴다.
 * 그 값은 서버가 판정에 쓴 것과 같은 값이라 화면 숫자와 판정이 어긋나지 않는다.
 */
export function toBattleCardTile(card: BattlePublicCard, assetBaseUrl: string): CardTile {
  return {
    ...toCardTile(card.card, assetBaseUrl),
    dominance: card.dominance,
    attack: card.attack,
    hp: card.hp,
  };
}
