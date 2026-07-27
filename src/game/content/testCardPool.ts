import type {
  CardCatalog,
  CardInstance,
  EnemyDeckBlueprint,
  OwnedCollection,
  SavedDeck,
  StableId,
  StageRewardEntry,
} from '../data/contracts.js';
import { ALLIED_CARD_DESIGNS } from './alliedCardDesigns.js';
import type { CardDesignRecord } from './cardDesign.js';
import { ENEMY_CARD_DESIGNS } from './enemyCardDesigns.js';

export const CARD_ART_DIRECTION_VERSION = 'phase-3-card-identity-v1' as const;
export const ALLIED_STARTER_DECK_SOURCE_ID = 'allied-starter-deck' as const;
export const ENEMY_TEST_DECK_BLUEPRINT_ID = 'enemy-test-deck' as const;

export const TEST_CARD_DESIGNS: readonly CardDesignRecord[] = Object.freeze([
  ...ALLIED_CARD_DESIGNS,
  ...ENEMY_CARD_DESIGNS,
]);

export const TEST_CARD_CATALOG: CardCatalog = Object.freeze({
  cardDefinitions: Object.freeze(TEST_CARD_DESIGNS.map((design) => design.definition)),
  cardPresentations: Object.freeze(TEST_CARD_DESIGNS.map((design) => design.presentation)),
});

function requireLeader(
  designs: readonly CardDesignRecord[],
  factionLabel: string,
): CardDesignRecord {
  const leaders = designs.filter((design) => design.definition.type === 'LEADER');

  if (leaders.length !== 1) {
    throw new Error(`${factionLabel} 카드 풀에는 리더 정의가 정확히 하나 필요합니다.`);
  }

  const leader = leaders[0];

  if (leader === undefined) {
    throw new Error(`${factionLabel} 카드 풀의 리더 정의를 찾을 수 없습니다.`);
  }

  return leader;
}

const enemyLeader = requireLeader(ENEMY_CARD_DESIGNS, '적군');
const enemyUnits = ENEMY_CARD_DESIGNS.filter((design) => design.definition.type === 'UNIT');

export const ENEMY_TEST_DECK_BLUEPRINT: EnemyDeckBlueprint = Object.freeze({
  id: ENEMY_TEST_DECK_BLUEPRINT_ID,
  leaderDefinitionId: enemyLeader.definition.id,
  unitEntries: Object.freeze(
    enemyUnits.map((design) =>
      Object.freeze({
        cardDefinitionId: design.definition.id,
        quantity: design.deckQuantity,
      }),
    ),
  ),
});

export const STAGE_ONE_REWARD_ENTRIES: readonly StageRewardEntry[] = Object.freeze(
  ENEMY_CARD_DESIGNS.map((design) => {
    if (design.stageOneRewardWeight === null) {
      throw new Error(`적군 카드에 Stage 01 보상 가중치가 없습니다: ${design.definition.id}`);
    }

    return Object.freeze({
      cardDefinitionId: design.definition.id,
      weight: design.stageOneRewardWeight,
    });
  }),
);

export type StarterContentIdRequest =
  | {
      readonly kind: 'SAVED_DECK';
      readonly sourceId: typeof ALLIED_STARTER_DECK_SOURCE_ID;
    }
  | {
      readonly kind: 'CARD_INSTANCE';
      readonly sourceId: StableId;
      readonly copyIndex: number;
    };

export type StarterContentIdFactory = (request: StarterContentIdRequest) => StableId;

export interface AlliedStarterDeckContent {
  readonly collection: OwnedCollection;
  readonly deck: SavedDeck;
}

function claimUniqueId(
  createId: StarterContentIdFactory,
  request: StarterContentIdRequest,
  claimedIds: Set<StableId>,
): StableId {
  const id = createId(request);

  if (id.length === 0) {
    throw new Error('starter 콘텐츠 ID factory는 빈 ID를 반환할 수 없습니다.');
  }

  if (claimedIds.has(id)) {
    throw new Error(`starter 콘텐츠 ID factory가 중복 ID를 반환했습니다: ${id}`);
  }

  claimedIds.add(id);
  return id;
}

export function createAlliedStarterDeckContent(
  createId: StarterContentIdFactory,
): AlliedStarterDeckContent {
  const alliedLeader = requireLeader(ALLIED_CARD_DESIGNS, '아군');
  const alliedUnits = ALLIED_CARD_DESIGNS.filter((design) => design.definition.type === 'UNIT');
  const claimedIds = new Set<StableId>();
  const leaderInstance: CardInstance = Object.freeze({
    id: claimUniqueId(
      createId,
      {
        kind: 'CARD_INSTANCE',
        sourceId: alliedLeader.definition.id,
        copyIndex: 0,
      },
      claimedIds,
    ),
    cardDefinitionId: alliedLeader.definition.id,
  });
  const unitInstances: readonly CardInstance[] = Object.freeze(
    alliedUnits.flatMap((design) =>
      Array.from({ length: design.deckQuantity }, (_, copyIndex) =>
        Object.freeze({
          id: claimUniqueId(
            createId,
            {
              kind: 'CARD_INSTANCE',
              sourceId: design.definition.id,
              copyIndex,
            },
            claimedIds,
          ),
          cardDefinitionId: design.definition.id,
        }),
      ),
    ),
  );
  const deckId = claimUniqueId(
    createId,
    {
      kind: 'SAVED_DECK',
      sourceId: ALLIED_STARTER_DECK_SOURCE_ID,
    },
    claimedIds,
  );
  const collection: OwnedCollection = Object.freeze({
    cardInstances: Object.freeze([leaderInstance, ...unitInstances]),
  });
  const deck: SavedDeck = Object.freeze({
    id: deckId,
    name: '태양잎 원정대',
    leaderInstanceId: leaderInstance.id,
    unitInstanceIds: Object.freeze(unitInstances.map((instance) => instance.id)),
  });

  return Object.freeze({
    collection,
    deck,
  });
}
