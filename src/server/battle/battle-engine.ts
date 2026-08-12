import {
  hasAnyTrait as hasAnyCardTrait,
  hasTrait as hasCardTrait,
} from '../../game/cards/trait-catalog';
import type { AbilityCategory, CardAbility } from '../../game/save/card-catalog';
import {
  ACTIVE_SKILL_DEFINITIONS,
  AFTER_ATTACK_BUFF_ABILITY_IDS,
  AFTER_ATTACK_SELF_HEAL_VALUES,
  AFTER_ATTACK_SELF_HP_BONUS_VALUES,
  ATTACK_DAMAGE_BONUS_ABILITY_HANDLERS,
  BACK_PASSIVE_ABILITY_HANDLERS,
  BLOCK_ABILITY_IDS,
  DAMAGE_REDUCTION_ABILITY_HANDLERS,
  FRONT_PASSIVE_ABILITY_HANDLERS,
  GLOBAL_PASSIVE_ABILITY_HANDLERS,
  MOVE_ATTACK_BONUS_ABILITY_IDS,
  MOVE_NEXT_ATTACK_BONUS_VALUES,
  MOVE_NEXT_ATTACK_FRONT_ROW_ONLY_ABILITY_IDS,
  RETREAT_ADJACENT_ALLY_HEAL_VALUES,
  RETREAT_ALL_ENEMY_DAMAGE_VALUES,
  SUMMON_ATTACK_BONUS_ABILITY_IDS,
  SUMMON_OPPOSING_ENEMY_DAMAGE_VALUES,
  SUMMON_OPPOSING_ENEMY_ATTACK_PENALTY_ABILITY_IDS,
  type ActiveSkillDefinition,
  type BattleRuntimeEffectStat,
} from './ability-handlers';
import type {
  ActiveSkillBattleAction,
  AttackBattleAction,
  BattleAutomatedTurnResult,
  BattleAutomatedTurnStep,
  BattleAutomationAction,
  BattleAvailableActions,
  BattleAbilityEffectExpiration,
  BattleBlockDecision,
  BattleCardRuntimeState,
  BattlefieldZone,
  BattleParticipantRuntimeState,
  BattleRuntimeState,
  BattleSide,
  BattleSlotId,
  BattleTurnEndReason,
  BattleTurnEvent,
  BlockBattleAction,
  MoveBattleAction,
  PlaceBattleAction,
} from '../../game/battle/types';

export const MAX_AUTOMATED_ACTIONS_PER_TURN = 20 as const;

const BATTLEFIELD_ZONES: readonly BattlefieldZone[] = ['FR', 'FC', 'FL', 'BR', 'BC', 'BL'];
const SLOT_COORDINATES: Record<BattlefieldZone, { x: number; y: number }> = {
  FR: { x: 0, y: 0 },
  FC: { x: 1, y: 0 },
  FL: { x: 2, y: 0 },
  BR: { x: 0, y: 1 },
  BC: { x: 1, y: 1 },
  BL: { x: 2, y: 1 },
};

type RunAutomatedTurnUntilBlockDecisionOptions = {
  interruptForBlockSide?: BattleSide;
  initialActionCount?: number;
};

/**
 * 지정한 전장 슬롯을 점유한 카드를 반환한다.
 * 전장 슬롯이 비어 있거나 전투에서 이탈한 카드만 남아 있으면 `null`을 반환한다.
 */
export function findBattlefieldCardAtSlot(
  runtime: BattleRuntimeState,
  slotId: BattleSlotId,
): BattleCardRuntimeState | null {
  return (
    runtime.battlefield.find(
      (card) => card.zone === 'BATTLEFIELD' && card.battlefieldSlot === slotId,
    ) ?? null
  );
}

/**
 * 카드가 현재 전위 슬롯에 있는지 판정한다.
 * 전장에 없는 카드는 위치 지속 능력의 대상이 아니므로 항상 false를 반환한다.
 */
export function isFrontRowCard(card: BattleCardRuntimeState): boolean {
  if (card.zone !== 'BATTLEFIELD' || !card.battlefieldSlot) {
    return false;
  }

  return !isBackRowZone(parseBattleSlotId(card.battlefieldSlot).zone);
}

/**
 * 카드가 현재 후위 슬롯에 있는지 판정한다.
 * 전장에 없는 카드는 위치 지속 능력의 대상이 아니므로 항상 false를 반환한다.
 */
export function isBackRowCard(card: BattleCardRuntimeState): boolean {
  if (card.zone !== 'BATTLEFIELD' || !card.battlefieldSlot) {
    return false;
  }

  return isBackRowZone(parseBattleSlotId(card.battlefieldSlot).zone);
}

/**
 * 현재 전투 상태와 적용 중인 능력을 반영한 공격력을 계산한다.
 * 공격 선언 중에만 적용되는 조건부 보정은 공격 해결 시 별도로 더한다.
 */
export function getEffectiveAttack(
  runtime: BattleRuntimeState,
  card: BattleCardRuntimeState,
): number {
  return (
    readCardNumber(card.card.instance.attack, 0) +
    getRuntimeEffectBonus(card, 'attack') +
    getPassiveStatBonus(runtime, card, 'attack')
  );
}

/**
 * 현재 전투 상태와 적용 중인 능력을 반영한 HP를 계산한다.
 * 실제 피해는 현재 HP에 기록하고, 생존 판정은 이 값을 기준으로 수행한다.
 */
export function getEffectiveHp(runtime: BattleRuntimeState, card: BattleCardRuntimeState): number {
  return (
    readCardNumber(card.card.instance.hp, 0) +
    getRuntimeEffectBonus(card, 'hp') +
    getPassiveStatBonus(runtime, card, 'hp')
  );
}

/**
 * 현재 전투 상태와 적용 중인 능력을 반영한 지배력을 계산한다.
 * 배치 가능 판정은 이 값을 사용해 지속 보정 확장에 대비한다.
 */
export function getEffectiveDominance(
  runtime: BattleRuntimeState,
  card: BattleCardRuntimeState,
): number {
  return (
    readCardNumber(card.card.instance.dominance, 0) +
    getRuntimeEffectBonus(card, 'dominance') +
    getPassiveStatBonus(runtime, card, 'dominance')
  );
}

/**
 * 빈 전장 슬롯에 인접한 같은 진영 카드의 지배력 합계를 계산한다.
 * 이미 점유된 슬롯은 배치 대상이 아니므로 항상 0으로 취급한다.
 */
