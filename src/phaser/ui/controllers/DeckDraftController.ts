import type { CardDefinition } from '../../../game/cards/card.js';
import {
  CORE_DECK_RULES,
  validatePlayableSavedDeck,
  validateSavedDeckForStorage,
  type CardInstance,
  type DataValidationIssue,
  type OwnedCollection,
  type SavedDeck,
  type StableId,
} from '../../../game/data/index.js';

export type DeckDraftMutationCode =
  | 'UPDATED'
  | 'CARD_NOT_OWNED'
  | 'WRONG_CARD_TYPE'
  | 'CARD_ALREADY_IN_DECK'
  | 'CARD_NOT_IN_DECK'
  | 'DECK_TOO_LARGE'
  | 'COPY_LIMIT_REACHED';

export interface DeckDraftMutationResult {
  readonly changed: boolean;
  readonly code: DeckDraftMutationCode;
  readonly message: string;
  readonly deck: SavedDeck;
}

function freezeDeck(deck: SavedDeck): SavedDeck {
  return Object.freeze({
    ...deck,
    unitInstanceIds: Object.freeze([...deck.unitInstanceIds]),
  });
}

function mutationResult(
  changed: boolean,
  code: DeckDraftMutationCode,
  message: string,
  deck: SavedDeck,
): DeckDraftMutationResult {
  return Object.freeze({
    changed,
    code,
    message,
    deck,
  });
}

export class DeckDraftController {
  private readonly collection: OwnedCollection;
  private readonly definitionById: ReadonlyMap<StableId, CardDefinition>;
  private readonly instanceById: ReadonlyMap<StableId, CardInstance>;
  private draft: SavedDeck;

  constructor(
    deck: SavedDeck,
    collection: OwnedCollection,
    cardDefinitions: readonly CardDefinition[],
  ) {
    this.collection = collection;
    this.definitionById = new Map(cardDefinitions.map((definition) => [definition.id, definition]));
    this.instanceById = new Map(
      collection.cardInstances.map((instance) => [instance.id, instance]),
    );
    this.draft = freezeDeck(deck);
  }

  get value(): SavedDeck {
    return freezeDeck(this.draft);
  }

  addCard(instanceId: StableId): DeckDraftMutationResult {
    const instance = this.instanceById.get(instanceId);
    if (instance === undefined) {
      return this.unchanged('CARD_NOT_OWNED', '소유하지 않은 카드는 덱에 넣을 수 없습니다.');
    }

    const definition = this.definitionById.get(instance.cardDefinitionId);
    return definition?.type === 'LEADER' ? this.setLeader(instanceId) : this.addUnit(instanceId);
  }

  removeCard(instanceId: StableId): DeckDraftMutationResult {
    return this.draft.leaderInstanceId === instanceId
      ? this.clearLeader()
      : this.removeUnit(instanceId);
  }

  toggleCard(instanceId: StableId): DeckDraftMutationResult {
    return this.draft.leaderInstanceId === instanceId ||
      this.draft.unitInstanceIds.includes(instanceId)
      ? this.removeCard(instanceId)
      : this.addCard(instanceId);
  }

  setLeader(instanceId: StableId): DeckDraftMutationResult {
    const instance = this.instanceById.get(instanceId);

    if (instance === undefined) {
      return this.unchanged('CARD_NOT_OWNED', '소유하지 않은 카드는 리더로 선택할 수 없습니다.');
    }

    const definition = this.definitionById.get(instance.cardDefinitionId);

    if (definition?.type !== 'LEADER') {
      return this.unchanged('WRONG_CARD_TYPE', 'LEADER 카드만 리더 슬롯에 둘 수 있습니다.');
    }

    if (this.draft.leaderInstanceId === instanceId) {
      return this.unchanged('CARD_ALREADY_IN_DECK', '이미 선택된 리더입니다.');
    }

    this.draft = freezeDeck({
      ...this.draft,
      leaderInstanceId: instanceId,
    });
    return mutationResult(
      true,
      'UPDATED',
      `${definition.name}을(를) 리더로 선택했습니다.`,
      this.value,
    );
  }

