import type {
  ActiveSkill,
  CardDefinition,
  Effect,
  EffectTarget,
  ReactiveSkill,
} from '../../cards/card.js';
import {
  CORE_DECK_RULES,
  type BattleDeck,
  type BattleFieldPosition,
  type BattleZone,
  type StableId,
} from '../../data/contracts.js';
import { validateBattleDeck } from '../../data/validation.js';
import {
  battleActionKey,
  getLegalBattleActions,
  hasPlayableBattleActions,
  isAttackStillLegal,
  isLegalBattleAction,
} from './rules.js';
import {
  cloneBattleState,
  createEmptyBattleField,
  createEmptyStatModifiers,
  freezeBattleState,
  getAdjacentBattleFields,
  getBattleEffectiveStats,
  getCardDefinition,
  getFieldDominance,
  locateBattleCard,
  otherBattlePlayerId,
  type MutableBattleCardState,
  type MutableBattlePlayerState,
  type MutableBattleState,
} from './state.js';
import {
  BATTLE_FIELD_POSITIONS,
  type ActionResolution,
  type BattleAction,
  type BattleDecisionProvider,
  type BattleEntityRef,
  type BattleEvent,
  type BattlePlayerId,
  type BattleResult,
  type BattleSetup,
  type BattleState,
  type DiscardDecision,
  type EffectFieldDecision,
  type ReactiveSkillChoice,
  type ReactiveSkillOrderDecision,
  type ResolutionStep,
} from './types.js';

const UINT32_MAX = 0xffff_ffff;
const STARTING_HAND_SIZE = 5;
const MAXIMUM_HAND_SIZE = 7;
const MAXIMUM_AUTOMATIC_TURN_ADVANCES = 128;

export class InvalidBattleSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBattleSetupError';
  }
}

export class IllegalBattleActionError extends Error {
  readonly action: BattleAction;

  constructor(action: BattleAction) {
    super(`현재 상태에서 합법적이지 않은 전투 Action입니다: ${battleActionKey(action)}`);
    this.name = 'IllegalBattleActionError';
    this.action = action;
  }
}

export class InvalidBattleDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBattleDecisionError';
  }
}

function compareReactiveChoices(left: ReactiveSkillChoice, right: ReactiveSkillChoice): number {
  const skillComparison = left.skillId.localeCompare(right.skillId);
  return skillComparison !== 0
    ? skillComparison
    : left.sourceCardId.localeCompare(right.sourceCardId);
}

export const DETERMINISTIC_BATTLE_DECISIONS: BattleDecisionProvider = Object.freeze({
  orderReactiveSkills: (decision: ReactiveSkillOrderDecision) =>
    Object.freeze([...decision.choices].sort(compareReactiveChoices)),
  chooseEffectField: (decision: EffectFieldDecision) => {
    const selected = decision.legalPositions[0];

    if (selected === undefined) {
      throw new InvalidBattleDecisionError('선택할 수 있는 합법 Field가 없습니다.');
    }

    return selected;
  },
  chooseDiscardCards: (decision: DiscardDecision) =>
    Object.freeze(decision.handCardIds.slice(0, decision.count)),
});

function assertSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new InvalidBattleSetupError('전투 시드는 0~4294967295 범위의 정수여야 합니다.');
  }
}