export function calculateSlotDominance(runtime: BattleRuntimeState, slotId: BattleSlotId): number {
  if (findBattlefieldCardAtSlot(runtime, slotId)) {
    return 0;
  }

  const { side, zone } = parseBattleSlotId(slotId);
  return getAdjacentSlotIds(side, zone).reduce((total, adjacentSlotId) => {
    const card = findBattlefieldCardAtSlot(runtime, adjacentSlotId);
    if (!card || card.side !== side) {
      return total;
    }

    return total + getEffectiveDominance(runtime, card);
  }, 0);
}

/**
 * 현재 전투 상태에서 지정 진영이 수행할 수 있는 손패 배치 후보를 계산한다.
 * 후보는 손패 카드 비용이 대상 빈 슬롯의 지배력 이하일 때만 생성된다.
 */
export function listPlaceActions(
  runtime: BattleRuntimeState,
  side: BattleSide = runtime.currentSide,
): PlaceBattleAction[] {
  if (runtime.phase !== 'MAIN' || side !== runtime.currentSide) {
    return [];
  }

  const participant = getParticipant(runtime, side);
  const actions: PlaceBattleAction[] = [];
  for (const card of participant.hand) {
    if (card.handIndex === null) {
      continue;
    }

    const cost = readCardNumber(card.card.instance.cost, 0);
    for (const toSlotId of getSideSlotIds(side)) {
      const dominance = calculateSlotDominance(runtime, toSlotId);
      if (dominance >= cost && !findBattlefieldCardAtSlot(runtime, toSlotId)) {
        actions.push({
          type: 'PLACE',
          cardInstanceId: card.card.instance.instanceId,
          fromHandIndex: card.handIndex,
          toSlotId,
          dominance,
          cost,
        });
      }
    }
  }

  return actions;
}

/**
 * 현재 전투 상태에서 지정 진영의 전장 카드가 이동할 수 있는 후보를 계산한다.
 * 이동은 공격 단계에 들어가기 전, 카드별 턴당 1회만 허용한다.
 */
export function listMoveActions(
  runtime: BattleRuntimeState,
  side: BattleSide = runtime.currentSide,
): MoveBattleAction[] {
  if (runtime.phase !== 'MAIN' || side !== runtime.currentSide) {
    return [];
  }

  const actions: MoveBattleAction[] = [];
  for (const card of listBattlefieldCards(runtime, side)) {
    if (card.battlefieldSlot === null || card.hasMovedThisTurn || card.hasAttackedThisTurn) {
      continue;
    }

    const { zone } = parseBattleSlotId(card.battlefieldSlot);
    const emptyAdjacentSlots = getAdjacentSlotIds(side, zone).filter(
      (slotId) => !findBattlefieldCardAtSlot(runtime, slotId),
    );
    for (const toSlotId of emptyAdjacentSlots) {
      actions.push({
        type: 'MOVE',
        cardInstanceId: card.card.instance.instanceId,
        fromSlotId: card.battlefieldSlot,
        toSlotId,
      });
    }
  }

  return actions;
}

/**
 * 현재 전투 상태에서 지정 진영의 공격 후보를 계산한다.
 * 공격 대상은 이번 이슈 범위에서 모든 적 전장 카드와 적 리더로 단순화한다.
 */
export function listAttackActions(
  runtime: BattleRuntimeState,
  side: BattleSide = runtime.currentSide,
): AttackBattleAction[] {
  if (runtime.phase === 'GAME_OVER' || side !== runtime.currentSide) {
    return [];
  }

  const targets = listBattlefieldCards(runtime, getOpposingSide(side));
  const actions: AttackBattleAction[] = [];
  for (const attacker of listBattlefieldCards(runtime, side)) {
    if (
      attacker.battlefieldSlot === null ||
      isBattlefieldEntryTurn(runtime, attacker) ||
      attacker.hasAttackedThisTurn ||
      getEffectiveAttack(runtime, attacker) <= 0
    ) {
      continue;
    }

    for (const target of targets) {
      if (target.battlefieldSlot === null || getEffectiveHp(runtime, target) <= 0) {
        continue;
      }
      if (!canBasicAttack(runtime, attacker, target)) {
        continue;
      }

      actions.push({
        type: 'ATTACK',
        attackerInstanceId: attacker.card.instance.instanceId,
        targetInstanceId: target.card.instance.instanceId,
        fromSlotId: attacker.battlefieldSlot,
        toSlotId: target.battlefieldSlot,
        attack: calculateAttackDamage(runtime, attacker, target),
      });
    }
  }

  return actions;
}

/**
 * 공격 액션을 기준으로 `guardian_block`을 선언할 수 있는 방어 후보를 계산한다.
 * 리더 직접 공격과 비합법 공격은 후보를 만들지 않아 호출자가 공격 규칙을 중복 구현하지 않게 한다.
 */
export function listBlockActions(
  runtime: BattleRuntimeState,
  attackAction: AttackBattleAction,
): BlockBattleAction[] {
  if (!isLegalAttackAction(runtime, attackAction)) {
    return [];
  }

  const target = findBattlefieldCardByInstanceId(runtime, attackAction.targetInstanceId);
  if (
    !target ||
    target.battlefieldSlot === null ||
    isLeaderCard(runtime, target) ||
    getEffectiveHp(runtime, target) <= 0
  ) {
    return [];
  }

  const { zone } = parseBattleSlotId(target.battlefieldSlot);
  return getAdjacentSlotIds(target.side, zone).flatMap((slotId): BlockBattleAction[] => {
    const blocker = findBattlefieldCardAtSlot(runtime, slotId);
    if (
      !blocker ||
      blocker === target ||
      blocker.side !== target.side ||
      blocker.battlefieldSlot === null ||
      getEffectiveHp(runtime, blocker) <= 0 ||
      !listCardAbilities(blocker, 'GLOBAL').some((ability) => BLOCK_ABILITY_IDS.has(ability.id))
    ) {
      return [];
    }

    return [
      {
        type: 'BLOCK',
        attackAction,
        blockerInstanceId: blocker.card.instance.instanceId,
        blockerSlotId: blocker.battlefieldSlot,
      },
    ];
  });
}

/**
 * 메인 단계에서 현재 카드 데이터 기준으로 가능한 활성 스킬 후보를 반환한다.
 * 능력별 대상 규칙은 엔진에서 해석하고, Scene은 반환된 대상 슬롯만 표시한다.
 */