  clearLeader(): DeckDraftMutationResult {
    if (this.draft.leaderInstanceId === null) {
      return this.unchanged('CARD_NOT_IN_DECK', '현재 덱에 선택된 리더가 없습니다.');
    }

    this.draft = freezeDeck({
      ...this.draft,
      leaderInstanceId: null,
    });
    return mutationResult(
      true,
      'UPDATED',
      '리더 슬롯을 비웠습니다. 미완성 덱으로 저장할 수 있지만 전투는 시작할 수 없습니다.',
      this.value,
    );
  }

  addUnit(instanceId: StableId): DeckDraftMutationResult {
    const instance = this.instanceById.get(instanceId);

    if (instance === undefined) {
      return this.unchanged('CARD_NOT_OWNED', '소유하지 않은 카드는 덱에 넣을 수 없습니다.');
    }

    const definition = this.definitionById.get(instance.cardDefinitionId);

    if (definition?.type !== 'UNIT') {
      return this.unchanged('WRONG_CARD_TYPE', 'UNIT 카드만 유닛 영역에 넣을 수 있습니다.');
    }

    if (this.draft.unitInstanceIds.includes(instanceId)) {
      return this.unchanged('CARD_ALREADY_IN_DECK', '이미 덱에 들어 있는 카드입니다.');
    }

    if (this.draft.unitInstanceIds.length >= CORE_DECK_RULES.unitCards) {
      return this.unchanged(
        'DECK_TOO_LARGE',
        `리더를 포함해 ${CORE_DECK_RULES.totalCards}장을 넘길 수 없습니다.`,
      );
    }

    const copies = this.draft.unitInstanceIds.reduce((count, candidateId) => {
      const candidate = this.instanceById.get(candidateId);
      return candidate?.cardDefinitionId === instance.cardDefinitionId ? count + 1 : count;
    }, 0);

    if (copies >= CORE_DECK_RULES.maxCopiesPerUnitDefinition) {
      return this.unchanged(
        'COPY_LIMIT_REACHED',
        `같은 유닛 정의는 최대 ${CORE_DECK_RULES.maxCopiesPerUnitDefinition}장까지 넣을 수 있습니다.`,
      );
    }

    this.draft = freezeDeck({
      ...this.draft,
      unitInstanceIds: [...this.draft.unitInstanceIds, instanceId],
    });
    return mutationResult(
      true,
      'UPDATED',
      `${definition.name}을(를) 덱에 추가했습니다.`,
      this.value,
    );
  }

  removeUnit(instanceId: StableId): DeckDraftMutationResult {
    const index = this.draft.unitInstanceIds.indexOf(instanceId);

    if (index === -1) {
      return this.unchanged('CARD_NOT_IN_DECK', '현재 덱에 없는 카드입니다.');
    }

    const instance = this.instanceById.get(instanceId);
    const definition =
      instance === undefined ? undefined : this.definitionById.get(instance.cardDefinitionId);
    const unitInstanceIds = [...this.draft.unitInstanceIds];
    unitInstanceIds.splice(index, 1);
    this.draft = freezeDeck({
      ...this.draft,
      unitInstanceIds,
    });
    return mutationResult(
      true,
      'UPDATED',
      `${definition?.name ?? instanceId}을(를) 덱에서 제거했습니다.`,
      this.value,
    );
  }

  getStorageIssues(): readonly DataValidationIssue[] {
    const result = validateSavedDeckForStorage(this.draft, {
      collection: this.collection,
      cardDefinitions: [...this.definitionById.values()],
    });
    return result.valid ? Object.freeze([]) : result.issues;
  }

  getPlayableIssues(): readonly DataValidationIssue[] {
    const result = validatePlayableSavedDeck(this.draft, {
      collection: this.collection,
      cardDefinitions: [...this.definitionById.values()],
    });
    return result.valid ? Object.freeze([]) : result.issues;
  }

  private unchanged(code: DeckDraftMutationCode, message: string): DeckDraftMutationResult {
    return mutationResult(false, code, message, this.value);
  }
}
