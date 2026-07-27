import type { CardDefinition } from '../cards/card.js';
import type { CardPresentation, CardRarity } from '../data/contracts.js';

export type CardFaction = 'ALLIED' | 'ENEMY';

export type CardRole = 'ATTACK' | 'DEFENSE' | 'OCCUPATION' | 'HAND' | 'DISRUPTION' | 'RECOVERY';

export interface CardArtDirection {
  readonly scene: string;
  readonly equipment: string;
  readonly palette: string;
  readonly pose: string;
}

export interface CardDesignRecord {
  readonly faction: CardFaction;
  readonly definition: CardDefinition;
  readonly presentation: CardPresentation;
  readonly primaryRole: CardRole;
  readonly secondaryRole: CardRole | null;
  readonly deckQuantity: 1 | 2;
  /**
   * GAME_DESIGN.md 19.2의 최초 환산 기준으로 평가한 Skill 기대 이득이다.
   * 실제 카드 규칙이나 런타임 수치가 아니라 카드 풀 밸런스 검증용 설계 메타데이터다.
   */
  readonly expectedSkillValue: number;
  readonly artDirection: CardArtDirection;
  readonly stageOneRewardWeight: number | null;
}

export interface CardDesignInput {
  readonly faction: CardFaction;
  readonly definition: CardDefinition;
  readonly rarity: CardRarity;
  readonly primaryRole: CardRole;
  readonly secondaryRole: CardRole | null;
  readonly deckQuantity: 1 | 2;
  readonly expectedSkillValue: number;
  readonly artDirection: CardArtDirection;
}

export const STAGE_ONE_REWARD_WEIGHT_BY_RARITY: Readonly<Record<CardRarity, number>> =
  Object.freeze({
    COMMON: 100,
    RARE: 45,
    EPIC: 20,
    LEGENDARY: 10,
  });

function freezeCardDefinition(definition: CardDefinition): CardDefinition {
  const activeSkill =
    definition.activeSkill === undefined
      ? undefined
      : Object.freeze({
          ...definition.activeSkill,
          effects: Object.freeze(
            definition.activeSkill.effects.map((effect) => Object.freeze({ ...effect })),
          ),
        });
  const reactiveSkill =
    definition.reactiveSkill === undefined
      ? undefined
      : Object.freeze({
          ...definition.reactiveSkill,
          trigger: Object.freeze({ ...definition.reactiveSkill.trigger }),
          effects: Object.freeze(
            definition.reactiveSkill.effects.map((effect) => Object.freeze({ ...effect })),
          ),
        });
  const passiveSkill =
    definition.passiveSkill === undefined
      ? undefined
      : Object.freeze({
          ...definition.passiveSkill,
          effects: Object.freeze(
            definition.passiveSkill.effects.map((effect) => Object.freeze({ ...effect })),
          ),
        });

  return Object.freeze({
    ...definition,
    ...(activeSkill === undefined ? {} : { activeSkill }),
    ...(reactiveSkill === undefined ? {} : { reactiveSkill }),
    ...(passiveSkill === undefined ? {} : { passiveSkill }),
  });
}

export function defineCardDesign(input: CardDesignInput): CardDesignRecord {
  const definition = freezeCardDefinition(input.definition);
  const presentation: CardPresentation = Object.freeze({
    cardDefinitionId: definition.id,
    rarity: input.rarity,
    artAssetKey: `cards.art.${definition.id}`,
    frameVariant: input.rarity,
  });

  return Object.freeze({
    faction: input.faction,
    definition,
    presentation,
    primaryRole: input.primaryRole,
    secondaryRole: input.secondaryRole,
    deckQuantity: input.deckQuantity,
    expectedSkillValue: input.expectedSkillValue,
    artDirection: Object.freeze({ ...input.artDirection }),
    stageOneRewardWeight:
      input.faction === 'ENEMY' ? STAGE_ONE_REWARD_WEIGHT_BY_RARITY[input.rarity] : null,
  });
}
