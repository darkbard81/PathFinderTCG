import type {
  BattlePublicBlockPrompt,
  BattlePublicCard,
  BattlePublicHandCard,
  BattlePublicPiles,
  BattlePublicSkill,
  BattlePublicSlot,
  BattlePublicState,
} from '../../game/battle/protocol';
import {
  ALL_BATTLE_SLOT_IDS,
  type BattleBlockDecision,
  type BattleCardRuntimeState,
  type BattleParticipantRuntimeState,
  type BattleRuntimeState,
  type BattleSlotId,
  type BattleTurnEvent,
} from '../../game/battle/types';
import type { StageBattleResult } from '../../game/stage/types';
import { ACTIVE_SKILL_DEFINITIONS } from './ability-handlers';
import {
  calculateSlotDominance,
  findBattlefieldCardAtSlot,
  getEffectiveAttack,
  getEffectiveDominance,
  getEffectiveHp,
  listActiveSkillActions,
  listAttackActions,
  listMoveActions,
  listPlaceActions,
} from './battle-engine';

export type ProjectBattleStateOptions = {
  battleId: string;
  stageId: string;
  runtime: BattleRuntimeState;
  pendingBlock: BattleBlockDecision | null;
  automationPending: boolean;
  automationStalled: boolean;
  result: StageBattleResult | null;
};

/**
 * 서버가 가진 전투 런타임을 브라우저가 그릴 수 있는 공개 상태로 옮긴다.
 *
 * 옮기지 않는 것이 이 함수의 요점이다. 적 손패와 양측 덱 내용은 담지 않고,
 * 합법 행동은 브라우저가 다시 계산하지 않도록 여기서 판정해 칸마다 붙여 준다.
 */
export function projectBattleState(options: ProjectBattleStateOptions): BattlePublicState {
  const { runtime } = options;
  // 내 차례가 아니거나 방어 선택 중이면 지금 둘 수 있는 수가 없다. 계산도 하지 않는다.
  const playerCanAct =
    runtime.phase !== 'GAME_OVER' && runtime.currentSide === 'player' && !options.pendingBlock;
  const placeActions = playerCanAct ? listPlaceActions(runtime, 'player') : [];
  const moveActions = playerCanAct ? listMoveActions(runtime, 'player') : [];
  const attackActions = playerCanAct ? listAttackActions(runtime, 'player') : [];
  const skillActions = playerCanAct ? listActiveSkillActions(runtime, 'player') : [];

  const slots = ALL_BATTLE_SLOT_IDS.map((slotId): BattlePublicSlot => {
    const card = findBattlefieldCardAtSlot(runtime, slotId);
    if (!card) {
      return {
        slotId,
        card: null,
        dominance: calculateSlotDominance(runtime, slotId),
        ready: null,
        skills: [],
        moveSlotIds: [],
        attackSlotIds: [],
      };
    }

    const publicCard = toPublicCard(runtime, card);
    if (card.side !== 'player') {
      return {
        slotId,
        card: publicCard,
        dominance: null,
        ready: null,
        skills: [],
        moveSlotIds: [],
        attackSlotIds: [],
      };
    }

    const instanceId = card.card.instance.instanceId;
    const moveSlotIds = moveActions
      .filter((action) => action.cardInstanceId === instanceId)
      .map((action) => action.toSlotId);
    const attackSlotIds = attackActions
      .filter((action) => action.attackerInstanceId === instanceId)
      .map((action) => action.toSlotId);
    const skills = toPublicSkills(card, skillActions);

    return {
      slotId,
      card: publicCard,
      dominance: null,
      // 내 차례가 아니면 소진 여부를 판정하지 않는다. 적 턴 내내 내 카드가 회색이 되면 산만하다.
      ready: playerCanAct
        ? moveSlotIds.length > 0 || attackSlotIds.length > 0 || skills.length > 0
        : null,
      skills,
      moveSlotIds,
      attackSlotIds,
    };
  });

  const hand = [...runtime.player.hand]
    .sort((left, right) => (left.handIndex ?? 0) - (right.handIndex ?? 0))
    .map((card): BattlePublicHandCard => ({
      card: toPublicCard(runtime, card),
      placeSlotIds: placeActions
        .filter((action) => action.cardInstanceId === card.card.instance.instanceId)
        .map((action) => action.toSlotId),
    }));

  return {
    battleId: options.battleId,
    stageId: options.stageId,
    turnNumber: runtime.turnNumber,
    currentSide: runtime.currentSide,
    phase: runtime.phase,
    outcome: runtime.outcome ? { ...runtime.outcome } : null,
    slots,
    hand,
    player: toPublicPiles(runtime, runtime.player),
    enemy: {
      ...toPublicPiles(runtime, runtime.enemy),
      handCount: runtime.enemy.hand.length,
    },
    blockPrompt: options.pendingBlock ? toPublicBlockPrompt(runtime, options.pendingBlock) : null,
    automationPending: options.automationPending,
    automationStalled: options.automationStalled,
    result: options.result,
  };
}