function createSeededRandom(seed: number): () => number {
  let state = (seed ^ 0x6d2b_79f5) >>> 0;

  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffleIds(ids: readonly StableId[], seed: number): StableId[] {
  const shuffled = [...ids];
  const random = createSeededRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    const swap = shuffled[swapIndex];

    if (current === undefined || swap === undefined) {
      throw new Error('셔플할 전투 카드 ID를 찾을 수 없습니다.');
    }

    shuffled[index] = swap;
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

function deriveSeed(seed: number, playerId: BattlePlayerId): number {
  const salt = playerId === 'PLAYER' ? 0x9e37_79b9 : 0x85eb_ca6b;
  return (seed ^ salt) >>> 0;
}

function assertUniqueDefinitionIds(cardDefinitions: readonly CardDefinition[]): void {
  const ids = new Set<StableId>();

  for (const definition of cardDefinitions) {
    if (ids.has(definition.id)) {
      throw new InvalidBattleSetupError(`카드 정의 ID가 중복되었습니다: ${definition.id}`);
    }

    ids.add(definition.id);
  }
}

function assertBattleDeck(
  deck: BattleDeck,
  cardDefinitions: readonly CardDefinition[],
  label: string,
): void {
  const validation = validateBattleDeck(deck, cardDefinitions);

  if (!validation.valid) {
    throw new InvalidBattleSetupError(
      `${label} 전투 덱이 유효하지 않습니다: ${JSON.stringify(validation.issues)}`,
    );
  }
}

function createMutableCards(deck: BattleDeck, ownerId: BattlePlayerId): MutableBattleCardState[] {
  return deck.cards.map((card) => ({
    id: card.id,
    cardDefinitionId: card.cardDefinitionId,
    ownerId,
    source: { ...card.source },
    damage: 0,
    statusIds: [],
    isDeploymentPending: false,
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasUsedActiveSkillThisTurn: false,
    statModifiers: createEmptyStatModifiers(),
    lastDamageSourceCardId: null,
  }));
}

function createMutablePlayer(deck: BattleDeck, playerId: BattlePlayerId): MutableBattlePlayerState {
  const field = createEmptyBattleField();
  field.BACK_CENTER = deck.leaderId;

  return {
    id: playerId,
    battleDeckId: deck.id,
    leaderCardId: deck.leaderId,
    drawPileIds: [...deck.drawPileIds],
    handIds: [],
    field,
    dropIds: [],
    exileIds: [],
    requiredDrawFailed: false,
  };
}

function applyStartingHandAndMulligan(
  player: MutableBattlePlayerState,
  mulliganCardIds: readonly StableId[],
  seed: number,
): void {
  player.handIds.push(...player.drawPileIds.splice(0, STARTING_HAND_SIZE));
  const selectedIds = new Set(mulliganCardIds);

  if (selectedIds.size !== mulliganCardIds.length) {
    throw new InvalidBattleSetupError(`${player.id} 시작 손 교환 카드 ID가 중복되었습니다.`);
  }

  for (const cardId of selectedIds) {
    if (!player.handIds.includes(cardId)) {
      throw new InvalidBattleSetupError(
        `${player.id} 시작 손에 없는 카드는 교환할 수 없습니다: ${cardId}`,
      );
    }
  }

  const excludedIds = player.handIds.filter((cardId) => selectedIds.has(cardId));
  const retainedIds = player.handIds.filter((cardId) => !selectedIds.has(cardId));
  const replacementIds = player.drawPileIds.splice(0, excludedIds.length);

  if (replacementIds.length !== excludedIds.length) {
    throw new InvalidBattleSetupError(`${player.id} 시작 손 교환용 Deck 카드가 부족합니다.`);
  }

  player.handIds = [...retainedIds, ...replacementIds];
  player.drawPileIds.push(...excludedIds);
  player.drawPileIds = shuffleIds(player.drawPileIds, seed);
}

function createUnstartedBattleState(setup: BattleSetup): BattleState {
  assertSeed(setup.seed);
  assertUniqueDefinitionIds(setup.cardDefinitions);
  assertBattleDeck(setup.playerDeck, setup.cardDefinitions, '플레이어');
  assertBattleDeck(setup.enemyDeck, setup.cardDefinitions, '적');

  const claimedCardIds = new Set(setup.playerDeck.cards.map((card) => card.id));

  for (const enemyCard of setup.enemyDeck.cards) {
    if (claimedCardIds.has(enemyCard.id)) {
      throw new InvalidBattleSetupError(
        `양쪽 전투 덱이 같은 전투 카드 ID를 사용합니다: ${enemyCard.id}`,
      );
    }
    claimedCardIds.add(enemyCard.id);
  }

  const player = createMutablePlayer(setup.playerDeck, 'PLAYER');
  const enemy = createMutablePlayer(setup.enemyDeck, 'ENEMY');
  applyStartingHandAndMulligan(
    player,
    setup.playerMulliganCardIds ?? [],
    deriveSeed(setup.seed, 'PLAYER'),
  );
  applyStartingHandAndMulligan(
    enemy,
    setup.enemyMulliganCardIds ?? [],
    deriveSeed(setup.seed, 'ENEMY'),
  );

  const firstPlayerId = setup.firstPlayerId ?? 'PLAYER';
  const mutable: MutableBattleState = {
    schemaVersion: 2,
    seed: setup.seed,
    firstPlayerId,
    activePlayerId: firstPlayerId,
    turnNumber: 1,
    actionCount: 0,
    phase: 'ACTION',
    lastAction: null,
    players: {
      PLAYER: player,
      ENEMY: enemy,
    },
    cards: [
      ...createMutableCards(setup.playerDeck, 'PLAYER'),
      ...createMutableCards(setup.enemyDeck, 'ENEMY'),
    ],
    result: {
      type: 'ONGOING',
      winnerId: null,
      loserIds: [],
      reason: null,
    },
  };

  return freezeBattleState(mutable);
}

export function createBattleState(setup: BattleSetup): BattleState {
  const unstartedState = createUnstartedBattleState(setup);
  const resolver = new BattleResolver(
    unstartedState,
    setup.cardDefinitions,
    DETERMINISTIC_BATTLE_DECISIONS,
  );
  resolver.startInitialTurn();
  return resolver.getFinalState();
}

interface ReactionChain {
  readonly firedSkillInstanceIds: Set<StableId>;
}

interface SkillInvocation {
  readonly sourceCardId: StableId;
  readonly sourceOwnerId: BattlePlayerId;
  readonly skill: ActiveSkill | ReactiveSkill;
  readonly actionTarget: BattleEntityRef | null;
  readonly triggerEvents: readonly BattleEvent[];
}

interface QueuedReactiveInvocation extends SkillInvocation {
  readonly skill: ReactiveSkill;
}

function createReactionChain(): ReactionChain {
  return {
    firedSkillInstanceIds: new Set<StableId>(),
  };
}

function playerRef(playerId: BattlePlayerId): BattleEntityRef {
  return Object.freeze({ type: 'PLAYER', playerId });
}

function cardRef(cardId: StableId): BattleEntityRef {
  return Object.freeze({ type: 'CARD', cardId });
}

function sameEntity(left: BattleEntityRef, right: BattleEntityRef): boolean {
  return left.type === 'PLAYER'
    ? right.type === 'PLAYER' && left.playerId === right.playerId
    : right.type === 'CARD' && left.cardId === right.cardId;
}

function uniqueEntity(entities: readonly (BattleEntityRef | null)[]): BattleEntityRef | null {
  let unique: BattleEntityRef | null = null;

  for (const entity of entities) {
    if (entity === null) {
      continue;
    }

    if (unique === null) {
      unique = entity;
      continue;
    }

    if (!sameEntity(unique, entity)) {
      return null;
    }
  }

  return unique;
}

function freezeEvents(events: readonly BattleEvent[]): readonly BattleEvent[] {
  return Object.freeze(events.map((event) => Object.freeze(event)));
}

class BattleResolver {
  private readonly state: MutableBattleState;
  private readonly cardDefinitions: readonly CardDefinition[];
  private readonly decisions: BattleDecisionProvider;
  private readonly steps: ResolutionStep[] = [];
  private stepSequence = 0;

  constructor(
    state: BattleState,
    cardDefinitions: readonly CardDefinition[],
    decisions: BattleDecisionProvider,
  ) {
    this.state = cloneBattleState(state);
    this.cardDefinitions = cardDefinitions;
    this.decisions = decisions;
  }

  getFinalState(): BattleState {
    return freezeBattleState(this.state);
  }

  startInitialTurn(): void {
    this.beginTurn(false);

    if (
      this.state.result.type === 'ONGOING' &&
      !hasPlayableBattleActions(this.snapshot(), this.cardDefinitions)
    ) {
      this.finishTurn();
    }
  }

  resolve(action: BattleAction): ActionResolution {
    const beforeState = this.getFinalState();

    if (!isLegalBattleAction(beforeState, this.cardDefinitions, action)) {
      throw new IllegalBattleActionError(action);
    }

    const actionChain = createReactionChain();
    const actionPlayerId = this.state.activePlayerId;
    this.runAtomic('action:start', actionChain, () => {
      this.state.actionCount += 1;
      this.state.lastAction = { ...action };
      return [
        Object.freeze({
          type: 'ACTION_STARTED',
          triggerType: null,
          subject: playerRef(actionPlayerId),
          source: this.getActionSource(action, actionPlayerId),
          playerId: actionPlayerId,
          action: Object.freeze({ ...action }),
        }),
      ];
    });

    if (this.state.result.type === 'ONGOING') {
      this.resolveSelectedAction(action, actionChain);
    }

    if (
      this.state.result.type === 'ONGOING' &&
      (action.type === 'END_TURN' ||
        !hasPlayableBattleActions(this.snapshot(), this.cardDefinitions))
    ) {
      this.finishTurn();
    }

    const finalState = this.getFinalState();
    return Object.freeze({
      action: Object.freeze({ ...action }),
      beforeState,
      finalState,
      steps: Object.freeze([...this.steps]),
    });
  }

  private snapshot(): BattleState {
    return freezeBattleState(this.state);
  }

  private mutableCard(cardId: StableId): MutableBattleCardState {
    const card = this.state.cards.find((candidate) => candidate.id === cardId);

    if (card === undefined) {
      throw new Error(`전투 카드 ID를 찾을 수 없습니다: ${cardId}`);
    }

    return card;
  }

  private recordStep(
    effectId: StableId,
    beforeState: BattleState,
    events: readonly BattleEvent[],
  ): void {
    const id = `resolution-${this.state.actionCount}-step-${String(this.stepSequence).padStart(
      4,
      '0',
    )}`;
    this.stepSequence += 1;
    this.steps.push(
      Object.freeze({
        id,
        effectId,
        beforeState,
        afterState: this.snapshot(),
        events: freezeEvents(events),
      }),
    );
  }

  private runAtomic(
    effectId: StableId,
    chain: ReactionChain,
    mutate: () => readonly BattleEvent[],
  ): readonly BattleEvent[] {
    if (this.state.result.type !== 'ONGOING') {
      return Object.freeze([]);
    }

    const beforeState = this.snapshot();
    const events = freezeEvents(mutate());
    this.recordStep(effectId, beforeState, events);
    this.performStateChecks(chain);

    if (this.state.result.type === 'ONGOING' && events.length > 0) {
      this.resolveReactions(events, chain);
    }

    return events;
  }

  private getActionSource(action: BattleAction, playerId: BattlePlayerId): BattleEntityRef {
    switch (action.type) {
      case 'PLACE':
      case 'MOVE':
      case 'ATTACK':
      case 'ACTIVE':
        return cardRef(action.cardId);
      case 'END_TURN':
        return playerRef(playerId);
    }
  }

  private resolveSelectedAction(action: BattleAction, chain: ReactionChain): void {
    switch (action.type) {
      case 'PLACE':
        this.resolvePlaceAction(action, chain);
        break;
      case 'MOVE':
        this.resolveMoveAction(action, chain);
        break;
      case 'ATTACK':
        this.resolveAttackAction(action, chain);
        break;
      case 'ACTIVE':
        this.resolveActiveAction(action, chain);
        break;
      case 'END_TURN':
        break;
    }
  }

  private captureActiveSkill(
    sourceCardId: StableId,
    actionTarget: BattleEntityRef | null,
  ): SkillInvocation {
    const card = this.mutableCard(sourceCardId);
    const definition = getCardDefinition(this.cardDefinitions, card.cardDefinitionId);
    const skill = definition.activeSkill;

    if (skill === undefined) {
      throw new Error(`합법 Action의 Active Skill 출처가 유효하지 않습니다: ${sourceCardId}`);
    }

    return {
      sourceCardId,
      sourceOwnerId: card.ownerId,
      skill,
      actionTarget,
      triggerEvents: Object.freeze([]),
    };
  }

  private resolvePlaceAction(
    action: Extract<BattleAction, { readonly type: 'PLACE' }>,
    chain: ReactionChain,
  ): void {
    const playerId = this.state.activePlayerId;
    this.runAtomic('action:PLACE', chain, () => {
      this.moveCardToZone(action.cardId, 'FIELD', action.fieldPosition);
      return [
        Object.freeze({
          type: 'PLACE',
          triggerType: 'CARD_PLACED',
          subject: cardRef(action.cardId),
          source: cardRef(action.cardId),
          playerId,
          cardId: action.cardId,
          to: action.fieldPosition,
        }),
      ];
    });
  }

  private resolveMoveAction(
    action: Extract<BattleAction, { readonly type: 'MOVE' }>,
    chain: ReactionChain,
  ): void {
    const card = this.mutableCard(action.cardId);
    const location = locateBattleCard(this.state, action.cardId);

    if (location.fieldPosition === null) {
      throw new Error('합법 MOVE 출처에 Field 위치가 없습니다.');
    }

    const from = location.fieldPosition;
    this.runAtomic('action:MOVE', chain, () => {
      this.moveCardWithinField(action.cardId, action.fieldPosition);
      card.hasMovedThisTurn = true;
      return [
        Object.freeze({
          type: 'MOVE',
          triggerType: 'CARD_MOVED',
          subject: cardRef(action.cardId),
          source: cardRef(action.cardId),
          playerId: card.ownerId,
          cardId: action.cardId,
          from,
          to: action.fieldPosition,
        }),
      ];
    });
  }

  private resolveAttackAction(
    action: Extract<BattleAction, { readonly type: 'ATTACK' }>,
    chain: ReactionChain,
  ): void {
    const attacker = this.mutableCard(action.cardId);

    this.runAtomic('action:ATTACK:declared', chain, () => {
      attacker.hasAttackedThisTurn = true;
      return [
        Object.freeze({
          type: 'ATTACK_DECLARED',
          triggerType: 'ATTACK_DECLARED',
          subject: cardRef(action.cardId),
          source: cardRef(action.cardId),
          attackerCardId: action.cardId,
          targetCardId: action.targetCardId,
        }),
      ];
    });

    if (
      this.state.result.type !== 'ONGOING' ||
      !isAttackStillLegal(this.snapshot(), action.cardId, action.targetCardId)
    ) {
      if (this.state.result.type === 'ONGOING') {
        const playerId = this.state.activePlayerId;
        this.runAtomic('action:ATTACK:cancelled', chain, () => [
          Object.freeze({
            type: 'ACTION_CANCELLED',
            triggerType: null,
            subject: playerRef(playerId),
            source: cardRef(action.cardId),
            playerId,
            action: Object.freeze({ ...action }),
            reason: 'ATTACK_DECLARED 반응 후 공격자 또는 대상이 더는 합법적이지 않습니다.',
          }),
        ]);
      }
      return;
    }

    this.runCombatDamage(action.cardId, action.targetCardId, chain);
  }

  private resolveActiveAction(
    action: Extract<BattleAction, { readonly type: 'ACTIVE' }>,
    chain: ReactionChain,
  ): void {
    const source = this.mutableCard(action.cardId);
    const invocation = this.captureActiveSkill(
      action.cardId,
      action.targetCardId === undefined ? null : cardRef(action.targetCardId),
    );
    this.runAtomic('action:ACTIVE:used', chain, () => {
      source.hasUsedActiveSkillThisTurn = true;
      return Object.freeze([]);
    });
    if (this.state.result.type === 'ONGOING') {
      this.resolveSkill(invocation, chain);
    }
  }

  private runCombatDamage(
    attackerCardId: StableId,
    targetCardId: StableId,
    chain: ReactionChain,
  ): void {
    const attackerStats = getBattleEffectiveStats(this.state, this.cardDefinitions, attackerCardId);
    const targetStats = getBattleEffectiveStats(this.state, this.cardDefinitions, targetCardId);
    const target = this.mutableCard(targetCardId);
    const canCounterattack = !target.isDeploymentPending;

    this.runAtomic('action:ATTACK:combat', chain, () => {
      const events: BattleEvent[] = [];

      if (attackerStats.attack > 0) {
        target.damage += attackerStats.attack;
        target.lastDamageSourceCardId = attackerCardId;
        events.push(
          Object.freeze({
            type: 'DAMAGE',
            triggerType: 'DAMAGE_RECEIVED',
            subject: cardRef(targetCardId),
            source: cardRef(attackerCardId),
            targetCardId,
            amount: attackerStats.attack,
          }),
        );
      }

      if (canCounterattack && targetStats.attack > 0) {
        const attacker = this.mutableCard(attackerCardId);
        attacker.damage += targetStats.attack;
        attacker.lastDamageSourceCardId = targetCardId;
        events.push(
          Object.freeze({
            type: 'DAMAGE',
            triggerType: 'DAMAGE_RECEIVED',
            subject: cardRef(attackerCardId),
            source: cardRef(targetCardId),
            targetCardId: attackerCardId,
            amount: targetStats.attack,
          }),
        );
      }

      return events;
    });
  }

  private runDrawStep(
    effectId: StableId,
    playerId: BattlePlayerId,
    count: number,
    source: BattleEntityRef,
    chain: ReactionChain,
  ): void {
    this.runAtomic(effectId, chain, () => {
      const player = this.state.players[playerId];
      const cardIds: StableId[] = [];

      for (let index = 0; index < count; index += 1) {
        const cardId = player.drawPileIds.shift();

        if (cardId === undefined) {
          player.requiredDrawFailed = true;
          break;
        }

        player.handIds.push(cardId);
        cardIds.push(cardId);
      }

      if (cardIds.length === 0) {
        return Object.freeze([]);
      }

      return [
        Object.freeze({
          type: 'DRAW',
          triggerType: 'CARD_DRAWN',
          subject: playerRef(playerId),
          source,
          playerId,
          cardIds: Object.freeze(cardIds),
        }),
      ];
    });
  }

  private runDiscardStep(
    effectId: StableId,
    playerId: BattlePlayerId,
    cardIds: readonly StableId[],
    source: BattleEntityRef,
    chain: ReactionChain,
  ): void {
    this.runAtomic(effectId, chain, () => {
      for (const cardId of cardIds) {
        this.moveCardToZone(cardId, 'EXILE');
      }

      if (cardIds.length === 0) {
        return Object.freeze([]);
      }

      return cardIds.map((cardId) =>
        Object.freeze({
          type: 'DISCARD',
          triggerType: 'CARD_DISCARDED',
          subject: cardRef(cardId),
          source,
          playerId,
          cardIds: Object.freeze([cardId]),
        }),
      );
    });
  }

  private finishTurn(): void {
    let automaticAdvanceCount = 0;

    while (this.state.result.type === 'ONGOING') {
      const endingPlayerId = this.state.activePlayerId;
      const turnEndChain = createReactionChain();
      this.runAtomic('rule:turn:end', turnEndChain, () => [
        Object.freeze({
          type: 'TURN_ENDED',
          triggerType: 'TURN_ENDED',
          subject: playerRef(endingPlayerId),
          source: playerRef(endingPlayerId),
          playerId: endingPlayerId,
        }),
      ]);

      if (this.state.result.type !== 'ONGOING') {
        return;
      }

      this.enforceHandLimit(endingPlayerId);

      if (this.state.result.type !== 'ONGOING') {
        return;
      }

      this.beginTurn(false, true);

      if (
        this.state.result.type !== 'ONGOING' ||
        hasPlayableBattleActions(this.snapshot(), this.cardDefinitions)
      ) {
        return;
      }

      automaticAdvanceCount += 1;
      if (automaticAdvanceCount >= MAXIMUM_AUTOMATIC_TURN_ADVANCES) {
        throw new Error(
          `${MAXIMUM_AUTOMATIC_TURN_ADVANCES}회 연속으로 합법 Action이 없어 자동 턴 종료를 중단했습니다.`,
        );
      }
    }
  }

  private enforceHandLimit(playerId: BattlePlayerId): void {
    const chain = createReactionChain();

    while (
      this.state.result.type === 'ONGOING' &&
      this.state.players[playerId].handIds.length > MAXIMUM_HAND_SIZE
    ) {
      const handCardIds = Object.freeze([...this.state.players[playerId].handIds]);
      const selectedIds = this.chooseDiscardCards({
        playerId,
        sourceCardId: null,
        count: 1,
        handCardIds,
        reason: 'HAND_LIMIT',
      });
      const selectedCardId = selectedIds[0];

      if (selectedCardId === undefined) {
        throw new InvalidBattleDecisionError('손패 제한으로 버릴 카드가 선택되지 않았습니다.');
      }

      this.runDiscardStep(
        'rule:hand-limit',
        playerId,
        [selectedCardId],
        cardRef(selectedCardId),
        chain,
      );
    }
  }

  private beginTurn(skipMandatoryDraw: boolean, advance = false): void {
    const chain = createReactionChain();
    const nextPlayerId = advance
      ? otherBattlePlayerId(this.state.activePlayerId)
      : this.state.activePlayerId;

    this.runAtomic('rule:turn:start', chain, () => {
      if (advance) {
        this.state.activePlayerId = nextPlayerId;
        this.state.turnNumber += 1;
      }

      const player = this.state.players[nextPlayerId];
      const readyCardIds: StableId[] = [];

      for (const card of this.state.cards) {
        if (card.ownerId !== nextPlayerId) {
          continue;
        }

        card.hasMovedThisTurn = false;
        card.hasAttackedThisTurn = false;
        card.hasUsedActiveSkillThisTurn = false;
      }

      for (const position of BATTLE_FIELD_POSITIONS) {
        const cardId = player.field[position];

        if (cardId === null) {
          continue;
        }

        const card = this.mutableCard(cardId);

        if (card.isDeploymentPending) {
          card.isDeploymentPending = false;
          readyCardIds.push(cardId);
        }
      }

      const events: BattleEvent[] = [];

      if (readyCardIds.length > 0) {
        events.push(
          Object.freeze({
            type: 'DEPLOYMENT_READY',
            triggerType: null,
            subject: playerRef(nextPlayerId),
            source: playerRef(nextPlayerId),
            playerId: nextPlayerId,
            cardIds: Object.freeze(readyCardIds),
          }),
        );
      }

      events.push(
        Object.freeze({
          type: 'TURN_STARTED',
          triggerType: 'TURN_STARTED',
          subject: playerRef(nextPlayerId),
          source: playerRef(nextPlayerId),
          playerId: nextPlayerId,
        }),
      );
      return events;
    });

    if (!skipMandatoryDraw && this.state.result.type === 'ONGOING') {
      this.runDrawStep(
        'rule:turn:mandatory-draw',
        nextPlayerId,
        1,
        playerRef(nextPlayerId),
        createReactionChain(),
      );
    }
  }

  private removeCardId(cardIds: StableId[], cardId: StableId): void {
    const index = cardIds.indexOf(cardId);

    if (index === -1) {
      throw new Error(`존에서 전투 카드 ID를 찾을 수 없습니다: ${cardId}`);
    }

    cardIds.splice(index, 1);
  }

  private removeCardFromCurrentZone(cardId: StableId): void {
    const location = locateBattleCard(this.state, cardId);
    const player = this.state.players[location.playerId];

    switch (location.zone) {
      case 'DECK':
        this.removeCardId(player.drawPileIds, cardId);
        break;
      case 'HAND':
        this.removeCardId(player.handIds, cardId);
        break;
      case 'FIELD':
        if (location.fieldPosition === null) {
          throw new Error('Field 카드의 위치가 없습니다.');
        }
        player.field[location.fieldPosition] = null;
        break;
      case 'DROP':
        this.removeCardId(player.dropIds, cardId);
        break;
      case 'EXILE':
        this.removeCardId(player.exileIds, cardId);
        break;
    }
  }

  private resetCardOnZoneChange(card: MutableBattleCardState): void {
    card.damage = 0;
    card.statusIds = [];
    card.isDeploymentPending = false;
    card.hasMovedThisTurn = false;
    card.hasAttackedThisTurn = false;
    card.hasUsedActiveSkillThisTurn = false;
    card.statModifiers = createEmptyStatModifiers();
    card.lastDamageSourceCardId = null;
  }

  private moveCardToZone(
    cardId: StableId,
    zone: BattleZone,
    fieldPosition?: BattleFieldPosition,
  ): void {
    const card = this.mutableCard(cardId);
    const player = this.state.players[card.ownerId];
    this.removeCardFromCurrentZone(cardId);
    this.resetCardOnZoneChange(card);

    switch (zone) {
      case 'DECK':
        player.drawPileIds.push(cardId);
        break;
      case 'HAND':
        player.handIds.push(cardId);
        break;
      case 'FIELD':
        if (fieldPosition === undefined) {
          throw new Error('Field로 이동할 때 목적지 위치가 필요합니다.');
        }
        if (player.field[fieldPosition] !== null) {
          throw new Error(`Field 목적지가 비어 있지 않습니다: ${fieldPosition}`);
        }
        player.field[fieldPosition] = cardId;
        card.isDeploymentPending = true;
        break;
      case 'DROP':
        player.dropIds.push(cardId);
        break;
      case 'EXILE':
        player.exileIds.push(cardId);
        break;
    }
  }

  private moveCardWithinField(cardId: StableId, to: BattleFieldPosition): void {
    const location = locateBattleCard(this.state, cardId);

    if (location.zone !== 'FIELD' || location.fieldPosition === null) {
      throw new Error('Field 밖의 카드는 Field 안에서 이동할 수 없습니다.');
    }

    const player = this.state.players[location.playerId];

    if (player.field[to] !== null) {
      throw new Error(`MOVE 목적지가 비어 있지 않습니다: ${to}`);
    }

    player.field[location.fieldPosition] = null;
    player.field[to] = cardId;
  }

  private performStateChecks(chain: ReactionChain): void {
    while (this.state.result.type === 'ONGOING') {
      const exiledCardIds: StableId[] = [];

      for (const playerId of ['PLAYER', 'ENEMY'] as const) {
        const field = this.state.players[playerId].field;

        for (const position of BATTLE_FIELD_POSITIONS) {
          const cardId = field[position];

          if (cardId !== null && this.mutableCard(cardId).statusIds.includes('EXILED')) {
            exiledCardIds.push(cardId);
          }
        }
      }

      if (exiledCardIds.length > 0) {
        const beforeState = this.snapshot();
        const events: BattleEvent[] = [];

        for (const cardId of exiledCardIds) {
          const card = this.mutableCard(cardId);
          const ownerId = card.ownerId;
          this.moveCardToZone(cardId, 'EXILE');
          events.push(
            Object.freeze({
              type: 'EXILE',
              triggerType: null,
              subject: cardRef(cardId),
              source: cardRef(cardId),
              playerId: ownerId,
              cardId,
            }),
          );
        }

        this.recordStep('state:exile', beforeState, events);

        if (this.finishBattleIfNeeded()) {
          return;
        }

        continue;
      }

      const destroyedCards = this.state.cards.flatMap((card) => {
        const location = locateBattleCard(this.state, card.id);

        if (location.zone !== 'FIELD') {
          return [];
        }

        const effectiveHp = getBattleEffectiveStats(this.state, this.cardDefinitions, card.id).hp;

        return card.damage >= effectiveHp
          ? [
              {
                cardId: card.id,
                sourceCardId: card.lastDamageSourceCardId ?? card.id,
              },
            ]
          : [];
      });

      if (destroyedCards.length > 0) {
        const beforeState = this.snapshot();
        const events: BattleEvent[] = [];

        for (const destroyed of destroyedCards) {
          this.moveCardToZone(destroyed.cardId, 'DROP');
          events.push(
            Object.freeze({
              type: 'DESTROY',
              triggerType: 'CARD_DESTROYED',
              subject: cardRef(destroyed.cardId),
              source: cardRef(destroyed.sourceCardId),
              cardId: destroyed.cardId,
            }),
          );
        }

        const frozenEvents = freezeEvents(events);
        this.recordStep('state:destroy', beforeState, frozenEvents);

        if (this.finishBattleIfNeeded()) {
          return;
        }

        this.resolveReactions(frozenEvents, chain);
        continue;
      }

      this.finishBattleIfNeeded();
      return;
    }
  }

  private finishBattleIfNeeded(): boolean {
    if (this.state.result.type !== 'ONGOING') {
      return true;
    }

    const defeated: {
      readonly playerId: BattlePlayerId;
      readonly reason: 'LEADER_DEFEATED' | 'DECK_EXHAUSTED';
    }[] = [];

    for (const playerId of ['PLAYER', 'ENEMY'] as const) {
      const player = this.state.players[playerId];
      const leaderLocation = locateBattleCard(this.state, player.leaderCardId);

      if (leaderLocation.zone !== 'FIELD') {
        defeated.push({ playerId, reason: 'LEADER_DEFEATED' });
      } else if (player.requiredDrawFailed) {
        defeated.push({ playerId, reason: 'DECK_EXHAUSTED' });
      }
    }

    if (defeated.length === 0) {
      return false;
    }

    const beforeState = this.snapshot();
    let result: Exclude<BattleResult, { readonly type: 'ONGOING' }>;

    if (defeated.length > 1) {
      result = {
        type: 'DRAW',
        winnerId: null,
        loserIds: ['PLAYER', 'ENEMY'],
        reason: defeated.some((entry) => entry.reason === 'LEADER_DEFEATED')
          ? 'LEADER_DEFEATED'
          : 'DECK_EXHAUSTED',
      };
    } else {
      const loss = defeated[0];

      if (loss === undefined) {
        throw new Error('패배 플레이어를 찾을 수 없습니다.');
      }

      result = {
        type: 'WIN',
        winnerId: otherBattlePlayerId(loss.playerId),
        loserIds: [loss.playerId],
        reason: loss.reason,
      };
    }

    this.state.result = result;
    this.state.phase = 'ENDED';
    this.recordStep('battle:ended', beforeState, [
      Object.freeze({
        type: 'BATTLE_ENDED',
        triggerType: null,
        subject: result.winnerId === null ? null : playerRef(result.winnerId),
        source: null,
        result,
      }),
    ]);
    return true;
  }

  private eventSubjectMatches(
    sourceCardId: StableId,
    sourceOwnerId: BattlePlayerId,
    subject: ReactiveSkill['trigger']['subject'],
    event: BattleEvent,
  ): boolean {
    if (event.subject === null) {
      return false;
    }

    const resolvedSubject = subject ?? 'SELF';

    if (resolvedSubject === 'ANY') {
      return true;
    }

    if (resolvedSubject === 'SELF') {
      return event.subject.type === 'CARD' && event.subject.cardId === sourceCardId;
    }

    const subjectOwnerId =
      event.subject.type === 'PLAYER'
        ? event.subject.playerId
        : this.mutableCard(event.subject.cardId).ownerId;

    return resolvedSubject === 'OWNER'
      ? subjectOwnerId === sourceOwnerId
      : subjectOwnerId !== sourceOwnerId;
  }

  private collectReactiveInvocations(
    events: readonly BattleEvent[],
    chain: ReactionChain,
  ): readonly QueuedReactiveInvocation[] {
    const invocations: QueuedReactiveInvocation[] = [];

    for (const card of this.state.cards) {
      const definition = getCardDefinition(this.cardDefinitions, card.cardDefinitionId);
      const skill = definition.reactiveSkill;

      if (skill === undefined) {
        continue;
      }

      const skillInstanceId = `${card.id}:${skill.id}`;

      if (chain.firedSkillInstanceIds.has(skillInstanceId)) {
        continue;
      }

      const matchingEvents = events.filter(
        (event) =>
          event.triggerType === skill.trigger.type &&
          this.eventSubjectMatches(card.id, card.ownerId, skill.trigger.subject, event),
      );

      if (matchingEvents.length === 0) {
        continue;
      }

      const location = locateBattleCard(this.state, card.id);
      const isDestroyedSelfException =
        location.zone === 'DROP' &&
        skill.trigger.type === 'CARD_DESTROYED' &&
        (skill.trigger.subject ?? 'SELF') === 'SELF' &&
        matchingEvents.some(
          (event) => event.subject?.type === 'CARD' && event.subject.cardId === card.id,
        );

      if (location.zone !== 'FIELD' && !isDestroyedSelfException) {
        continue;
      }

      const triggerEvents =
        skill.trigger.type === 'CARD_DESTROYED' || skill.trigger.type === 'CARD_DISCARDED'
          ? events.filter((event) => event.triggerType === skill.trigger.type)
          : matchingEvents;
      chain.firedSkillInstanceIds.add(skillInstanceId);
      invocations.push({
        sourceCardId: card.id,
        sourceOwnerId: card.ownerId,
        skill,
        actionTarget: null,
        triggerEvents: Object.freeze(triggerEvents),
      });
    }

    return Object.freeze(invocations);
  }

  private orderReactiveInvocations(
    playerId: BattlePlayerId,
    invocations: readonly QueuedReactiveInvocation[],
  ): readonly QueuedReactiveInvocation[] {
    if (invocations.length < 2) {
      return invocations;
    }

    const choices = Object.freeze(
      invocations.map((invocation) =>
        Object.freeze({
          sourceCardId: invocation.sourceCardId,
          skillId: invocation.skill.id,
        }),
      ),
    );
    const selectedOrder = this.decisions.orderReactiveSkills({
      playerId,
      choices,
    });
    const expectedKeys = new Set(
      choices.map((choice) => `${choice.sourceCardId}:${choice.skillId}`),
    );
    const selectedKeys = selectedOrder.map((choice) => `${choice.sourceCardId}:${choice.skillId}`);

    if (
      selectedKeys.length !== expectedKeys.size ||
      new Set(selectedKeys).size !== selectedKeys.length ||
      selectedKeys.some((key) => !expectedKeys.has(key))
    ) {
      throw new InvalidBattleDecisionError(
        `${playerId} Reactive Skill 순서는 모든 후보를 정확히 한 번 포함해야 합니다.`,
      );
    }

    const invocationByKey = new Map(
      invocations.map((invocation) => [
        `${invocation.sourceCardId}:${invocation.skill.id}`,
        invocation,
      ]),
    );

    return Object.freeze(
      selectedKeys.map((key) => {
        const invocation = invocationByKey.get(key);

        if (invocation === undefined) {
          throw new InvalidBattleDecisionError(`Reactive Skill 후보를 찾을 수 없습니다: ${key}`);
        }

        return invocation;
      }),
    );
  }

  private resolveReactions(events: readonly BattleEvent[], chain: ReactionChain): void {
    const invocations = this.collectReactiveInvocations(events, chain);

    if (invocations.length === 0) {
      return;
    }

    const turnPlayerId = this.state.activePlayerId;
    const opponentId = otherBattlePlayerId(turnPlayerId);
    const turnPlayerInvocations = this.orderReactiveInvocations(
      turnPlayerId,
      invocations.filter((invocation) => invocation.sourceOwnerId === turnPlayerId),
    );
    const opponentInvocations = this.orderReactiveInvocations(
      opponentId,
      invocations.filter((invocation) => invocation.sourceOwnerId === opponentId),
    );
    const stack = [...turnPlayerInvocations, ...opponentInvocations];

    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (this.state.result.type !== 'ONGOING') {
        return;
      }

      const invocation = stack[index];

      if (invocation === undefined) {
        throw new Error('Reactive Skill 대기열 항목을 찾을 수 없습니다.');
      }

      this.resolveSkill(invocation, chain);
    }
  }

  private resolveSkill(invocation: SkillInvocation, chain: ReactionChain): void {
    for (const [index, effect] of invocation.skill.effects.entries()) {
      if (this.state.result.type !== 'ONGOING') {
        return;
      }

      const effectId = `skill:${invocation.sourceCardId}:${invocation.skill.id}:effect:${index}`;
      this.resolveEffect(effectId, effect, invocation, chain);
    }
  }

  private resolveEffectTarget(
    target: EffectTarget,
    invocation: SkillInvocation,
  ): BattleEntityRef | null {
    switch (target) {
      case 'SELF':
        return cardRef(invocation.sourceCardId);
      case 'OWNER':
        return playerRef(invocation.sourceOwnerId);
      case 'OPPONENT':
        return playerRef(otherBattlePlayerId(invocation.sourceOwnerId));
      case 'ACTION_TARGET':
        return invocation.actionTarget;
      case 'TRIGGER_SOURCE':
        return uniqueEntity(invocation.triggerEvents.map((event) => event.source));
      case 'TRIGGER_SUBJECT':
        return uniqueEntity(invocation.triggerEvents.map((event) => event.subject));
    }
  }

  private failEffect(
    effectId: StableId,
    effect: Effect,
    invocation: SkillInvocation,
    chain: ReactionChain,
    reason: string,
    target: BattleEntityRef | null = null,
  ): void {
    this.runAtomic(effectId, chain, () => [
      Object.freeze({
        type: 'EFFECT_FAILED',
        triggerType: null,
        subject: target,
        source: cardRef(invocation.sourceCardId),
        effect,
        reason,
      }),
    ]);
  }

  private resolveEffect(
    effectId: StableId,
    effect: Effect,
    invocation: SkillInvocation,
    chain: ReactionChain,
  ): void {
    const target = this.resolveEffectTarget(effect.target, invocation);

    if (target === null) {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        `${effect.target}가 단일 합법 대상을 식별하지 못했습니다.`,
      );
      return;
    }

    switch (effect.type) {
      case 'DAMAGE':
        this.resolveDamageEffect(effectId, effect, invocation, target, chain);
        break;
      case 'HEAL':
        this.resolveHealEffect(effectId, effect, invocation, target, chain);
        break;
      case 'DRAW':
        this.resolveDrawEffect(effectId, effect, invocation, target, chain);
        break;
      case 'MOVE':
        this.resolveMoveEffect(effectId, effect, invocation, target, chain);
        break;
      case 'PLACE':
        this.resolvePlaceEffect(effectId, effect, invocation, target, chain);
        break;
      case 'DESTROY':
        this.resolveDestroyEffect(effectId, effect, invocation, target, chain);
        break;
      case 'DISCARD':
        this.resolveDiscardEffect(effectId, effect, invocation, target, chain);
        break;
      case 'MODIFY_STAT':
        this.resolveModifyStatEffect(effectId, effect, invocation, target, chain);
        break;
      case 'ADD_STATUS':
        this.resolveAddStatusEffect(effectId, effect, invocation, target, chain);
        break;
      case 'REMOVE_STATUS':
        this.resolveRemoveStatusEffect(effectId, effect, invocation, target, chain);
        break;
    }
  }

  private normalizeFieldCardTarget(target: BattleEntityRef): StableId | null {
    const cardId =
      target.type === 'PLAYER' ? this.state.players[target.playerId].leaderCardId : target.cardId;
    const location = locateBattleCard(this.state, cardId);
    return location.zone === 'FIELD' ? cardId : null;
  }

  private resolveDamageEffect(
    effectId: StableId,
    effect: Extract<Effect, { readonly type: 'DAMAGE' }>,
    invocation: SkillInvocation,
    target: BattleEntityRef,
    chain: ReactionChain,
  ): void {
    if (effect.amount < 0) {
      this.failEffect(effectId, effect, invocation, chain, 'DAMAGE amount는 음수일 수 없습니다.');
      return;
    }

    const targetCardId = this.normalizeFieldCardTarget(target);

    if (targetCardId === null) {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'DAMAGE 대상은 Field 카드 또는 리더가 있는 플레이어여야 합니다.',
        target,
      );
      return;
    }

    this.runAtomic(effectId, chain, () => {
      if (effect.amount === 0) {
        return Object.freeze([]);
      }

      const card = this.mutableCard(targetCardId);
      card.damage += effect.amount;
      card.lastDamageSourceCardId = invocation.sourceCardId;
      return [
        Object.freeze({
          type: 'DAMAGE',
          triggerType: 'DAMAGE_RECEIVED',
          subject: cardRef(targetCardId),
          source: cardRef(invocation.sourceCardId),
          targetCardId,
          amount: effect.amount,
        }),
      ];
    });
  }

  private resolveHealEffect(
    effectId: StableId,
    effect: Extract<Effect, { readonly type: 'HEAL' }>,
    invocation: SkillInvocation,
    target: BattleEntityRef,
    chain: ReactionChain,
  ): void {
    if (effect.amount < 0) {
      this.failEffect(effectId, effect, invocation, chain, 'HEAL amount는 음수일 수 없습니다.');
      return;
    }

    const targetCardId = this.normalizeFieldCardTarget(target);

    if (targetCardId === null) {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'HEAL 대상은 Field 카드 또는 리더가 있는 플레이어여야 합니다.',
        target,
      );
      return;
    }

    this.runAtomic(effectId, chain, () => {
      const card = this.mutableCard(targetCardId);
      const healedAmount = Math.min(effect.amount, card.damage);

      if (healedAmount === 0) {
        return Object.freeze([]);
      }

      card.damage -= healedAmount;
      return [
        Object.freeze({
          type: 'HEAL',
          triggerType: null,
          subject: cardRef(targetCardId),
          source: cardRef(invocation.sourceCardId),
          targetCardId,
          amount: healedAmount,
        }),
      ];
    });
  }

  private resolveDrawEffect(
    effectId: StableId,
    effect: Extract<Effect, { readonly type: 'DRAW' }>,
    invocation: SkillInvocation,
    target: BattleEntityRef,
    chain: ReactionChain,
  ): void {
    if (effect.count < 0) {
      this.failEffect(effectId, effect, invocation, chain, 'DRAW count는 음수일 수 없습니다.');
      return;
    }

    if (target.type !== 'PLAYER') {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'DRAW 대상은 플레이어여야 합니다.',
        target,
      );
      return;
    }

    this.runDrawStep(
      effectId,
      target.playerId,
      effect.count,
      cardRef(invocation.sourceCardId),
      chain,
    );
  }

  private chooseEffectField(decision: EffectFieldDecision): BattleFieldPosition {
    const selected = this.decisions.chooseEffectField(decision);

    if (!decision.legalPositions.includes(selected)) {
      throw new InvalidBattleDecisionError(
        `${decision.effectType} Effect의 합법 Field를 선택해야 합니다: ${selected}`,
      );
    }

    return selected;
  }

  private resolveMoveEffect(
    effectId: StableId,
    effect: Extract<Effect, { readonly type: 'MOVE' }>,
    invocation: SkillInvocation,
    target: BattleEntityRef,
    chain: ReactionChain,
  ): void {
    if (target.type !== 'CARD') {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'MOVE 대상은 Field 카드여야 합니다.',
        target,
      );
      return;
    }

    const location = locateBattleCard(this.state, target.cardId);

    if (location.zone !== 'FIELD' || location.fieldPosition === null) {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'MOVE 대상이 더는 Field에 없습니다.',
        target,
      );
      return;
    }

    const ownerField = this.state.players[location.playerId].field;
    const legalPositions = Object.freeze(
      getAdjacentBattleFields(location.fieldPosition).filter(
        (position) => ownerField[position] === null,
      ),
    );

    if (legalPositions.length === 0) {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'MOVE Effect의 인접한 빈 Field가 없습니다.',
        target,
      );
      return;
    }

    const from = location.fieldPosition;
    const to = this.chooseEffectField({
      playerId: invocation.sourceOwnerId,
      effectType: 'MOVE',
      sourceCardId: invocation.sourceCardId,
      targetCardId: target.cardId,
      legalPositions,
    });
    this.runAtomic(effectId, chain, () => {
      this.moveCardWithinField(target.cardId, to);
      return [
        Object.freeze({
          type: 'MOVE',
          triggerType: 'CARD_MOVED',
          subject: cardRef(target.cardId),
          source: cardRef(invocation.sourceCardId),
          playerId: location.playerId,
          cardId: target.cardId,
          from,
          to,
        }),
      ];
    });
  }

  private resolvePlaceEffect(
    effectId: StableId,
    effect: Extract<Effect, { readonly type: 'PLACE' }>,
    invocation: SkillInvocation,
    target: BattleEntityRef,
    chain: ReactionChain,
  ): void {
    if (target.type !== 'CARD') {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'PLACE 대상은 Drop의 특정 유닛이어야 합니다.',
        target,
      );
      return;
    }

    const targetCard = this.mutableCard(target.cardId);
    const targetDefinition = getCardDefinition(this.cardDefinitions, targetCard.cardDefinitionId);
    const location = locateBattleCard(this.state, target.cardId);

    if (location.zone !== 'DROP' || targetDefinition.type !== 'UNIT') {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'PLACE 대상은 Drop에 있는 유닛이어야 합니다.',
        target,
      );
      return;
    }

    const cost = getBattleEffectiveStats(this.state, this.cardDefinitions, target.cardId).cost;
    const legalPositions = Object.freeze(
      BATTLE_FIELD_POSITIONS.filter(
        (position) =>
          this.state.players[location.playerId].field[position] === null &&
          getFieldDominance(this.state, this.cardDefinitions, location.playerId, position) >= cost,
      ),
    );

    if (legalPositions.length === 0) {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'PLACE Effect의 지배력 조건을 만족하는 빈 Field가 없습니다.',
        target,
      );
      return;
    }

    const to = this.chooseEffectField({
      playerId: invocation.sourceOwnerId,
      effectType: 'PLACE',
      sourceCardId: invocation.sourceCardId,
      targetCardId: target.cardId,
      legalPositions,
    });
    this.runAtomic(effectId, chain, () => {
      this.moveCardToZone(target.cardId, 'FIELD', to);
      return [
        Object.freeze({
          type: 'PLACE',
          triggerType: 'CARD_PLACED',
          subject: cardRef(target.cardId),
          source: cardRef(target.cardId),
          playerId: location.playerId,
          cardId: target.cardId,
          to,
        }),
      ];
    });
  }

  private resolveDestroyEffect(
    effectId: StableId,
    effect: Extract<Effect, { readonly type: 'DESTROY' }>,
    invocation: SkillInvocation,
    target: BattleEntityRef,
    chain: ReactionChain,
  ): void {
    if (target.type !== 'CARD' || locateBattleCard(this.state, target.cardId).zone !== 'FIELD') {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'DESTROY 대상은 Field 카드여야 합니다.',
        target,
      );
      return;
    }

    this.runAtomic(effectId, chain, () => {
      this.moveCardToZone(target.cardId, 'DROP');
      return [
        Object.freeze({
          type: 'DESTROY',
          triggerType: 'CARD_DESTROYED',
          subject: cardRef(target.cardId),
          source: cardRef(invocation.sourceCardId),
          cardId: target.cardId,
        }),
      ];
    });
  }

  private chooseDiscardCards(decision: DiscardDecision): readonly StableId[] {
    const selectedIds = this.decisions.chooseDiscardCards(decision);

    if (
      selectedIds.length !== decision.count ||
      new Set(selectedIds).size !== selectedIds.length ||
      selectedIds.some((cardId) => !decision.handCardIds.includes(cardId))
    ) {
      throw new InvalidBattleDecisionError(
        `${decision.playerId}는 Hand에서 정확히 ${decision.count}장을 선택해야 합니다.`,
      );
    }

    return Object.freeze([...selectedIds]);
  }

  private resolveDiscardEffect(
    effectId: StableId,
    effect: Extract<Effect, { readonly type: 'DISCARD' }>,
    invocation: SkillInvocation,
    target: BattleEntityRef,
    chain: ReactionChain,
  ): void {
    if (effect.count < 0) {
      this.failEffect(effectId, effect, invocation, chain, 'DISCARD count는 음수일 수 없습니다.');
      return;
    }

    if (target.type !== 'PLAYER') {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'DISCARD 대상은 플레이어여야 합니다.',
        target,
      );
      return;
    }

    const handCardIds = Object.freeze([...this.state.players[target.playerId].handIds]);
    const count = Math.min(effect.count, handCardIds.length);
    const selectedIds = this.chooseDiscardCards({
      playerId: target.playerId,
      sourceCardId: invocation.sourceCardId,
      count,
      handCardIds,
      reason: 'EFFECT',
    });
    this.runDiscardStep(
      effectId,
      target.playerId,
      selectedIds,
      cardRef(invocation.sourceCardId),
      chain,
    );
  }

  private resolveModifyStatEffect(
    effectId: StableId,
    effect: Extract<Effect, { readonly type: 'MODIFY_STAT' }>,
    invocation: SkillInvocation,
    target: BattleEntityRef,
    chain: ReactionChain,
  ): void {
    if (target.type !== 'CARD') {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'MODIFY_STAT 대상은 특정 카드여야 합니다.',
        target,
      );
      return;
    }

    if (locateBattleCard(this.state, target.cardId).zone === 'EXILE') {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'Exile 카드는 수치가 바뀌지 않습니다.',
        target,
      );
      return;
    }

    this.runAtomic(effectId, chain, () => {
      const card = this.mutableCard(target.cardId);
      card.statModifiers[effect.stat] += effect.amount;
      return [
        Object.freeze({
          type: 'STAT_MODIFIED',
          triggerType: null,
          subject: cardRef(target.cardId),
          source: cardRef(invocation.sourceCardId),
          targetCardId: target.cardId,
          stat: effect.stat,
          amount: effect.amount,
        }),
      ];
    });
  }

  private resolveAddStatusEffect(
    effectId: StableId,
    effect: Extract<Effect, { readonly type: 'ADD_STATUS' }>,
    invocation: SkillInvocation,
    target: BattleEntityRef,
    chain: ReactionChain,
  ): void {
    if (
      invocation.skill.type !== 'ACTIVE' ||
      effect.statusId !== 'EXILED' ||
      target.type !== 'CARD' ||
      locateBattleCard(this.state, target.cardId).zone !== 'FIELD'
    ) {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'ADD_STATUS는 Active Skill이 Field 카드에 EXILED를 추가할 때만 합법입니다.',
        target,
      );
      return;
    }

    const card = this.mutableCard(target.cardId);

    if (card.statusIds.includes('EXILED')) {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'EXILED 상태는 중첩되지 않습니다.',
        target,
      );
      return;
    }

    this.runAtomic(effectId, chain, () => {
      card.statusIds.push('EXILED');
      return [
        Object.freeze({
          type: 'STATUS_ADDED',
          triggerType: 'STATUS_ADDED',
          subject: cardRef(target.cardId),
          source: cardRef(invocation.sourceCardId),
          targetCardId: target.cardId,
          statusId: 'EXILED',
        }),
      ];
    });
  }

  private resolveRemoveStatusEffect(
    effectId: StableId,
    effect: Extract<Effect, { readonly type: 'REMOVE_STATUS' }>,
    invocation: SkillInvocation,
    target: BattleEntityRef,
    chain: ReactionChain,
  ): void {
    if (
      effect.statusId !== 'EXILED' ||
      target.type !== 'CARD' ||
      locateBattleCard(this.state, target.cardId).zone !== 'FIELD'
    ) {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        'REMOVE_STATUS 대상은 해당 상태를 가진 Field 카드여야 합니다.',
        target,
      );
      return;
    }

    const card = this.mutableCard(target.cardId);
    const statusIndex = card.statusIds.indexOf('EXILED');

    if (statusIndex === -1) {
      this.failEffect(
        effectId,
        effect,
        invocation,
        chain,
        '대상 카드에 제거할 상태가 없습니다.',
        target,
      );
      return;
    }

    this.runAtomic(effectId, chain, () => {
      card.statusIds.splice(statusIndex, 1);
      return [
        Object.freeze({
          type: 'STATUS_REMOVED',
          triggerType: 'STATUS_REMOVED',
          subject: cardRef(target.cardId),
          source: cardRef(invocation.sourceCardId),
          targetCardId: target.cardId,
          statusId: 'EXILED',
        }),
      ];
    });
  }
}

