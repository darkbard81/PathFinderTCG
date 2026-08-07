import type { CardGrowth, CardGrowthValue } from './card-catalog';
import type { GameSession, RuntimeCardInstance } from './session';
import type { CardInstance, CardInstanceZone } from './types';

export const LEVEL_EXP_THRESHOLDS = [
  100, 200, 500, 1000, 1500, 3000, 5000, 8000, 12000, 20000,
] as const;

export const MAX_CARD_LEVEL = 9;
export const BATTLE_PARTICIPATION_EXP = 100;

export type AppliedCardGrowthValue = CardGrowthValue & {
  level: number;
};

export type CardGrowthResult = {
  previousExp: number;
  nextExp: number;
  previousLevel: number;
  nextLevel: number;
  gainedExp: number;
  appliedGrowth: AppliedCardGrowthValue[];
};

export type BattleParticipationGrowthEntry = CardGrowthResult & {
  cardInstanceId: string;
  cardName: string;
};

export type BattleParticipationGrowthResult = {
  session: GameSession;
  entries: BattleParticipationGrowthEntry[];
};

export type ConsumeCollectionMaterialsForDeckGrowthOptions = {
  targetDeckCardInstanceId: string;
  materialCollectionCardInstanceIds: readonly string[];
};

export type MaterialGrowthResult = CardGrowthResult & {
  session: GameSession;
  targetCardInstanceId: string;
  targetCardName: string;
  totalMaterialExp: number;
  consumedMaterialInstanceIds: string[];
};

/**
 * 누적 EXP를 카드 저장 스키마가 허용하는 레벨로 변환한다.
 * 댓글의 임계값 배열을 사용하되 현재 카드 스키마의 최대 레벨 9를 넘기지 않는다.
 */
export function calculateCardLevelFromExp(exp: number): number {
  assertNonNegativeInteger(exp, 'exp');

  let level = 1;
  for (const threshold of LEVEL_EXP_THRESHOLDS) {
    if (exp < threshold || level >= MAX_CARD_LEVEL) {
      break;
    }

    level += 1;
  }

  return level;
}

/**
 * 카드 1장에 누적 EXP를 더하고, 새로 도달한 레벨의 성장 정의를 저장 인스턴스 수치에 반영한다.
 * 반환 카드는 원본 런타임 카드를 변경하지 않는 복제본이다.
 */
export function applyExpToRuntimeCard(
  card: RuntimeCardInstance,
  gainedExp: number,
): { card: RuntimeCardInstance; result: CardGrowthResult } {
  assertNonNegativeInteger(gainedExp, 'gainedExp');

  const previousExp = readCardExp(card);
  const nextExp = previousExp + gainedExp;
  const previousLevel = calculateCardLevelFromExp(previousExp);
  const nextLevel = calculateCardLevelFromExp(nextExp);
  const nextCard = cloneRuntimeCard(card, card.instance.zone);
  nextCard.instance.exp = nextExp;
  nextCard.instance.level = nextLevel;

  const appliedGrowth: AppliedCardGrowthValue[] = [];
  for (let level = previousLevel + 1; level <= nextLevel; level += 1) {
    for (const growthValue of readGrowthValuesForLevel(nextCard, level)) {
      applyGrowthValue(nextCard.instance, nextCard.definition, growthValue);
      appliedGrowth.push({ ...growthValue, level });
    }
  }

  return {
    card: nextCard,
    result: {
      previousExp,
      nextExp,
      previousLevel,
      nextLevel,
      gainedExp,
      appliedGrowth,
    },
  };
}

/**
 * 전투에 참여한 저장 덱 카드에 동일한 EXP를 지급한다.
 * 전달된 instanceId에 대응하는 현재 리더와 덱 카드만 갱신하며 컬렉션과 진행도는 그대로 보존한다.
 */
export function applyBattleParticipationExpToSession(
  session: GameSession,
  cardInstanceIds: readonly string[],
  expPerCard: number = BATTLE_PARTICIPATION_EXP,
): BattleParticipationGrowthResult {
  assertNonNegativeInteger(expPerCard, 'expPerCard');
  const targetIds = new Set(cardInstanceIds);
  const entries: BattleParticipationGrowthEntry[] = [];
  const nextLeader = maybeApplyBattleExp(session.deck.leader, targetIds, expPerCard, entries);
  const nextCards = session.deck.cards.map((card) =>
    maybeApplyBattleExp(card, targetIds, expPerCard, entries),
  );

  return {
    session: {
      ...session,
      deck: {
        id: session.deck.id,
        leader: nextLeader,
        cards: nextCards,
      },
      collection: {
        cards: session.collection.cards.map((card) => cloneRuntimeCard(card, 'COLLECTION')),
      },
      stageProgress: structuredClone(session.stageProgress),
    },
    entries,
  };
}

/**
 * 현재 덱의 UNIT 카드 1장에 컬렉션 UNIT 카드들을 재료로 소모해 EXP와 성장 수치를 반영한다.
 * 대상은 덱에 남고, 재료로 지정한 컬렉션 카드는 보유 목록에서 제거된다.
 */