export function listActiveSkillActions(
  runtime: BattleRuntimeState,
  side: BattleSide = runtime.currentSide,
): ActiveSkillBattleAction[] {
  if (runtime.phase !== 'MAIN' || side !== runtime.currentSide) {
    return [];
  }

  const actions: ActiveSkillBattleAction[] = [];
  for (const card of listBattlefieldCards(runtime, side)) {
    if (isBattlefieldEntryTurn(runtime, card) || card.hasUsedActiveSkillThisTurn) {
      continue;
    }

    for (const ability of listCardAbilities(card, 'ACTION')) {
      const definition = ACTIVE_SKILL_DEFINITIONS[ability.id];
      if (!definition) {
        continue;
      }

      for (const target of listActiveSkillTargets(runtime, card, definition.targetSide)) {
        if (!target.battlefieldSlot) {
          continue;
        }

        actions.push({
          type: 'ACTIVE_SKILL',
          cardInstanceId: card.card.instance.instanceId,
          skillId: ability.id,
          targetInstanceId: target.card.instance.instanceId,
          targetSlotId: target.battlefieldSlot,
          effect: definition.effect,
          value: definition.value,
        });
      }
    }
  }

  return actions;
}

/**
 * Place, Move, Active Skill, Attack 후보를 한 번에 계산한다.
 * Scene은 이 결과만 사용해 입력 가능 상태와 하이라이트를 구성한다.
 */
export function listAvailableActions(
  runtime: BattleRuntimeState,
  side: BattleSide = runtime.currentSide,
): BattleAvailableActions {
  return {
    placeActions: listPlaceActions(runtime, side),
    moveActions: listMoveActions(runtime, side),
    activeSkillActions: listActiveSkillActions(runtime, side),
    attackActions: listAttackActions(runtime, side),
  };
}

/**
 * 합법 배치 액션을 전투 런타임에 적용한다.
 * 손패 배열에서 카드를 제거하고 전장 슬롯에 배치한 뒤 남은 손패 index를 재정렬한다.
 */
export function applyPlaceAction(runtime: BattleRuntimeState, action: PlaceBattleAction): void {
  assertLegalPlaceAction(runtime, action);

  const participant = getParticipant(runtime, runtime.currentSide);
  const cardIndex = participant.hand.findIndex(
    (card) =>
      card.card.instance.instanceId === action.cardInstanceId &&
      card.handIndex === action.fromHandIndex,
  );
  const card = participant.hand[cardIndex];
  if (!card) {
    throw new Error(`Unknown hand card instanceId: ${action.cardInstanceId}`);
  }

  participant.hand.splice(cardIndex, 1);
  card.zone = 'BATTLEFIELD';
  card.battlefieldSlot = action.toSlotId;
  card.enteredBattlefieldTurnNumber = runtime.turnNumber;
  card.handIndex = null;
  card.deckIndex = null;
  runtime.battlefield.push(card);
  reindexHand(participant);
  resolveSummonAbilities(runtime, card);
}

/**
 * 합법 이동 액션을 전투 런타임에 적용한다.
 * 이동한 카드는 같은 턴에 다시 이동할 수 없도록 행동 플래그를 갱신한다.
 */
export function applyMoveAction(runtime: BattleRuntimeState, action: MoveBattleAction): void {
  assertLegalMoveAction(runtime, action);

  const card = findBattlefieldCardByInstanceId(runtime, action.cardInstanceId);
  if (!card) {
    throw new Error(`Unknown battlefield card instanceId: ${action.cardInstanceId}`);
  }

  card.battlefieldSlot = action.toSlotId;
  card.hasMovedThisTurn = true;
  resolveMoveAbilities(runtime, card);
}

/**
 * 합법 공격 액션을 전투 런타임에 적용한다.
 * 피해 결과에 따라 일반 카드는 DROP으로 보내고, 리더가 쓰러지면 전투 결과를 기록한다.
 */
export function applyAttackAction(runtime: BattleRuntimeState, action: AttackBattleAction): void {
  assertLegalAttackAction(runtime, action);

  const attacker = findBattlefieldCardByInstanceId(runtime, action.attackerInstanceId);
  const target = findBattlefieldCardByInstanceId(runtime, action.targetInstanceId);
  if (!attacker || !target) {
    throw new Error('Attack action references an unknown card');
  }

  resolveAttackDamage(runtime, action, target);
}

/**
 * 합법 Block 액션을 전투 런타임에 적용한다.
 * 공격 피해량은 원래 공격 대상 기준으로 계산하고, 실제 피해 적용 대상만 blocker로 바꾼다.
 */
export function applyBlockAction(runtime: BattleRuntimeState, action: BlockBattleAction): void {
  assertLegalBlockAction(runtime, action);

  const blocker = findBattlefieldCardByInstanceId(runtime, action.blockerInstanceId);
  if (!blocker) {
    throw new Error('Block action references an unknown blocker');
  }

  resolveAttackDamage(runtime, action.attackAction, blocker);
}

/**
 * 합법 활성 스킬 액션을 전투 런타임에 적용한다.
 * 대상 선택과 효과 종류는 `listActiveSkillActions()`가 생성한 action을 기준으로 검증한다.
 */
export function applyActiveSkillAction(
  runtime: BattleRuntimeState,
  action: ActiveSkillBattleAction,
): void {
  assertLegalActiveSkillAction(runtime, action);

  const source = findBattlefieldCardByInstanceId(runtime, action.cardInstanceId);
  const target = findBattlefieldCardByInstanceId(runtime, action.targetInstanceId);
  if (!source || !target) {
    throw new Error('Active skill action references an unknown card');
  }

  source.hasUsedActiveSkillThisTurn = true;
  if (action.effect === 'HEAL') {
    applyHealingToBattlefieldCard(target, action.value);
    return;
  }

  if (action.effect === 'DAMAGE') {
    applyDamageToBattlefieldCard(runtime, source.side, target, action.value);
    return;
  }

  const ability = requireCardAbility(source, action.skillId);
  addAbilityEffect(runtime, target, source, ability, {
    stat: 'attack',
    value: action.value,
    expiresAt: 'BATTLEFIELD_LEAVE',
  });
}

/**
 * 현재 진영의 턴 시작 처리를 적용한다.
 * 행동 플래그를 초기화하고 덱 맨 위 카드를 1장 손패로 옮기며, 덱이 비어 있으면 상태만 이벤트로 돌려준다.
 */
export function applyTurnStart(runtime: BattleRuntimeState): BattleTurnEvent {
  const participant = getParticipant(runtime, runtime.currentSide);
  expireAbilityEffectsAtTurnStart(runtime, runtime.currentSide);
  resetTurnFlagsForSide(runtime, runtime.currentSide);

  const drawnCard = participant.deck.shift() ?? null;
  if (drawnCard) {
    drawnCard.zone = 'HAND';
    drawnCard.battlefieldSlot = null;
    drawnCard.enteredBattlefieldTurnNumber = null;
    drawnCard.handIndex = participant.hand.length;
    drawnCard.deckIndex = null;
    participant.hand.push(drawnCard);
    reindexDeck(participant);
  }

  return {
    type: 'TURN_START',
    side: runtime.currentSide,
    drewCardInstanceId: drawnCard?.card.instance.instanceId ?? null,
    deckRemaining: participant.deck.length,
  };
}