export function resolveBattleAction(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
  action: BattleAction,
  decisions: BattleDecisionProvider = DETERMINISTIC_BATTLE_DECISIONS,
): ActionResolution {
  return new BattleResolver(state, cardDefinitions, decisions).resolve(action);
}

function assertRestorableBattleState(
  state: BattleState,
  cardDefinitions: readonly CardDefinition[],
): void {
  assertSeed(state.seed);
  assertUniqueDefinitionIds(cardDefinitions);

  if (
    state.schemaVersion !== 2 ||
    !Number.isInteger(state.turnNumber) ||
    state.turnNumber < 1 ||
    !Number.isInteger(state.actionCount) ||
    state.actionCount < 0 ||
    (state.firstPlayerId !== 'PLAYER' && state.firstPlayerId !== 'ENEMY') ||
    (state.activePlayerId !== 'PLAYER' && state.activePlayerId !== 'ENEMY')
  ) {
    throw new InvalidBattleSetupError('BattleState 상위 상태 값이 유효하지 않습니다.');
  }

  const cardIds = new Set<StableId>();
  const cardById = new Map<StableId, (typeof state.cards)[number]>();

  for (const card of state.cards) {
    if (cardIds.has(card.id)) {
      throw new InvalidBattleSetupError(`BattleState 카드 ID가 중복되었습니다: ${card.id}`);
    }

    cardIds.add(card.id);
    cardById.set(card.id, card);
    getCardDefinition(cardDefinitions, card.cardDefinitionId);

    if (
      !Number.isInteger(card.damage) ||
      card.damage < 0 ||
      !Number.isInteger(card.statModifiers.ATTACK) ||
      !Number.isInteger(card.statModifiers.HEALTH) ||
      !Number.isInteger(card.statModifiers.COST) ||
      !Number.isInteger(card.statModifiers.DOMINANCE) ||
      typeof card.hasMovedThisTurn !== 'boolean' ||
      typeof card.hasAttackedThisTurn !== 'boolean' ||
      typeof card.hasUsedActiveSkillThisTurn !== 'boolean' ||
      new Set(card.statusIds).size !== card.statusIds.length ||
      card.statusIds.some((statusId) => statusId !== 'EXILED')
    ) {
      throw new InvalidBattleSetupError(
        `BattleState 카드 전투 수치가 유효하지 않습니다: ${card.id}`,
      );
    }
  }

  if (cardIds.size !== CORE_DECK_RULES.totalCards * 2) {
    throw new InvalidBattleSetupError(
      `BattleState에는 양쪽 ${CORE_DECK_RULES.totalCards}장씩 필요합니다.`,
    );
  }

  const referenceCounts = new Map<StableId, number>();
  const claimZoneReference = (cardId: StableId, playerId: BattlePlayerId): void => {
    const card = cardById.get(cardId);

    if (card === undefined) {
      throw new InvalidBattleSetupError(`BattleState 존이 알 수 없는 카드를 참조합니다: ${cardId}`);
    }

    if (card.ownerId !== playerId) {
      throw new InvalidBattleSetupError(
        `BattleState 카드 소유자와 존 소유자가 다릅니다: ${cardId}`,
      );
    }

    referenceCounts.set(cardId, (referenceCounts.get(cardId) ?? 0) + 1);
  };

  for (const playerId of ['PLAYER', 'ENEMY'] as const) {
    const player = state.players[playerId];

    if (player.id !== playerId || !cardIds.has(player.leaderCardId)) {
      throw new InvalidBattleSetupError(
        `${playerId} BattleState 플레이어 계약이 유효하지 않습니다.`,
      );
    }

    if (
      state.cards.filter((card) => card.ownerId === playerId).length !== CORE_DECK_RULES.totalCards
    ) {
      throw new InvalidBattleSetupError(
        `${playerId} BattleState에는 전투 카드 ${CORE_DECK_RULES.totalCards}장이 필요합니다.`,
      );
    }

    const leader = cardById.get(player.leaderCardId);

    if (
      leader === undefined ||
      getCardDefinition(cardDefinitions, leader.cardDefinitionId).type !== 'LEADER'
    ) {
      throw new InvalidBattleSetupError(`${playerId} BattleState 리더 계약이 유효하지 않습니다.`);
    }

    for (const cardId of [
      ...player.drawPileIds,
      ...player.handIds,
      ...player.dropIds,
      ...player.exileIds,
    ]) {
      claimZoneReference(cardId, playerId);
    }

    for (const position of BATTLE_FIELD_POSITIONS) {
      const cardId = player.field[position];

      if (cardId !== null) {
        claimZoneReference(cardId, playerId);
      }
    }
  }

  for (const cardId of cardIds) {
    if (referenceCounts.get(cardId) !== 1) {
      throw new InvalidBattleSetupError(
        `BattleState 카드는 정확히 한 존에 있어야 합니다: ${cardId}`,
      );
    }
  }

  if (
    (state.phase === 'ACTION' && state.result.type !== 'ONGOING') ||
    (state.phase === 'ENDED' && state.result.type === 'ONGOING')
  ) {
    throw new InvalidBattleSetupError('BattleState phase와 result가 일치하지 않습니다.');
  }

  if (
    (state.result.type === 'ONGOING' &&
      (state.result.winnerId !== null ||
        state.result.loserIds.length !== 0 ||
        state.result.reason !== null)) ||
    (state.result.type === 'WIN' &&
      (state.result.loserIds.length !== 1 || state.result.loserIds[0] === state.result.winnerId)) ||
    (state.result.type === 'DRAW' &&
      (!state.result.loserIds.includes('PLAYER') || !state.result.loserIds.includes('ENEMY')))
  ) {
    throw new InvalidBattleSetupError('BattleState 승패 결과가 유효하지 않습니다.');
  }
}

