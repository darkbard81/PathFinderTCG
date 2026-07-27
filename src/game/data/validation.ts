import type { CardDefinition } from '../cards/card.js';
import {
  CORE_DECK_RULES,
  type BattleDeck,
  type BattleZone,
  type CardCatalog,
  type CardInstance,
  type EnemyDeckBlueprint,
  type OwnedCollection,
  type SavedDeck,
  type SaveSlotState,
  type StableId,
  type StageDefinition,
} from './contracts.js';

export type DataValidationCode =
  | 'BATTLE_CARD_MISSING_FROM_ZONE'
  | 'BATTLE_CARD_SOURCE_MISMATCH'
  | 'BATTLE_CARD_SOURCE_REUSED'
  | 'BATTLE_CARD_USES_SOURCE_ID'
  | 'BATTLE_LEADER_INVALID'
  | 'BATTLE_ZONE_DUPLICATE'
  | 'BATTLE_ZONE_MISMATCH'
  | 'CLEARED_STAGE_LOCKED'
  | 'COPY_LIMIT_EXCEEDED'
  | 'DECK_SIZE_INVALID'
  | 'DUPLICATE_ID'
  | 'DUPLICATE_INSTANCE_REFERENCE'
  | 'INVALID_QUANTITY'
  | 'INVALID_REWARD'
  | 'INVALID_SEED'
  | 'INVALID_SLOT_ID'
  | 'INVALID_STAGE_RUN_REWARD'
  | 'INVALID_TIMESTAMP'
  | 'LEADER_REQUIRED'
  | 'LEADER_TYPE_REQUIRED'
  | 'LOW_COST_REQUIREMENT'
  | 'PRESENTATION_VARIANT_MISMATCH'
  | 'REWARD_LEADER_REQUIRED'
  | 'REWARD_NOT_IN_ENEMY_DECK'
  | 'SELECTED_DECK_NOT_FOUND'
  | 'STAGE_NOT_CLEARED'
  | 'UNIT_TYPE_REQUIRED'
  | 'UNKNOWN_CARD_DEFINITION'
  | 'UNKNOWN_ENEMY_DECK'
  | 'UNKNOWN_INSTANCE'
  | 'UNKNOWN_STAGE';

export interface DataValidationIssue {
  readonly code: DataValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface DataValidationResult {
  readonly valid: boolean;
  readonly issues: readonly DataValidationIssue[];
}

export class DataContractValidationError extends Error {
  readonly issues: readonly DataValidationIssue[];