/**
 * 현재 턴을 종료하고 다음 진영의 MAIN 단계로 넘긴다.
 * 적 턴에서 플레이어 턴으로 돌아올 때만 라운드 번호를 증가시키고, 새 진영의 턴 시작 처리를 즉시 적용한다.
 */
export function applyTurnEnd(
  runtime: BattleRuntimeState,
  reason: BattleTurnEndReason = 'MANUAL',
): BattleTurnEvent[] {
  if (runtime.phase === 'GAME_OVER') {
    return [];
  }

  const endedSide = runtime.currentSide;
  const nextSide = getOpposingSide(runtime.currentSide);
  expireAbilityEffectsAtTurnEnd(runtime, endedSide);
  if (runtime.currentSide === 'enemy' && nextSide === 'player') {
    runtime.turnNumber += 1;
  }

  runtime.currentSide = nextSide;
  runtime.phase = 'MAIN';
  return [
    {
      type: 'TURN_END',
      side: endedSide,
      nextSide,
      reason,
    },
    applyTurnStart(runtime),
  ];
}

/**
 * 가능한 Place, Move, Active Skill, Attack이 모두 없으면 자동으로 턴을 한 번 종료한다.
 * 연속 자동 진행은 호출자가 적 턴 정책에 맞춰 별도로 제어한다.
 */
export function applyAutoTurnEndIfStalled(
  runtime: BattleRuntimeState,
  events?: BattleTurnEvent[],
): boolean {
  if (runtime.phase === 'GAME_OVER') {
    return false;
  }

  const actions = listAvailableActions(runtime, runtime.currentSide);
  if (
    actions.placeActions.length > 0 ||
    actions.moveActions.length > 0 ||
    actions.activeSkillActions.length > 0 ||
    actions.attackActions.length > 0
  ) {
    return false;
  }

  const turnEvents = applyTurnEnd(runtime, 'STALLED');
  events?.push(...turnEvents);
  return true;
}

/**
 * 현재 상태에서 자동 조작이 선택할 다음 행동을 계산한다.
 * 지배력 합계를 높이는 행동을 우선하고, 더 높일 수 없으면 가능한 배치를 고코스트 순서로 반복한 뒤 공격한다.
 */
export function chooseAutomatedBattleAction(
  runtime: BattleRuntimeState,
  side: BattleSide,
): BattleAutomationAction | null {
  if (runtime.phase === 'GAME_OVER' || runtime.currentSide !== side) {
    return null;
  }

  const dominanceAction = chooseDominanceIncreasingAction(runtime, side);
  if (dominanceAction) {
    return dominanceAction;
  }

  const placeAction = chooseLegalPlaceAction(runtime, side);
  if (placeAction) {
    return placeAction;
  }

  return chooseAttackAction(runtime, side);
}

/**
 * 지정 진영의 자동 턴을 실행한다.
 * 선택과 적용은 기존 도메인 액션 함수를 통해 수행하며, 행동 제한으로 무한 루프를 방지한다.
 */
export function runAutomatedTurn(runtime: BattleRuntimeState, side: BattleSide): BattleTurnEvent[] {
  return runAutomatedTurnUntilBlockDecision(runtime, side).events;
}

/**
 * 지정 진영의 자동 턴을 실행하되, 방어 측 Block 선택이 필요한 공격 앞에서 멈출 수 있다.
 * 중단된 공격은 아직 적용하지 않으며, 호출자는 선택 결과 적용 후 `initialActionCount`를 이어서 넘긴다.
 */
export function runAutomatedTurnUntilBlockDecision(
  runtime: BattleRuntimeState,
  side: BattleSide,
  options: RunAutomatedTurnUntilBlockDecisionOptions = {},
): BattleAutomatedTurnResult {
  const events: BattleTurnEvent[] = [];
  let actionCount = Math.max(0, options.initialActionCount ?? 0);

  for (;;) {
    const step = stepAutomatedTurn(runtime, side, { ...options, initialActionCount: actionCount });
    events.push(...step.events);
    actionCount = step.actionCount;

    if (step.blockDecision || step.finished) {
      return {
        events,
        blockDecision: step.blockDecision,
        actionCount,
      };
    }
  }
}

/**
 * 자동 턴을 한 행동만 진행한다.
 * 연출이 한 수씩 보여줄 수 있도록 진행을 쪼갠 것이며, 판정은 전부 기존 액션 함수가 그대로 수행한다.
 * `finished`가 true이면 이 진영의 턴은 더 진행할 것이 없다.
 */
export function stepAutomatedTurn(
  runtime: BattleRuntimeState,
  side: BattleSide,
  options: RunAutomatedTurnUntilBlockDecisionOptions = {},
): BattleAutomatedTurnStep {
  const events: BattleTurnEvent[] = [];
  const actionCount = Math.max(0, options.initialActionCount ?? 0);
  const stop = (finished: boolean): BattleAutomatedTurnStep => ({
    events,
    blockDecision: null,
    actionCount,
    finished,
  });

  if (runtime.currentSide !== side || runtime.phase === 'GAME_OVER') {
    return stop(true);
  }

  if (actionCount >= MAX_AUTOMATED_ACTIONS_PER_TURN) {
    events.push({ type: 'ACTION_LIMIT', side, actionCount });
    events.push(...applyTurnEnd(runtime, 'ACTION_LIMIT'));
    return stop(true);
  }

  const action = chooseAutomatedBattleAction(runtime, side);
  if (!action) {
    events.push(...applyTurnEnd(runtime, 'NO_ACTION'));
    return stop(true);
  }

  const blockDecision = createBlockDecisionForAutomatedAction(runtime, action, options);
  if (blockDecision) {
    // 멈춘 공격은 아직 적용하지 않았다. 호출자가 방어 선택을 받아 직접 적용하고 이어서 부른다.
    return { events, blockDecision, actionCount, finished: false };
  }

  applyAutomationAction(runtime, action);
  events.push({ type: 'ACTION', side, action });

  return {
    events,
    blockDecision: null,
    actionCount: actionCount + 1,
    finished: applyAutoTurnEndIfStalled(runtime, events) || runtime.currentSide !== side,
  };
}

type DominanceAutomationCandidate = {
  action: PlaceBattleAction | MoveBattleAction;
  score: number;
  order: number;
};

function chooseDominanceIncreasingAction(
  runtime: BattleRuntimeState,
  side: BattleSide,
): PlaceBattleAction | MoveBattleAction | null {
  const baseScore = calculateSideDominanceScore(runtime, side);
  const candidates: DominanceAutomationCandidate[] = [
    ...listPlaceActions(runtime, side).map((action, order) => ({
      action,
      score: calculateActionDominanceScore(runtime, side, action),
      order,
    })),
    ...listMoveActions(runtime, side).map((action, order) => ({
      action,
      score: calculateActionDominanceScore(runtime, side, action),
      order,
    })),
  ].filter((candidate) => candidate.score > baseScore);

  candidates.sort(compareDominanceAutomationCandidates);
  return candidates[0]?.action ?? null;
}

