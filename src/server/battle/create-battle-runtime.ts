import type { GameSession, RuntimeCardInstance } from '../../game/save/session';
import {
  createRuntimeDeckInstanceFromDefinitions,
  readCardDefinitionFile,
} from '../../game/save/deck-instancing';
import { createRuntimeDeckWithEquipment } from '../../game/save/equipment';
import type { StageEnemyDeckDefinition } from '../../game/stage/types';
import {
  ENEMY_INITIAL_LEADER_SLOT,
  INITIAL_HAND_SIZE,
  PLAYER_INITIAL_LEADER_SLOT,
  type BattleCardRuntimeState,
  type BattleParticipantRuntimeState,
  type BattleRuntimeState,
  type BattleRuntimeZone,
  type BattleSide,
  type BattleSlotId,
} from '../../game/battle/types';

export type CreateInitialBattleRuntimeOptions = {
  session: GameSession;
  /**
   * Stage가 지정한 적 덱이다. 호출자가 읽어서 넣는다.
   *
   * 여기서 Stage 정의를 직접 찾지 않는다. Stage 카탈로그는 브라우저 번들러 기능으로 파일을 모으는데,
   * 이 모듈은 그 번들러 밖의 Node 서버에서 돈다.
   */
  enemyDeck: StageEnemyDeckDefinition;
  random?: (() => number) | undefined;
};

/**
 * 저장 슬롯의 플레이어 덱과 Stage가 지정한 적 덱을 전투 중에만 쓰는 런타임 Zone 상태로 변환한다.
 * 저장 호환용 `LEADER` Zone은 사용하지 않고, 양측 리더는 각자의 `Side:BC` 전장 슬롯에 배치한다.
 * 양측 일반 카드는 원본 순서를 보존한 채 전투용 복사본만 섞은 뒤 초기 손패를 나눈다.
 */
export function createInitialBattleRuntime(
  options: CreateInitialBattleRuntimeOptions,
): BattleRuntimeState {
  const random = options.random ?? Math.random;
  const playerDeck = createRuntimeDeckWithEquipment(options.session);
  const player = createBattleParticipantRuntimeState(
    'player',
    playerDeck,
    PLAYER_INITIAL_LEADER_SLOT,
    random,
  );
  const enemyDeck = createRuntimeDeckInstanceFromDefinitions({
    deckId: options.enemyDeck.deckId,
    cardDefinitions: readCardDefinitionFile(options.enemyDeck.cardDefinitionFile).cards,
    owner: 'ENEMY',
    unitCount: 29,
  });
  const enemy = createBattleParticipantRuntimeState(
    'enemy',
    enemyDeck,
    ENEMY_INITIAL_LEADER_SLOT,
    random,
  );

  return {
    currentSide: 'player',
    turnNumber: 1,
    phase: 'MAIN',
    outcome: null,
    player,
    enemy,
    battlefield: [enemy.leader, player.leader],
    drop: [],
    exile: [],
  };
}

function createBattleParticipantRuntimeState(
  side: BattleSide,
  deck: GameSession['deck'],
  leaderSlot: BattleSlotId,
  random: () => number,
): BattleParticipantRuntimeState {
  const leader = createBattleCardRuntimeState(side, deck.leader, 'BATTLEFIELD', {
    battlefieldSlot: leaderSlot,
    enteredBattlefieldTurnNumber: 1,
  });
  const shuffledCards = shuffleCards(deck.cards, random);
  const hand = shuffledCards
    .slice(0, INITIAL_HAND_SIZE)
    .map((card, handIndex) => createBattleCardRuntimeState(side, card, 'HAND', { handIndex }));
  const remainingDeck = shuffledCards
    .slice(INITIAL_HAND_SIZE)
    .map((card, deckIndex) => createBattleCardRuntimeState(side, card, 'DECK', { deckIndex }));

  return {
    side,
    leader,
    deck: remainingDeck,
    hand,
    drop: [],
    exile: [],
  };
}

/** 원본 덱 배열을 변경하지 않고 Fisher-Yates 방식으로 전투용 임시 순서를 만든다. */
function shuffleCards(
  cards: readonly RuntimeCardInstance[],
  random: () => number,
): RuntimeCardInstance[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = random();
    const swapIndex = Number.isFinite(randomValue)
      ? Math.min(index, Math.max(0, Math.floor(randomValue * (index + 1))))
      : index;
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }

  return shuffled;
}

type CreateBattleCardRuntimeStateOptions = {
  battlefieldSlot?: BattleSlotId;
  enteredBattlefieldTurnNumber?: number;
  handIndex?: number;
  deckIndex?: number;
};

function createBattleCardRuntimeState(
  side: BattleSide,
  card: RuntimeCardInstance,
  zone: BattleRuntimeZone,
  options: CreateBattleCardRuntimeStateOptions,
): BattleCardRuntimeState {
  return {
    card: createBattleRuntimeCardInstance(card),
    side,
    zone,
    battlefieldSlot: options.battlefieldSlot ?? null,
    enteredBattlefieldTurnNumber: options.enteredBattlefieldTurnNumber ?? null,
    handIndex: options.handIndex ?? null,
    deckIndex: options.deckIndex ?? null,
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasUsedActiveSkillThisTurn: false,
    abilityEffects: [],
  };
}

function createBattleRuntimeCardInstance(card: RuntimeCardInstance): RuntimeCardInstance {
  return {
    instance: structuredClone(card.instance),
    definition: card.definition,
  };
}