  constructor(message: string, issues: readonly DataValidationIssue[]) {
    super(message);
    this.name = 'DataContractValidationError';
    this.issues = issues;
  }
}

interface SavedDeckValidationContext {
  readonly collection: OwnedCollection;
  readonly cardDefinitions: readonly CardDefinition[];
}

function issue(code: DataValidationCode, path: string, message: string): DataValidationIssue {
  return { code, path, message };
}

function result(issues: readonly DataValidationIssue[]): DataValidationResult {
  return {
    valid: issues.length === 0,
    issues,
  };
}

function createUniqueIndex<T>(
  values: readonly T[],
  getId: (value: T) => StableId,
  path: string,
  issues: DataValidationIssue[],
): Map<StableId, T> {
  const index = new Map<StableId, T>();

  values.forEach((value, position) => {
    const id = getId(value);

    if (index.has(id)) {
      issues.push(
        issue('DUPLICATE_ID', `${path}/${position}`, `중복된 ID를 사용할 수 없습니다: ${id}`),
      );
      return;
    }

    index.set(id, value);
  });

  return index;
}

function createDefinitionIndex(
  definitions: readonly CardDefinition[],
  issues: DataValidationIssue[],
): Map<StableId, CardDefinition> {
  return createUniqueIndex(definitions, (definition) => definition.id, '/cardDefinitions', issues);
}

function createInstanceIndex(
  collection: OwnedCollection,
  issues: DataValidationIssue[],
): Map<StableId, CardInstance> {
  return createUniqueIndex(
    collection.cardInstances,
    (cardInstance) => cardInstance.id,
    '/collection/cardInstances',
    issues,
  );
}

function validateCardInstanceReferences(
  collection: OwnedCollection,
  definitionIndex: ReadonlyMap<StableId, CardDefinition>,
  issues: DataValidationIssue[],
): void {
  collection.cardInstances.forEach((cardInstance, index) => {
    if (!definitionIndex.has(cardInstance.cardDefinitionId)) {
      issues.push(
        issue(
          'UNKNOWN_CARD_DEFINITION',
          `/collection/cardInstances/${index}/cardDefinitionId`,
          `존재하지 않는 카드 정의입니다: ${cardInstance.cardDefinitionId}`,
        ),
      );
    }
  });
}

function getReferencedDefinition(
  instanceId: StableId,
  path: string,
  instanceIndex: ReadonlyMap<StableId, CardInstance>,
  definitionIndex: ReadonlyMap<StableId, CardDefinition>,
  issues: DataValidationIssue[],
): CardDefinition | undefined {
  const cardInstance = instanceIndex.get(instanceId);

  if (cardInstance === undefined) {
    issues.push(
      issue('UNKNOWN_INSTANCE', path, `컬렉션이 소유하지 않은 카드 인스턴스입니다: ${instanceId}`),
    );
    return undefined;
  }

  const definition = definitionIndex.get(cardInstance.cardDefinitionId);

  if (definition === undefined) {
    issues.push(
      issue(
        'UNKNOWN_CARD_DEFINITION',
        path,
        `존재하지 않는 카드 정의입니다: ${cardInstance.cardDefinitionId}`,
      ),
    );
  }

  return definition;
}

function collectSavedDeckIssues(
  deck: SavedDeck,
  context: SavedDeckValidationContext,
  requirePlayable: boolean,
): readonly DataValidationIssue[] {
  const issues: DataValidationIssue[] = [];
  const definitionIndex = createDefinitionIndex(context.cardDefinitions, issues);
  const instanceIndex = createInstanceIndex(context.collection, issues);
  validateCardInstanceReferences(context.collection, definitionIndex, issues);

  if (deck.unitInstanceIds.length > CORE_DECK_RULES.unitCards) {
    issues.push(
      issue(
        'DECK_SIZE_INVALID',
        '/unitInstanceIds',
        `유닛은 최대 ${CORE_DECK_RULES.unitCards}장까지 저장할 수 있습니다.`,
      ),
    );
  }

  const referencedIds = new Set<StableId>();
  let leaderDefinition: CardDefinition | undefined;

  if (deck.leaderInstanceId === null) {
    if (requirePlayable) {
      issues.push(
        issue('LEADER_REQUIRED', '/leaderInstanceId', 'Stage 진입에는 리더가 필요합니다.'),
      );
    }
  } else {
    referencedIds.add(deck.leaderInstanceId);
    leaderDefinition = getReferencedDefinition(
      deck.leaderInstanceId,
      '/leaderInstanceId',
      instanceIndex,
      definitionIndex,
      issues,
    );

    if (leaderDefinition !== undefined && leaderDefinition.type !== 'LEADER') {
      issues.push(
        issue(
          'LEADER_TYPE_REQUIRED',
          '/leaderInstanceId',
          'leaderInstanceId는 LEADER 카드 인스턴스를 참조해야 합니다.',
        ),
      );
      leaderDefinition = undefined;
    }
  }

  const definitionCounts = new Map<StableId, number>();
  const unitDefinitions: CardDefinition[] = [];

  deck.unitInstanceIds.forEach((instanceId, index) => {
    const path = `/unitInstanceIds/${index}`;

    if (referencedIds.has(instanceId)) {
      issues.push(
        issue(
          'DUPLICATE_INSTANCE_REFERENCE',
          path,
          `같은 카드 인스턴스를 덱에서 두 번 참조할 수 없습니다: ${instanceId}`,
        ),
      );
      return;
    }

    referencedIds.add(instanceId);
    const definition = getReferencedDefinition(
      instanceId,
      path,
      instanceIndex,
      definitionIndex,
      issues,
    );

    if (definition === undefined) {
      return;
    }

    if (definition.type !== 'UNIT') {
      issues.push(
        issue(
          'UNIT_TYPE_REQUIRED',
          path,
          `유닛 영역은 UNIT 카드만 참조할 수 있습니다: ${definition.id}`,
        ),
      );
      return;
    }

    unitDefinitions.push(definition);
    const nextCount = (definitionCounts.get(definition.id) ?? 0) + 1;
    definitionCounts.set(definition.id, nextCount);

    if (nextCount > CORE_DECK_RULES.maxCopiesPerUnitDefinition) {
      issues.push(
        issue(
          'COPY_LIMIT_EXCEEDED',
          path,
          `같은 유닛 정의는 최대 ${CORE_DECK_RULES.maxCopiesPerUnitDefinition}장입니다: ${definition.id}`,
        ),
      );
    }
  });

  if (requirePlayable && deck.unitInstanceIds.length !== CORE_DECK_RULES.unitCards) {
    issues.push(
      issue(
        'DECK_SIZE_INVALID',
        '/unitInstanceIds',
        `Stage 진입에는 유닛 ${CORE_DECK_RULES.unitCards}장이 필요합니다.`,
      ),
    );
  }

  if (requirePlayable && leaderDefinition !== undefined) {
    const lowCostUnits = unitDefinitions.filter(
      (definition) => definition.cost <= leaderDefinition.dominance,
    ).length;

    if (lowCostUnits < CORE_DECK_RULES.minimumLowCostUnits) {
      issues.push(
        issue(
          'LOW_COST_REQUIREMENT',
          '/unitInstanceIds',
          `리더의 지배력 이하 Cost 유닛이 최소 ${CORE_DECK_RULES.minimumLowCostUnits}장 필요합니다.`,
        ),
      );
    }
  }

  return issues;
}

export function validateCardCatalog(catalog: CardCatalog): DataValidationResult {
  const issues: DataValidationIssue[] = [];
  const definitionIndex = createDefinitionIndex(catalog.cardDefinitions, issues);
  const presentationIndex = createUniqueIndex(
    catalog.cardPresentations,
    (presentation) => presentation.cardDefinitionId,
    '/cardPresentations',
    issues,
  );

  for (const [definitionId, presentation] of presentationIndex) {
    if (!definitionIndex.has(definitionId)) {
      issues.push(
        issue(
          'UNKNOWN_CARD_DEFINITION',
          `/cardPresentations/${definitionId}`,
          `표현 메타데이터가 존재하지 않는 카드 정의를 참조합니다: ${definitionId}`,
        ),
      );
    }

    if (presentation.rarity !== presentation.frameVariant) {
      issues.push(
        issue(
          'PRESENTATION_VARIANT_MISMATCH',
          `/cardPresentations/${definitionId}/frameVariant`,
          '카드 프레임 variant는 카드 레어리티와 같아야 합니다.',
        ),
      );
    }
  }

  return result(issues);
}

export function validateOwnedCollection(
  collection: OwnedCollection,
  cardDefinitions: readonly CardDefinition[],
): DataValidationResult {
  const issues: DataValidationIssue[] = [];
  const definitionIndex = createDefinitionIndex(cardDefinitions, issues);
  createInstanceIndex(collection, issues);
  validateCardInstanceReferences(collection, definitionIndex, issues);
  return result(issues);
}

export function validateSavedDeckForStorage(
  deck: SavedDeck,
  context: SavedDeckValidationContext,
): DataValidationResult {
  return result(collectSavedDeckIssues(deck, context, false));
}

export function validatePlayableSavedDeck(
  deck: SavedDeck,
  context: SavedDeckValidationContext,
): DataValidationResult {
  return result(collectSavedDeckIssues(deck, context, true));
}

export function validateEnemyDeckBlueprint(
  blueprint: EnemyDeckBlueprint,
  cardDefinitions: readonly CardDefinition[],
): DataValidationResult {
  const issues: DataValidationIssue[] = [];
  const definitionIndex = createDefinitionIndex(cardDefinitions, issues);
  const leaderDefinition = definitionIndex.get(blueprint.leaderDefinitionId);

  if (leaderDefinition === undefined) {
    issues.push(
      issue(
        'UNKNOWN_CARD_DEFINITION',
        '/leaderDefinitionId',
        `존재하지 않는 리더 정의입니다: ${blueprint.leaderDefinitionId}`,
      ),
    );
  } else if (leaderDefinition.type !== 'LEADER') {
    issues.push(
      issue(
        'LEADER_TYPE_REQUIRED',
        '/leaderDefinitionId',
        'leaderDefinitionId는 LEADER 정의를 참조해야 합니다.',
      ),
    );
  }

  const entryIds = new Set<StableId>();
  let totalUnits = 0;
  let lowCostUnits = 0;

  blueprint.unitEntries.forEach((entry, index) => {
    const path = `/unitEntries/${index}`;

    if (entryIds.has(entry.cardDefinitionId)) {
      issues.push(
        issue(
          'DUPLICATE_ID',
          `${path}/cardDefinitionId`,
          `같은 유닛 정의는 하나의 수량 항목으로 합쳐야 합니다: ${entry.cardDefinitionId}`,
        ),
      );
    }
    entryIds.add(entry.cardDefinitionId);

    if (
      !Number.isInteger(entry.quantity) ||
      entry.quantity < 1 ||
      entry.quantity > CORE_DECK_RULES.maxCopiesPerUnitDefinition
    ) {
      issues.push(
        issue(
          'INVALID_QUANTITY',
          `${path}/quantity`,
          `유닛 정의별 수량은 1~${CORE_DECK_RULES.maxCopiesPerUnitDefinition}이어야 합니다.`,
        ),
      );
    }

    totalUnits += entry.quantity;
    const definition = definitionIndex.get(entry.cardDefinitionId);

    if (definition === undefined) {
      issues.push(
        issue(
          'UNKNOWN_CARD_DEFINITION',
          `${path}/cardDefinitionId`,
          `존재하지 않는 카드 정의입니다: ${entry.cardDefinitionId}`,
        ),
      );
      return;
    }

    if (definition.type !== 'UNIT') {
      issues.push(
        issue(
          'UNIT_TYPE_REQUIRED',
          `${path}/cardDefinitionId`,
          `적 덱 유닛 항목은 UNIT 정의만 참조할 수 있습니다: ${definition.id}`,
        ),
      );
      return;
    }

    if (leaderDefinition?.type === 'LEADER' && definition.cost <= leaderDefinition.dominance) {
      lowCostUnits += entry.quantity;
    }
  });

  if (totalUnits !== CORE_DECK_RULES.unitCards) {
    issues.push(
      issue(
        'DECK_SIZE_INVALID',
        '/unitEntries',
        `적 덱 청사진의 유닛 수량 합은 ${CORE_DECK_RULES.unitCards}장이어야 합니다.`,
      ),
    );
  }

  if (leaderDefinition?.type === 'LEADER' && lowCostUnits < CORE_DECK_RULES.minimumLowCostUnits) {
    issues.push(
      issue(
        'LOW_COST_REQUIREMENT',
        '/unitEntries',
        `리더의 지배력 이하 Cost 유닛이 최소 ${CORE_DECK_RULES.minimumLowCostUnits}장 필요합니다.`,
      ),
    );
  }

  return result(issues);
}

export function validateStageDefinition(
  stage: StageDefinition,
  enemyDeckBlueprints: readonly EnemyDeckBlueprint[],
  cardDefinitions: readonly CardDefinition[],
): DataValidationResult {
  const issues: DataValidationIssue[] = [];
  const definitionIndex = createDefinitionIndex(cardDefinitions, issues);
  const blueprintIndex = createUniqueIndex(
    enemyDeckBlueprints,
    (blueprint) => blueprint.id,
    '/enemyDeckBlueprints',
    issues,
  );
  const blueprint = blueprintIndex.get(stage.enemyDeckBlueprintId);

  if (blueprint === undefined) {
    issues.push(
      issue(
        'UNKNOWN_ENEMY_DECK',
        '/enemyDeckBlueprintId',
        `존재하지 않는 적 덱 청사진입니다: ${stage.enemyDeckBlueprintId}`,
      ),
    );
  } else {
    const blueprintValidation = validateEnemyDeckBlueprint(blueprint, cardDefinitions);
    blueprintValidation.issues.forEach((blueprintIssue) => {
      issues.push({
        ...blueprintIssue,
        path: `/enemyDeckBlueprint${blueprintIssue.path}`,
      });
    });
  }

  const rewardIds = new Set<StableId>();
  const blueprintDefinitionIds =
    blueprint === undefined
      ? new Set<StableId>()
      : new Set([
          blueprint.leaderDefinitionId,
          ...blueprint.unitEntries.map((entry) => entry.cardDefinitionId),
        ]);

  stage.rewards.forEach((reward, index) => {
    const path = `/rewards/${index}`;

    if (rewardIds.has(reward.cardDefinitionId)) {
      issues.push(
        issue(
          'DUPLICATE_ID',
          `${path}/cardDefinitionId`,
          `보상 정의를 중복 선언할 수 없습니다: ${reward.cardDefinitionId}`,
        ),
      );
    }
    rewardIds.add(reward.cardDefinitionId);

    if (!definitionIndex.has(reward.cardDefinitionId)) {
      issues.push(
        issue(
          'UNKNOWN_CARD_DEFINITION',
          `${path}/cardDefinitionId`,
          `존재하지 않는 보상 카드 정의입니다: ${reward.cardDefinitionId}`,
        ),
      );
    }

    if (!Number.isInteger(reward.weight) || reward.weight <= 0) {
      issues.push(issue('INVALID_REWARD', `${path}/weight`, '보상 가중치는 양의 정수여야 합니다.'));
    }

    if (blueprint !== undefined && !blueprintDefinitionIds.has(reward.cardDefinitionId)) {
      issues.push(
        issue(
          'REWARD_NOT_IN_ENEMY_DECK',
          `${path}/cardDefinitionId`,
          `보상 카드는 Stage 적 덱에 포함되어야 합니다: ${reward.cardDefinitionId}`,
        ),
      );
    }
  });

  if (blueprint !== undefined && !rewardIds.has(blueprint.leaderDefinitionId)) {
    issues.push(
      issue(
        'REWARD_LEADER_REQUIRED',
        '/rewards',
        'Stage 보상 후보에는 적 리더가 양의 가중치로 포함되어야 합니다.',
      ),
    );
  }

  return result(issues);
}

export function validateBattleDeck(
  battleDeck: BattleDeck,
  cardDefinitions: readonly CardDefinition[],
): DataValidationResult {
  const issues: DataValidationIssue[] = [];
  const definitionIndex = createDefinitionIndex(cardDefinitions, issues);
  const cardIndex = createUniqueIndex(battleDeck.cards, (card) => card.id, '/cards', issues);

  if (!Number.isInteger(battleDeck.seed) || battleDeck.seed < 0 || battleDeck.seed > 0xffff_ffff) {
    issues.push(issue('INVALID_SEED', '/seed', '전투 시드는 0~4294967295 범위의 정수여야 합니다.'));
  }

  if (battleDeck.cards.length !== CORE_DECK_RULES.totalCards) {
    issues.push(
      issue(
        'DECK_SIZE_INVALID',
        '/cards',
        `전투 덱은 정확히 ${CORE_DECK_RULES.totalCards}개의 전투 카드 인스턴스를 가져야 합니다.`,
      ),
    );
  }

  const definitionCounts = new Map<StableId, number>();
  const originalSourceIds = new Set<StableId>();
  let leaderCount = 0;

  battleDeck.cards.forEach((card, index) => {
    const definition = definitionIndex.get(card.cardDefinitionId);

    if (definition === undefined) {
      issues.push(
        issue(
          'UNKNOWN_CARD_DEFINITION',
          `/cards/${index}/cardDefinitionId`,
          `존재하지 않는 카드 정의입니다: ${card.cardDefinitionId}`,
        ),
      );
    } else if (definition.type === 'LEADER') {
      leaderCount += 1;
    } else {
      const nextCount = (definitionCounts.get(definition.id) ?? 0) + 1;
      definitionCounts.set(definition.id, nextCount);

      if (nextCount > CORE_DECK_RULES.maxCopiesPerUnitDefinition) {
        issues.push(
          issue(
            'COPY_LIMIT_EXCEEDED',
            `/cards/${index}/cardDefinitionId`,
            `전투 덱의 같은 유닛 정의는 최대 ${CORE_DECK_RULES.maxCopiesPerUnitDefinition}장입니다.`,
          ),
        );
      }
    }

    if (card.zone === 'FIELD' && card.fieldPosition === null) {
      issues.push(
        issue(
          'BATTLE_ZONE_MISMATCH',
          `/cards/${index}/fieldPosition`,
          'FIELD 카드에는 fieldPosition이 필요합니다.',
        ),
      );
    } else if (card.zone !== 'FIELD' && card.fieldPosition !== null) {
      issues.push(
        issue(
          'BATTLE_ZONE_MISMATCH',
          `/cards/${index}/fieldPosition`,
          'FIELD 밖의 카드는 fieldPosition을 가질 수 없습니다.',
        ),
      );
    }

    if (card.source.type === 'OWNED') {
      if (battleDeck.source.type !== 'SAVED_DECK') {
        issues.push(
          issue(
            'BATTLE_CARD_SOURCE_MISMATCH',
            `/cards/${index}/source`,
            '적 청사진 전투 덱에는 OWNED 출처 카드를 넣을 수 없습니다.',
          ),
        );
      }

      if (card.id === card.source.cardInstanceId) {
        issues.push(
          issue(
            'BATTLE_CARD_USES_SOURCE_ID',
            `/cards/${index}/id`,
            '전투 카드 ID는 원본 소유 카드 인스턴스 ID와 달라야 합니다.',
          ),
        );
      }

      if (originalSourceIds.has(card.source.cardInstanceId)) {
        issues.push(
          issue(
            'BATTLE_CARD_SOURCE_REUSED',
            `/cards/${index}/source/cardInstanceId`,
            `한 원본 카드 인스턴스를 두 전투 카드가 공유할 수 없습니다: ${card.source.cardInstanceId}`,
          ),
        );
      }
      originalSourceIds.add(card.source.cardInstanceId);
    } else {
      if (
        battleDeck.source.type !== 'ENEMY_BLUEPRINT' ||
        battleDeck.source.enemyDeckBlueprintId !== card.source.enemyDeckBlueprintId
      ) {
        issues.push(
          issue(
            'BATTLE_CARD_SOURCE_MISMATCH',
            `/cards/${index}/source`,
            'BLUEPRINT 카드 출처는 전투 덱의 적 청사진 ID와 같아야 합니다.',
          ),
        );
      }
    }
  });

  const leader = cardIndex.get(battleDeck.leaderId);
  const leaderDefinition =
    leader === undefined ? undefined : definitionIndex.get(leader.cardDefinitionId);

  if (
    leaderCount !== CORE_DECK_RULES.leaderCards ||
    leader === undefined ||
    leaderDefinition?.type !== 'LEADER' ||
    leader.zone !== 'FIELD' ||
    leader.fieldPosition !== 'BACK_CENTER'
  ) {
    issues.push(
      issue(
        'BATTLE_LEADER_INVALID',
        '/leaderId',
        '전투 덱은 후열 중앙 FIELD에 있는 정확히 한 장의 리더를 참조해야 합니다.',
      ),
    );
  }

  const zoneLists: readonly (readonly [BattleZone, string, readonly StableId[]])[] = [
    ['DECK', 'drawPileIds', battleDeck.drawPileIds],
    ['HAND', 'handIds', battleDeck.handIds],
    ['FIELD', 'fieldIds', battleDeck.fieldIds],
    ['DROP', 'dropIds', battleDeck.dropIds],
    ['EXILE', 'exileIds', battleDeck.exileIds],
  ];
  const seenZoneIds = new Set<StableId>();

  for (const [zone, propertyName, cardIds] of zoneLists) {
    cardIds.forEach((cardId, index) => {
      const path = `/${propertyName}/${index}`;

      if (seenZoneIds.has(cardId)) {
        issues.push(
          issue(
            'BATTLE_ZONE_DUPLICATE',
            path,
            `전투 카드는 정확히 한 존에만 있어야 합니다: ${cardId}`,
          ),
        );
        return;
      }
      seenZoneIds.add(cardId);

      const card = cardIndex.get(cardId);
      if (card === undefined) {
        issues.push(
          issue('UNKNOWN_INSTANCE', path, `존이 존재하지 않는 전투 카드를 참조합니다: ${cardId}`),
        );
      } else if (card.zone !== zone) {
        issues.push(
          issue(
            'BATTLE_ZONE_MISMATCH',
            path,
            `존 목록 ${zone}과 카드의 zone ${card.zone}이 일치하지 않습니다.`,
          ),
        );
      }
    });
  }

  for (const card of battleDeck.cards) {
    if (!seenZoneIds.has(card.id)) {
      issues.push(
        issue(
          'BATTLE_CARD_MISSING_FROM_ZONE',
          '/cards',
          `전투 카드가 어떤 존에도 포함되지 않았습니다: ${card.id}`,
        ),
      );
    }
  }

  return result(issues);
}

export function validateSaveSlotState(
  state: SaveSlotState,
  cardDefinitions: readonly CardDefinition[],
  stages: readonly StageDefinition[],
): DataValidationResult {
  const issues: DataValidationIssue[] = [];
  const definitionIndex = createDefinitionIndex(cardDefinitions, issues);
  createInstanceIndex(state.collection, issues);
  validateCardInstanceReferences(state.collection, definitionIndex, issues);

  if (!Number.isInteger(state.slotId) || state.slotId < 1 || state.slotId > 3) {
    issues.push(issue('INVALID_SLOT_ID', '/slotId', '세이브 슬롯 ID는 1~3이어야 합니다.'));
  }

  const deckIndex = createUniqueIndex(state.decks, (deck) => deck.id, '/decks', issues);
  state.decks.forEach((deck, index) => {
    const deckIssues = collectSavedDeckIssues(
      deck,
      {
        collection: state.collection,
        cardDefinitions,
      },
      false,
    );

    deckIssues.forEach((deckIssue) => {
      issues.push({
        ...deckIssue,
        path: `/decks/${index}${deckIssue.path}`,
      });
    });
  });

  if (state.selectedDeckId !== null && !deckIndex.has(state.selectedDeckId)) {
    issues.push(
      issue(
        'SELECTED_DECK_NOT_FOUND',
        '/selectedDeckId',
        `선택한 덱이 세이브 슬롯에 없습니다: ${state.selectedDeckId}`,
      ),
    );
  }

  const stageIndex = createUniqueIndex(stages, (stage) => stage.id, '/stages', issues);
  const unlockedStageIds = new Set<StableId>();

  state.progress.unlockedStageIds.forEach((stageId, index) => {
    if (unlockedStageIds.has(stageId)) {
      issues.push(
        issue(
          'DUPLICATE_ID',
          `/progress/unlockedStageIds/${index}`,
          `해금 Stage ID가 중복되었습니다: ${stageId}`,
        ),
      );
    }
    unlockedStageIds.add(stageId);

    if (!stageIndex.has(stageId)) {
      issues.push(
        issue(
          'UNKNOWN_STAGE',
          `/progress/unlockedStageIds/${index}`,
          `존재하지 않는 Stage입니다: ${stageId}`,
        ),
      );
    }
  });

  const clearedStageIds = new Set<StableId>();
  state.progress.clearedStageIds.forEach((stageId, index) => {
    if (clearedStageIds.has(stageId)) {
      issues.push(
        issue(
          'DUPLICATE_ID',
          `/progress/clearedStageIds/${index}`,
          `클리어 Stage ID가 중복되었습니다: ${stageId}`,
        ),
      );
    }
    clearedStageIds.add(stageId);

    if (!stageIndex.has(stageId)) {
      issues.push(
        issue(
          'UNKNOWN_STAGE',
          `/progress/clearedStageIds/${index}`,
          `존재하지 않는 Stage입니다: ${stageId}`,
        ),
      );
    } else if (!unlockedStageIds.has(stageId)) {
      issues.push(
        issue(
          'CLEARED_STAGE_LOCKED',
          `/progress/clearedStageIds/${index}`,
          `해금되지 않은 Stage를 클리어 상태로 저장할 수 없습니다: ${stageId}`,
        ),
      );
    }
  });

  const runIds = new Set<StableId>();
  const collectionInstanceIds = new Set(
    state.collection.cardInstances.map((cardInstance) => cardInstance.id),
  );

  state.completedStageRuns.forEach((run, index) => {
    const path = `/completedStageRuns/${index}`;

    if (runIds.has(run.runId)) {
      issues.push(
        issue('DUPLICATE_ID', `${path}/runId`, `완료 실행 ID가 중복되었습니다: ${run.runId}`),
      );
    }
    runIds.add(run.runId);

    if (!stageIndex.has(run.stageId)) {
      issues.push(
        issue(
          'UNKNOWN_STAGE',
          `${path}/stageId`,
          `존재하지 않는 Stage 실행 기록입니다: ${run.stageId}`,
        ),
      );
    }

    if (Number.isNaN(Date.parse(run.completedAt))) {
      issues.push(
        issue('INVALID_TIMESTAMP', `${path}/completedAt`, '완료 시각이 유효하지 않습니다.'),
      );
    }

    if (run.result === 'WIN') {
      if (run.rewardCardInstanceId === null) {
        issues.push(
          issue(
            'INVALID_STAGE_RUN_REWARD',
            `${path}/rewardCardInstanceId`,
            '승리한 Stage 실행에는 보상 카드 인스턴스가 필요합니다.',
          ),
        );
      } else if (!collectionInstanceIds.has(run.rewardCardInstanceId)) {
        issues.push(
          issue(
            'UNKNOWN_INSTANCE',
            `${path}/rewardCardInstanceId`,
            `보상 카드 인스턴스가 컬렉션에 없습니다: ${run.rewardCardInstanceId}`,
          ),
        );
      }
    } else if (run.rewardCardInstanceId !== null) {
      issues.push(
        issue(
          'INVALID_STAGE_RUN_REWARD',
          `${path}/rewardCardInstanceId`,
          '패배 또는 무승부 실행에는 보상 카드를 저장할 수 없습니다.',
        ),
      );
    }
  });

  for (const stageId of clearedStageIds) {
    const hasWinningRun = state.completedStageRuns.some(
      (run) => run.stageId === stageId && run.result === 'WIN',
    );

    if (!hasWinningRun) {
      issues.push(
        issue(
          'STAGE_NOT_CLEARED',
          '/progress/clearedStageIds',
          `클리어 Stage에는 승리 실행 기록이 필요합니다: ${stageId}`,
        ),
      );
    }
  }

  if (Number.isNaN(Date.parse(state.lastModifiedAt))) {
    issues.push(
      issue('INVALID_TIMESTAMP', '/lastModifiedAt', '마지막 수정 시각이 유효하지 않습니다.'),
    );
  }

  return result(issues);
}