function compareDominanceAutomationCandidates(
  left: DominanceAutomationCandidate,
  right: DominanceAutomationCandidate,
): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (left.action.type !== right.action.type) {
    return left.action.type === 'PLACE' ? -1 : 1;
  }

  if (left.action.type === 'PLACE' && right.action.type === 'PLACE') {
    const costDifference = right.action.cost - left.action.cost;
    if (costDifference !== 0) {
      return costDifference;
    }
  }

  return left.order - right.order;
}

function chooseLegalPlaceAction(
  runtime: BattleRuntimeState,
  side: BattleSide,
): PlaceBattleAction | null {
  return (
    listPlaceActions(runtime, side)
      .map((action, order) => ({ action, order }))
      .sort((left, right) => {
        const costDifference = right.action.cost - left.action.cost;
        if (costDifference !== 0) {
          return costDifference;
        }

        const dominanceDifference = right.action.dominance - left.action.dominance;
        if (dominanceDifference !== 0) {
          return dominanceDifference;
        }

        return left.order - right.order;
      })[0]?.action ?? null
  );
}

function calculateActionDominanceScore(
  runtime: BattleRuntimeState,
  side: BattleSide,
  action: PlaceBattleAction | MoveBattleAction,
): number {
  const nextRuntime = structuredClone(runtime);
  if (action.type === 'PLACE') {
    applyPlaceAction(nextRuntime, action);
  } else {
    applyMoveAction(nextRuntime, action);
  }

  return calculateSideDominanceScore(nextRuntime, side);
}

function calculateSideDominanceScore(runtime: BattleRuntimeState, side: BattleSide): number {
  return getSideSlotIds(side).reduce(
    (total, slotId) => total + calculateSlotDominance(runtime, slotId),
    0,
  );
}

function chooseAttackAction(
  runtime: BattleRuntimeState,
  side: BattleSide,
): AttackBattleAction | null {
  return (
    listAttackActions(runtime, side)
      .map((action, order) => ({
        action,
        order,
        target: findBattlefieldCardByInstanceId(runtime, action.targetInstanceId),
      }))
      .sort((left, right) => {
        const leftLeaderPriority = left.target && isLeaderCard(runtime, left.target) ? 0 : 1;
        const rightLeaderPriority = right.target && isLeaderCard(runtime, right.target) ? 0 : 1;
        if (leftLeaderPriority !== rightLeaderPriority) {
          return leftLeaderPriority - rightLeaderPriority;
        }

        const leftHp = left.target
          ? getEffectiveHp(runtime, left.target)
          : Number.POSITIVE_INFINITY;
        const rightHp = right.target
          ? getEffectiveHp(runtime, right.target)
          : Number.POSITIVE_INFINITY;
        if (leftHp !== rightHp) {
          return leftHp - rightHp;
        }

        return left.order - right.order;
      })[0]?.action ?? null
  );
}

function applyAutomationAction(runtime: BattleRuntimeState, action: BattleAutomationAction): void {
  if (action.type === 'PLACE') {
    applyPlaceAction(runtime, action);
    return;
  }

  if (action.type === 'MOVE') {
    applyMoveAction(runtime, action);
    return;
  }

  applyAttackAction(runtime, action);
}

function createBlockDecisionForAutomatedAction(
  runtime: BattleRuntimeState,
  action: BattleAutomationAction,
  options: RunAutomatedTurnUntilBlockDecisionOptions,
): BattleBlockDecision | null {
  if (action.type !== 'ATTACK' || !options.interruptForBlockSide) {
    return null;
  }

  const target = findBattlefieldCardByInstanceId(runtime, action.targetInstanceId);
  if (!target || target.side !== options.interruptForBlockSide) {
    return null;
  }

  const blockActions = listBlockActions(runtime, action);
  if (blockActions.length === 0) {
    return null;
  }

  return {
    attackAction: action,
    blockActions,
  };
}

function assertLegalPlaceAction(runtime: BattleRuntimeState, action: PlaceBattleAction): void {
  const isLegal = listPlaceActions(runtime).some(
    (candidate) =>
      candidate.cardInstanceId === action.cardInstanceId &&
      candidate.fromHandIndex === action.fromHandIndex &&
      candidate.toSlotId === action.toSlotId,
  );
  if (!isLegal) {
    throw new Error('Illegal place action');
  }
}

function assertLegalMoveAction(runtime: BattleRuntimeState, action: MoveBattleAction): void {
  const isLegal = listMoveActions(runtime).some(
    (candidate) =>
      candidate.cardInstanceId === action.cardInstanceId &&
      candidate.fromSlotId === action.fromSlotId &&
      candidate.toSlotId === action.toSlotId,
  );
  if (!isLegal) {
    throw new Error('Illegal move action');
  }
}

function assertLegalAttackAction(runtime: BattleRuntimeState, action: AttackBattleAction): void {
  if (!isLegalAttackAction(runtime, action)) {
    throw new Error('Illegal attack action');
  }
}

function isLegalAttackAction(runtime: BattleRuntimeState, action: AttackBattleAction): boolean {
  return listAttackActions(runtime).some(
    (candidate) =>
      candidate.attackerInstanceId === action.attackerInstanceId &&
      candidate.targetInstanceId === action.targetInstanceId,
  );
}

function assertLegalBlockAction(runtime: BattleRuntimeState, action: BlockBattleAction): void {
  const isLegal = listBlockActions(runtime, action.attackAction).some(
    (candidate) =>
      candidate.blockerInstanceId === action.blockerInstanceId &&
      candidate.blockerSlotId === action.blockerSlotId,
  );
  if (!isLegal) {
    throw new Error('Illegal block action');
  }
}

function assertLegalActiveSkillAction(
  runtime: BattleRuntimeState,
  action: ActiveSkillBattleAction,
): void {
  const isLegal = listActiveSkillActions(runtime).some(
    (candidate) =>
      candidate.cardInstanceId === action.cardInstanceId &&
      candidate.skillId === action.skillId &&
      candidate.targetInstanceId === action.targetInstanceId &&
      candidate.targetSlotId === action.targetSlotId &&
      candidate.effect === action.effect &&
      candidate.value === action.value,
  );
  if (!isLegal) {
    throw new Error('Illegal active skill action');
  }
}

function getParticipant(
  runtime: BattleRuntimeState,
  side: BattleSide,
): BattleParticipantRuntimeState {
  return side === 'player' ? runtime.player : runtime.enemy;
}

