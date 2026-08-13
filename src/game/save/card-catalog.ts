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

/**
 * 카드 정의 목록을 id 조회용 Map으로 만든다.
 *
 * 기본 카탈로그를 갖지 않는다. JSON을 읽는 일은 `card-catalog-data.ts`와
 * `auto-card-catalog.ts`가 맡고, 이 모듈은 받은 목록만 묶는다.
 */
export function createCardDefinitionMap(
  cardDefinitions: readonly CardDefinition[],
): Map<string, CardDefinition> {
  return new Map(cardDefinitions.map((definition) => [definition.id, definition]));
}

/**
 * 정의 목록에서 id로 카드를 찾는다. 없으면 null이다.
 */
export function findCardDefinition(
  definitionId: string,
  cardDefinitions: readonly CardDefinition[],
): CardDefinition | null {
  return createCardDefinitionMap(cardDefinitions).get(definitionId) ?? null;
}

/**
 * 정의 목록에서 id로 카드를 꺼낸다. 없으면 저장·전투를 진행할 수 없게 예외를 던진다.
 */
export function requireCardDefinition(
  definitionId: string,
  cardDefinitions: readonly CardDefinition[],
): CardDefinition {
  const definition = findCardDefinition(definitionId, cardDefinitions);
  if (!definition) {
    throw new Error(`Unknown card definitionId: ${definitionId}`);
  }

  return definition;
}

/**
 * 여러 덱 파일의 정의를 한 목록으로 합친다. 같은 id는 뒤에 온 정의가 이긴다.
 */
export function mergeCardDefinitions(definitionGroups: CardDefinition[][]): CardDefinition[] {
  const definitions = new Map<string, CardDefinition>();
  for (const group of definitionGroups) {
    for (const definition of group) {
      definitions.set(definition.id, definition);
    }
  }

  return Array.from(definitions.values());
}