export class BattleSession {
  private state: BattleState;
  private readonly cardDefinitions: readonly CardDefinition[];

  private constructor(state: BattleState, cardDefinitions: readonly CardDefinition[]) {
    this.state = state;
    this.cardDefinitions = Object.freeze([...cardDefinitions]);
  }

  static create(setup: BattleSetup): BattleSession {
    return new BattleSession(createBattleState(setup), setup.cardDefinitions);
  }

  static fromState(state: BattleState, cardDefinitions: readonly CardDefinition[]): BattleSession {
    assertRestorableBattleState(state, cardDefinitions);
    return new BattleSession(freezeBattleState(cloneBattleState(state)), cardDefinitions);
  }

  getState(): BattleState {
    return this.state;
  }

  getLegalActions(): readonly BattleAction[] {
    return getLegalBattleActions(this.state, this.cardDefinitions);
  }

  simulateAction(
    action: BattleAction,
    decisions: BattleDecisionProvider = DETERMINISTIC_BATTLE_DECISIONS,
  ): ActionResolution {
    return resolveBattleAction(this.state, this.cardDefinitions, action, decisions);
  }

  resolveAction(
    action: BattleAction,
    decisions: BattleDecisionProvider = DETERMINISTIC_BATTLE_DECISIONS,
  ): ActionResolution {
    const resolution = this.simulateAction(action, decisions);
    this.state = resolution.finalState;
    return resolution;
  }
}