function listBattlefieldCards(
  runtime: BattleRuntimeState,
  side: BattleSide,
): BattleCardRuntimeState[] {
  return runtime.battlefield.filter(
    (card) => card.side === side && card.zone === 'BATTLEFIELD' && card.battlefieldSlot !== null,
  );
}

function findBattlefieldCardByInstanceId(
  runtime: BattleRuntimeState,
  instanceId: string,
): BattleCardRuntimeState | null {
  return (
    runtime.battlefield.find(
      (card) => card.zone === 'BATTLEFIELD' && card.card.instance.instanceId === instanceId,
    ) ?? null
  );
}

function getOpposingSide(side: BattleSide): BattleSide {
  return side === 'player' ? 'enemy' : 'player';
}

function getSideSlotIds(side: BattleSide): BattleSlotId[] {
  return BATTLEFIELD_ZONES.map((zone) => formatBattleSlotId(side, zone));
}

function getAdjacentSlotIds(side: BattleSide, zone: BattlefieldZone): BattleSlotId[] {
  const origin = SLOT_COORDINATES[zone];
  return BATTLEFIELD_ZONES.filter((candidate) => {
    const position = SLOT_COORDINATES[candidate];
    return Math.abs(position.x - origin.x) + Math.abs(position.y - origin.y) === 1;
  }).map((candidate) => formatBattleSlotId(side, candidate));
}

function parseBattleSlotId(slotId: BattleSlotId): {
  side: BattleSide;
  zone: BattlefieldZone;
} {
  const [side, zone] = slotId.split(':') as [BattleSide, BattlefieldZone];
  return { side, zone };
}

function formatBattleSlotId(side: BattleSide, zone: BattlefieldZone): BattleSlotId {
  return `${side}:${zone}`;
}

/**
 * 능력 예외를 제외한 기본 공격 가능 여부를 판정한다.
 * 後衛迎撃, 遠距離攻撃, 후위 전용 공격, 직접 피해 능력은 이후 능력 시스템에서 별도로 우회 처리한다.
 */
function canBasicAttack(
  runtime: BattleRuntimeState,
  attacker: BattleCardRuntimeState,
  target: BattleCardRuntimeState,
): boolean {
  if (!attacker.battlefieldSlot || !target.battlefieldSlot) {
    return false;
  }

  const attackerZone = parseBattleSlotId(attacker.battlefieldSlot).zone;
  if (isBackRowZone(attackerZone)) {
    return false;
  }

  const targetZone = parseBattleSlotId(target.battlefieldSlot).zone;
  if (!isBackRowZone(targetZone)) {
    return true;
  }

  const blocker = findBattlefieldCardAtSlot(runtime, getFrontSlotId(target.side, targetZone));
  return !blocker || getEffectiveHp(runtime, blocker) <= 0;
}

function isBackRowZone(zone: BattlefieldZone): boolean {
  return zone.startsWith('B');
}

function getFrontSlotId(side: BattleSide, backZone: BattlefieldZone): BattleSlotId {
  if (backZone === 'BR') {
    return formatBattleSlotId(side, 'FR');
  }
  if (backZone === 'BC') {
    return formatBattleSlotId(side, 'FC');
  }

  return formatBattleSlotId(side, 'FL');
}

function listCardAbilities(card: BattleCardRuntimeState, category: AbilityCategory): CardAbility[] {
  return card.card.definition.abilities.filter((ability) => ability.category === category);
}

function requireCardAbility(card: BattleCardRuntimeState, abilityId: string): CardAbility {
  const ability = card.card.definition.abilities.find((candidate) => candidate.id === abilityId);
  if (!ability) {
    throw new Error(`Unknown card abilityId: ${abilityId}`);
  }

  return ability;
}

function getRuntimeEffectBonus(
  card: BattleCardRuntimeState,
  stat: BattleRuntimeEffectStat,
): number {
  return card.abilityEffects.reduce((total, effect) => {
    if (effect.stat !== stat) {
      return total;
    }

    return total + readCardNumber(effect.value, 0);
  }, 0);
}

function getPassiveStatBonus(
  runtime: BattleRuntimeState,
  card: BattleCardRuntimeState,
  stat: BattleRuntimeEffectStat,
): number {
  let total = 0;
  for (const ability of listCardAbilities(card, 'FRONT')) {
    const modifier = FRONT_PASSIVE_ABILITY_HANDLERS[ability.id]?.({
      runtime,
      source: card,
      target: card,
      ability,
      isFrontRowCard,
      isBackRowCard,
      hasTrait,
      hasAnyTrait,
    });
    if (modifier?.stat === stat) {
      total += modifier.value;
    }
  }

  for (const source of runtime.battlefield) {
    if (source.zone !== 'BATTLEFIELD' || source.battlefieldSlot === null) {
      continue;
    }

    for (const ability of listCardAbilities(source, 'BACK')) {
      const modifier = BACK_PASSIVE_ABILITY_HANDLERS[ability.id]?.({
        runtime,
        source,
        target: card,
        ability,
        isFrontRowCard,
        isBackRowCard,
        hasTrait,
        hasAnyTrait,
      });
      if (modifier?.stat === stat) {
        total += modifier.value;
      }
    }

    for (const ability of listCardAbilities(source, 'GLOBAL')) {
      const modifier = GLOBAL_PASSIVE_ABILITY_HANDLERS[ability.id]?.({
        runtime,
        source,
        target: card,
        ability,
        isFrontRowCard,
        isBackRowCard,
        hasTrait,
        hasAnyTrait,
      });
      if (modifier?.stat === stat) {
        total += modifier.value;
      }
    }
  }

  return total;
}

function resolveSummonAbilities(runtime: BattleRuntimeState, card: BattleCardRuntimeState): void {
  for (const ability of listCardAbilities(card, 'SUMMON')) {
    if (SUMMON_ATTACK_BONUS_ABILITY_IDS.has(ability.id)) {
      addAbilityEffect(runtime, card, card, ability, {
        stat: 'attack',
        value: 1,
        expiresAt: 'TURN_END',
      });
    }

    if (SUMMON_OPPOSING_ENEMY_ATTACK_PENALTY_ABILITY_IDS.has(ability.id)) {
      const target = findOpposingFrontCard(runtime, card);
      if (target) {
        addAbilityEffect(runtime, target, card, ability, {
          stat: 'attack',
          value: -1,
          expiresAt: 'TURN_END',
        });
      }
    }

    const damageValue = SUMMON_OPPOSING_ENEMY_DAMAGE_VALUES[ability.id];
    if (damageValue !== undefined) {
      const target = findOpposingFrontCard(runtime, card);
      if (target) {
        applyDamageToBattlefieldCard(runtime, card.side, target, damageValue);
      }
    }
  }
}