/**
 * 이벤트에 나온 카드의 이름만 모은다.
 * 기록 문구를 만들려면 이름이 필요한데, 그 때문에 적 손패 전체를 내보낼 이유는 없다.
 */
export function collectEventCardNames(
  runtime: BattleRuntimeState,
  events: readonly BattleTurnEvent[],
): Record<string, string> {
  const instanceIds = new Set<string>();
  for (const event of events) {
    if (event.type === 'TURN_START') {
      if (event.drewCardInstanceId) {
        instanceIds.add(event.drewCardInstanceId);
      }
      continue;
    }

    if (event.type === 'ACTION') {
      const { action } = event;
      if (action.type === 'ATTACK') {
        instanceIds.add(action.attackerInstanceId);
        instanceIds.add(action.targetInstanceId);
      } else {
        instanceIds.add(action.cardInstanceId);
      }
      continue;
    }

    if (event.type === 'ACTIVE_SKILL') {
      instanceIds.add(event.action.cardInstanceId);
      instanceIds.add(event.action.targetInstanceId);
      continue;
    }

    if (event.type === 'BLOCK') {
      instanceIds.add(event.action.blockerInstanceId);
      instanceIds.add(event.action.attackAction.attackerInstanceId);
      instanceIds.add(event.action.attackAction.targetInstanceId);
    }
  }

  const names: Record<string, string> = {};
  for (const instanceId of instanceIds) {
    const found = findRuntimeCard(runtime, instanceId);
    if (found) {
      names[instanceId] = found.card.instance.name;
    }
  }

  return names;
}

/** 인스턴스 id로 카드를 찾는다. 어느 Zone에 있든 찾을 수 있게 전부 훑는다. */
export function findRuntimeCard(
  runtime: BattleRuntimeState,
  instanceId: string,
): BattleCardRuntimeState | null {
  const pools = [
    runtime.battlefield,
    runtime.drop,
    runtime.exile,
    runtime.player.hand,
    runtime.player.deck,
    runtime.enemy.hand,
    runtime.enemy.deck,
  ];

  for (const pool of pools) {
    const found = pool.find((card) => card.card.instance.instanceId === instanceId);
    if (found) {
      return found;
    }
  }

  return null;
}

function toPublicCard(runtime: BattleRuntimeState, card: BattleCardRuntimeState): BattlePublicCard {
  return {
    instanceId: card.card.instance.instanceId,
    side: card.side,
    card: {
      instance: structuredClone(card.card.instance),
      definition: card.card.definition,
    },
    attack: getEffectiveAttack(runtime, card),
    hp: getEffectiveHp(runtime, card),
    dominance: getEffectiveDominance(runtime, card),
  };
}

function toPublicSkills(
  card: BattleCardRuntimeState,
  skillActions: readonly { cardInstanceId: string; skillId: string; targetSlotId: BattleSlotId }[],
): BattlePublicSkill[] {
  const instanceId = card.card.instance.instanceId;

  return card.card.definition.abilities.flatMap((ability): BattlePublicSkill[] => {
    const definition = ACTIVE_SKILL_DEFINITIONS[ability.id];
    if (!definition) {
      return [];
    }

    const targetSlotIds = skillActions
      .filter((action) => action.cardInstanceId === instanceId && action.skillId === ability.id)
      .map((action) => action.targetSlotId);
    // 지금 쓸 대상이 없는 스킬은 내보내지 않는다. 눌러도 안 되는 배지를 띄우지 않기 위해서다.
    if (targetSlotIds.length === 0) {
      return [];
    }

    return [
      {
        skillId: ability.id,
        name: ability.name,
        effect: definition.effect,
        value: definition.value,
        targetSlotIds,
      },
    ];
  });
}

function toPublicPiles(
  runtime: BattleRuntimeState,
  participant: BattleParticipantRuntimeState,
): BattlePublicPiles {
  const dropTop = participant.drop.at(-1);
  const exileTop = participant.exile.at(-1);

  return {
    deckCount: participant.deck.length,
    dropCount: participant.drop.length,
    exileCount: participant.exile.length,
    dropTop: dropTop ? toPublicCard(runtime, dropTop) : null,
    exileTop: exileTop ? toPublicCard(runtime, exileTop) : null,
  };
}

function toPublicBlockPrompt(
  runtime: BattleRuntimeState,
  decision: BattleBlockDecision,
): BattlePublicBlockPrompt {
  return {
    attackerName: readCardName(runtime, decision.attackAction.attackerInstanceId),
    targetName: readCardName(runtime, decision.attackAction.targetInstanceId),
    attack: decision.attackAction.attack,
    blockers: decision.blockActions.map((action) => ({
      instanceId: action.blockerInstanceId,
      name: readCardName(runtime, action.blockerInstanceId),
    })),
  };
}

function readCardName(runtime: BattleRuntimeState, instanceId: string): string {
  return findRuntimeCard(runtime, instanceId)?.card.instance.name ?? '카드';
}
