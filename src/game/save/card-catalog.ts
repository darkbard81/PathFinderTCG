import darkDeckDefinitionData from '../../../cards/deck_dark.json';
import deckDefinitionData from '../../../cards/deck_test.json';

export type CardDefinitionFile = {
  version: string;
  cards: CardDefinition[];
};

export type CardType = 'UNIT' | 'LEADER' | 'EQUIPMENT' | 'ITEM';

export type AbilityCategory =
  'SPECIAL' | 'MOVE' | 'SUMMON' | 'ACTION' | 'ATTACK' | 'RETREAT' | 'FRONT' | 'BACK' | 'GLOBAL';

export type CardAbility = {
  id: string;
  category: AbilityCategory;
  name: string;
  text: string;
};

export type CardGrowthValue = {
  stat: 'hp' | 'attack' | 'slot' | 'dominance';
  value: number;
};

export type CardGrowth = {
  lv2: CardGrowthValue[];
  lv3: CardGrowthValue[];
  lv4: CardGrowthValue[];
  lv5: CardGrowthValue[];
  lv6: CardGrowthValue[];
  lv7: CardGrowthValue[];
  lv8: CardGrowthValue[];
  lv9: CardGrowthValue[];
};

export type CardDefinition = {
  id: string;
  name: string;
  type: CardType;
  /** canonical trait ID 목록. 희귀도도 RARITY 특성으로 이 안에 들어간다. */
  traits: string[];
  slot?: number;
  cost?: number;
  dominance?: number;
  hp?: number;
  attack?: number;
  level?: number;
  exp?: number;
  abilities: CardAbility[];
  growth?: CardGrowth;
  description: string;
  note: string;
};

const deckDefinition = deckDefinitionData as unknown as CardDefinitionFile;
const darkDeckDefinition = darkDeckDefinitionData as unknown as CardDefinitionFile;

export const CARD_DEFINITIONS: CardDefinition[] = deckDefinition.cards;
export const KNOWN_CARD_DEFINITIONS: CardDefinition[] = mergeCardDefinitions([
  deckDefinition.cards,
  darkDeckDefinition.cards,
]);

export function createCardDefinitionMap(
  cardDefinitions: readonly CardDefinition[] = KNOWN_CARD_DEFINITIONS,
): Map<string, CardDefinition> {
  return new Map(cardDefinitions.map((definition) => [definition.id, definition]));
}

export function findCardDefinition(
  definitionId: string,
  cardDefinitions: readonly CardDefinition[] = KNOWN_CARD_DEFINITIONS,
): CardDefinition | null {
  return createCardDefinitionMap(cardDefinitions).get(definitionId) ?? null;
}

export function requireCardDefinition(
  definitionId: string,
  cardDefinitions: readonly CardDefinition[] = KNOWN_CARD_DEFINITIONS,
): CardDefinition {
  const definition = findCardDefinition(definitionId, cardDefinitions);
  if (!definition) {
    throw new Error(`Unknown card definitionId: ${definitionId}`);
  }

  return definition;
}

export function mergeCardDefinitions(definitionGroups: CardDefinition[][]): CardDefinition[] {
  const definitions = new Map<string, CardDefinition>();
  for (const group of definitionGroups) {
    for (const definition of group) {
      definitions.set(definition.id, definition);
    }
  }

  return Array.from(definitions.values());
}