function resolveMoveAbilities(runtime: BattleRuntimeState, card: BattleCardRuntimeState): void {
  for (const ability of listCardAbilities(card, 'MOVE')) {
    if (MOVE_ATTACK_BONUS_ABILITY_IDS.has(ability.id)) {
      addAbilityEffect(runtime, card, card, ability, {
        stat: 'attack',
        value: 1,
        expiresAt: 'TURN_END',
      });
    }

    const nextAttackBonus = MOVE_NEXT_ATTACK_BONUS_VALUES[ability.id];
    const requiresFrontRow = MOVE_NEXT_ATTACK_FRONT_ROW_ONLY_ABILITY_IDS.has(ability.id);
    if (nextAttackBonus !== undefined && (!requiresFrontRow || isFrontRowCard(card))) {
      card.abilityEffects = card.abilityEffects.filter(
        (effect) => effect.expiresAt !== 'NEXT_ATTACK' || effect.abilityId !== ability.id,
      );
      addAbilityEffect(runtime, card, card, ability, {
        stat: 'attack',
        value: nextAttackBonus,
        expiresAt: 'NEXT_ATTACK',
      });
    }
  }
}

function resolveAfterAttackAbilities(
  runtime: BattleRuntimeState,
  attacker: BattleCardRuntimeState,
): void {
  if (runtime.phase === 'GAME_OVER' || attacker.zone !== 'BATTLEFIELD') {
    return;
  }

  for (const ability of listCardAbilities(attacker, 'ATTACK')) {
    if (AFTER_ATTACK_BUFF_ABILITY_IDS.has(ability.id) && getEffectiveHp(runtime, attacker) >= 3) {
      addAbilityEffect(runtime, attacker, attacker, ability, {
        stat: 'attack',
        value: 1,
        expiresAt: 'NEXT_OWN_TURN_END',
      });
    }

    const healValue = AFTER_ATTACK_SELF_HEAL_VALUES[ability.id];
    if (healValue !== undefined) {
      applyHealingToBattlefieldCard(attacker, healValue);
    }

    const hpBonus = AFTER_ATTACK_SELF_HP_BONUS_VALUES[ability.id];
    if (hpBonus !== undefined) {
      addAbilityEffect(runtime, attacker, attacker, ability, {
        stat: 'hp',
        value: hpBonus,
        expiresAt: 'NEXT_OWN_TURN_END',
      });
    }
  }
}

function calculateAttackDamage(
  runtime: BattleRuntimeState,
  attacker: BattleCardRuntimeState,
  target: BattleCardRuntimeState,
): number {
  const bonus = listCardAbilities(attacker, 'ATTACK').reduce((total, ability) => {
    const handler = ATTACK_DAMAGE_BONUS_ABILITY_HANDLERS[ability.id];
    if (!handler) {
      return total;
    }

    return total + handler({ runtime, attacker, target, ability, isBackRowCard, getEffectiveHp });
  }, 0);

  return Math.max(0, getEffectiveAttack(runtime, attacker) + bonus);
}

function resolveAttackDamage(
  runtime: BattleRuntimeState,
  action: AttackBattleAction,
  damageTarget: BattleCardRuntimeState,
): void {
  const attacker = findBattlefieldCardByInstanceId(runtime, action.attackerInstanceId);
  const originalTarget = findBattlefieldCardByInstanceId(runtime, action.targetInstanceId);
  if (!attacker || !originalTarget) {
    throw new Error('Attack action references an unknown card');
  }

  runtime.phase = 'ATTACK';
  attacker.hasAttackedThisTurn = true;
  action.attack = calculateAttackDamage(runtime, attacker, originalTarget);
  applyDamageToBattlefieldCard(runtime, attacker.side, damageTarget, action.attack);
  consumeNextAttackAbilityEffects(attacker);
  resolveAfterAttackAbilities(runtime, attacker);
}

function findOpposingFrontCard(
  runtime: BattleRuntimeState,
  source: BattleCardRuntimeState,
): BattleCardRuntimeState | null {
  if (!source.battlefieldSlot) {
    return null;
  }

  const { zone } = parseBattleSlotId(source.battlefieldSlot);
  if (isBackRowZone(zone)) {
    return null;
  }

  return findBattlefieldCardAtSlot(runtime, formatBattleSlotId(getOpposingSide(source.side), zone));
}

function resolveRetreatAbilities(runtime: BattleRuntimeState, card: BattleCardRuntimeState): void {
  if (!card.battlefieldSlot) {
    return;
  }

  const { zone } = parseBattleSlotId(card.battlefieldSlot);
  const adjacentAllies = getAdjacentSlotIds(card.side, zone)
    .map((slotId) => findBattlefieldCardAtSlot(runtime, slotId))
    .filter(
      (candidate): candidate is BattleCardRuntimeState =>
        candidate !== null &&
        candidate.side === card.side &&
        getEffectiveHp(runtime, candidate) > 0,
    )
    .sort((left, right) => getEffectiveHp(runtime, left) - getEffectiveHp(runtime, right));
  const target = adjacentAllies[0];

  for (const ability of listCardAbilities(card, 'RETREAT')) {
    const healValue = RETREAT_ADJACENT_ALLY_HEAL_VALUES[ability.id];
    if (healValue !== undefined && target) {
      applyHealingToBattlefieldCard(target, healValue);
    }

    const damageValue = RETREAT_ALL_ENEMY_DAMAGE_VALUES[ability.id];
    if (damageValue === undefined) {
      continue;
    }

    const enemyUnits = listBattlefieldCards(runtime, getOpposingSide(card.side)).filter(
      (enemy) => !isLeaderCard(runtime, enemy) && getEffectiveHp(runtime, enemy) > 0,
    );
    for (const enemy of enemyUnits) {
      applyDamageToBattlefieldCard(runtime, card.side, enemy, damageValue);
    }
  }
}

function listActiveSkillTargets(
  runtime: BattleRuntimeState,
  source: BattleCardRuntimeState,
  targetSide: ActiveSkillDefinition['targetSide'],
): BattleCardRuntimeState[] {
  const side = targetSide === 'ally' ? source.side : getOpposingSide(source.side);
  return listBattlefieldCards(runtime, side).filter((card) => getEffectiveHp(runtime, card) > 0);
}