export function consumeCollectionMaterialsForDeckGrowth(
  session: GameSession,
  options: ConsumeCollectionMaterialsForDeckGrowthOptions,
): MaterialGrowthResult {
  if (options.materialCollectionCardInstanceIds.length === 0) {
    throw new Error('At least one material card is required');
  }

  const uniqueMaterialIds = new Set(options.materialCollectionCardInstanceIds);
  if (uniqueMaterialIds.size !== options.materialCollectionCardInstanceIds.length) {
    throw new Error('Material cards must be unique');
  }

  const targetIndex = session.deck.cards.findIndex(
    (card) => card.instance.instanceId === options.targetDeckCardInstanceId,
  );
  if (targetIndex < 0) {
    throw new Error(`Deck growth target not found: ${options.targetDeckCardInstanceId}`);
  }

  const targetCard = session.deck.cards[targetIndex]!;
  assertDeckGrowthTarget(targetCard);

  const materialCards = options.materialCollectionCardInstanceIds.map((instanceId) => {
    const material = session.collection.cards.find(
      (card) => card.instance.instanceId === instanceId,
    );
    if (!material) {
      throw new Error(`Collection material card not found: ${instanceId}`);
    }

    assertCollectionMaterialCard(material);
    return material;
  });
  const totalMaterialExp = materialCards.reduce(
    (total, material) => total + calculateMaterialExp(targetCard, material),
    0,
  );
  const grown = applyExpToRuntimeCard(targetCard, totalMaterialExp);

  return {
    ...grown.result,
    session: {
      ...session,
      deck: {
        id: session.deck.id,
        leader: cloneRuntimeCard(session.deck.leader, 'LEADER'),
        cards: session.deck.cards.map((card, index) =>
          index === targetIndex ? grown.card : cloneRuntimeCard(card, 'DECK'),
        ),
      },
      collection: {
        cards: session.collection.cards
          .filter((card) => !uniqueMaterialIds.has(card.instance.instanceId))
          .map((card) => cloneRuntimeCard(card, 'COLLECTION')),
      },
      stageProgress: structuredClone(session.stageProgress),
    },
    targetCardInstanceId: targetCard.instance.instanceId,
    targetCardName: targetCard.instance.name,
    totalMaterialExp,
    consumedMaterialInstanceIds: [...options.materialCollectionCardInstanceIds],
  };
}

/**
 * 성장 재료 카드 1장이 제공하는 EXP를 계산한다.
 * 같은 카드 정의를 재료로 쓰면 댓글 규칙에 따라 10배 보너스를 적용한다.
 */
export function calculateMaterialExp(
  targetCard: RuntimeCardInstance,
  materialCard: RuntimeCardInstance,
): number {
  const level = calculateCardLevelFromExp(readCardExp(materialCard));
  const baseExp = level * 10;
  return materialCard.definition.id === targetCard.definition.id ? baseExp * 10 : baseExp;
}

function maybeApplyBattleExp(
  card: RuntimeCardInstance,
  targetIds: ReadonlySet<string>,
  expPerCard: number,
  entries: BattleParticipationGrowthEntry[],
): RuntimeCardInstance {
  if (!targetIds.has(card.instance.instanceId)) {
    return cloneRuntimeCard(card, card.instance.zone);
  }

  const grown = applyExpToRuntimeCard(card, expPerCard);
  entries.push({
    ...grown.result,
    cardInstanceId: grown.card.instance.instanceId,
    cardName: grown.card.instance.name,
  });
  return grown.card;
}

function readCardExp(card: RuntimeCardInstance): number {
  const exp = card.instance.exp ?? card.definition.exp ?? 0;
  assertNonNegativeInteger(exp, 'card exp');
  return exp;
}

function readGrowthValuesForLevel(card: RuntimeCardInstance, level: number): CardGrowthValue[] {
  const growth = card.instance.growth ?? card.definition.growth;
  if (!growth || level < 2 || level > MAX_CARD_LEVEL) {
    return [];
  }

  return growth[createGrowthKey(level)];
}

function createGrowthKey(level: number): keyof CardGrowth {
  return `lv${level}` as keyof CardGrowth;
}

function applyGrowthValue(
  instance: CardInstance,
  definition: RuntimeCardInstance['definition'],
  growthValue: CardGrowthValue,
): void {
  const currentValue = instance[growthValue.stat] ?? definition[growthValue.stat] ?? 0;
  instance[growthValue.stat] = currentValue + growthValue.value;
}

function assertDeckGrowthTarget(card: RuntimeCardInstance): void {
  if (card.instance.zone !== 'DECK') {
    throw new Error(`Growth target must be in DECK zone: ${card.instance.instanceId}`);
  }
  if (card.definition.type !== 'UNIT') {
    throw new Error(`Growth target must be a UNIT card: ${card.instance.instanceId}`);
  }
}

function assertCollectionMaterialCard(card: RuntimeCardInstance): void {
  if (card.instance.zone !== 'COLLECTION') {
    throw new Error(`Material card must be in COLLECTION zone: ${card.instance.instanceId}`);
  }
  if (card.definition.type !== 'UNIT') {
    throw new Error(`Material card must be a UNIT card: ${card.instance.instanceId}`);
  }
}

function cloneRuntimeCard(card: RuntimeCardInstance, zone: CardInstanceZone): RuntimeCardInstance {
  return {
    instance: {
      ...structuredClone(card.instance),
      zone,
    },
    definition: card.definition,
  };
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}