function addAbilityEffect(
  runtime: BattleRuntimeState,
  target: BattleCardRuntimeState,
  source: BattleCardRuntimeState,
  ability: CardAbility,
  effect: {
    stat: BattleRuntimeEffectStat;
    value: number;
    expiresAt: BattleAbilityEffectExpiration;
  },
): void {
  target.abilityEffects.push({
    id: `${ability.id}:${source.card.instance.instanceId}:${target.card.instance.instanceId}:${runtime.turnNumber}:${target.abilityEffects.length}`,
    abilityId: ability.id,
    sourceInstanceId: source.card.instance.instanceId,
    category: ability.category,
    stat: effect.stat,
    value: effect.value,
    expiresAt: effect.expiresAt,
    createdTurnNumber: runtime.turnNumber,
  });
}

function expireAbilityEffectsAtTurnStart(runtime: BattleRuntimeState, side: BattleSide): void {
  for (const card of listAllRuntimeCards(runtime)) {
    if (card.side !== side) {
      continue;
    }

    card.abilityEffects = card.abilityEffects.filter(
      (effect) =>
        effect.expiresAt !== 'NEXT_OWN_TURN_START' ||
        effect.createdTurnNumber >= runtime.turnNumber,
    );
  }
}

function expireAbilityEffectsAtTurnEnd(runtime: BattleRuntimeState, side: BattleSide): void {
  for (const card of listAllRuntimeCards(runtime)) {
    if (card.side !== side) {
      continue;
    }

    card.abilityEffects = card.abilityEffects.filter((effect) => {
      if (effect.expiresAt === 'TURN_END') {
        return false;
      }
      if (
        effect.expiresAt === 'NEXT_OWN_TURN_END' &&
        effect.createdTurnNumber < runtime.turnNumber
      ) {
        return false;
      }

      return true;
    });
  }
}

function applyDamageToBattlefieldCard(
  runtime: BattleRuntimeState,
  sourceSide: BattleSide,
  target: BattleCardRuntimeState,
  damage: number,
): void {
  const damageReduction = listCardAbilities(target, 'SPECIAL').reduce((total, ability) => {
    const handler = DAMAGE_REDUCTION_ABILITY_HANDLERS[ability.id];
    return total + (handler?.({ runtime, target, ability, damage }) ?? 0);
  }, 0);
  const resolvedDamage = Math.max(0, damage - damageReduction);
  target.card.instance.hp = readCardNumber(target.card.instance.hp, 0) - resolvedDamage;
  if (getEffectiveHp(runtime, target) > 0) {
    return;
  }

  if (isLeaderCard(runtime, target)) {
    runtime.phase = 'GAME_OVER';
    runtime.outcome = {
      winner: sourceSide,
      loser: target.side,
      reason: 'LEADER_DEFEATED',
    };
    return;
  }

  moveBattlefieldCardToDrop(runtime, target);
}

function clearBattlefieldLeaveEffects(
  runtime: BattleRuntimeState,
  leavingCard: BattleCardRuntimeState,
): void {
  const leavingInstanceId = leavingCard.card.instance.instanceId;
  leavingCard.abilityEffects = [];

  for (const card of listAllRuntimeCards(runtime)) {
    if (card === leavingCard) {
      continue;
    }

    card.abilityEffects = card.abilityEffects.filter(
      (effect) =>
        effect.expiresAt !== 'BATTLEFIELD_LEAVE' || effect.sourceInstanceId !== leavingInstanceId,
    );
  }
}

function hasTrait(card: BattleCardRuntimeState, traitId: string): boolean {
  return hasCardTrait(card.card.definition.traits, traitId);
}

function hasAnyTrait(card: BattleCardRuntimeState, traitIds: readonly string[]): boolean {
  return hasAnyCardTrait(card.card.definition.traits, traitIds);
}

function applyHealingToBattlefieldCard(target: BattleCardRuntimeState, value: number): void {
  target.card.instance.hp = readCardNumber(target.card.instance.hp, 0) + Math.max(0, value);
}

function consumeNextAttackAbilityEffects(card: BattleCardRuntimeState): void {
  card.abilityEffects = card.abilityEffects.filter((effect) => effect.expiresAt !== 'NEXT_ATTACK');
}

function readCardNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isBattlefieldEntryTurn(
  runtime: BattleRuntimeState,
  card: BattleCardRuntimeState,
): boolean {
  return card.enteredBattlefieldTurnNumber === runtime.turnNumber;
}

function reindexHand(participant: BattleParticipantRuntimeState): void {
  participant.hand.forEach((card, index) => {
    card.handIndex = index;
  });
}

function reindexDeck(participant: BattleParticipantRuntimeState): void {
  participant.deck.forEach((card, index) => {
    card.deckIndex = index;
  });
}

function resetTurnFlagsForSide(runtime: BattleRuntimeState, side: BattleSide): void {
  for (const card of listAllParticipantCards(runtime, side)) {
    card.hasMovedThisTurn = false;
    card.hasAttackedThisTurn = false;
    card.hasUsedActiveSkillThisTurn = false;
  }
}

function listAllParticipantCards(
  runtime: BattleRuntimeState,
  side: BattleSide,
): BattleCardRuntimeState[] {
  const participant = getParticipant(runtime, side);
  const cards = [
    participant.leader,
    ...participant.deck,
    ...participant.hand,
    ...participant.drop,
    ...participant.exile,
    ...runtime.battlefield.filter((card) => card.side === side),
    ...runtime.drop.filter((card) => card.side === side),
    ...runtime.exile.filter((card) => card.side === side),
  ];
  const seen = new Set<string>();
  return cards.filter((card) => {
    const instanceId = card.card.instance.instanceId;
    if (seen.has(instanceId)) {
      return false;
    }

    seen.add(instanceId);
    return true;
  });
}

function listAllRuntimeCards(runtime: BattleRuntimeState): BattleCardRuntimeState[] {
  const cards = [
    ...listAllParticipantCards(runtime, 'player'),
    ...listAllParticipantCards(runtime, 'enemy'),
  ];
  const seen = new Set<string>();
  return cards.filter((card) => {
    const instanceId = card.card.instance.instanceId;
    if (seen.has(instanceId)) {
      return false;
    }

    seen.add(instanceId);
    return true;
  });
}

function isLeaderCard(runtime: BattleRuntimeState, card: BattleCardRuntimeState): boolean {
  return getParticipant(runtime, card.side).leader === card;
}

function moveBattlefieldCardToDrop(
  runtime: BattleRuntimeState,
  card: BattleCardRuntimeState,
): void {
  resolveRetreatAbilities(runtime, card);
  clearBattlefieldLeaveEffects(runtime, card);
  runtime.battlefield = runtime.battlefield.filter(
    (entry) => entry.card.instance.instanceId !== card.card.instance.instanceId,
  );
  card.zone = 'DROP';
  card.battlefieldSlot = null;
  card.enteredBattlefieldTurnNumber = null;
  card.handIndex = null;
  card.deckIndex = null;
  getParticipant(runtime, card.side).drop.push(card);
  runtime.drop.push(card);
}
