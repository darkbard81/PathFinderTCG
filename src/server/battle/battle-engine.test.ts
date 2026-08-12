import { describe, expect, it } from 'vitest';
import { createInitialSaveState } from '../../game/save/create-initial-save';
import { equipCollectionEquipmentToDeckUnit } from '../../game/save/equipment';
import { createGameSession } from '../../game/save/session';
import { requireStageDefinition } from '../../game/stage/stage-definitions';
import {
  applyActiveSkillAction,
  applyAttackAction,
  applyBlockAction,
  applyAutoTurnEndIfStalled,
  applyMoveAction,
  applyPlaceAction,
  applyTurnStart,
  applyTurnEnd,
  calculateSlotDominance,
  chooseAutomatedBattleAction,
  findBattlefieldCardAtSlot,
  getEffectiveAttack,
  getEffectiveDominance,
  getEffectiveHp,
  listActiveSkillActions,
  listAttackActions,
  listBlockActions,
  listMoveActions,
  listPlaceActions,
  MAX_AUTOMATED_ACTIONS_PER_TURN,
  runAutomatedTurn,
  runAutomatedTurnUntilBlockDecision,
} from './battle-engine';
import { createTestBattleRuntime } from './__fixtures__/create-test-battle-runtime';
import {
  INITIAL_HAND_SIZE,
  type BattleCardRuntimeState,
  type BattleRuntimeState,
  type BattleSide,
  type BattleSlotId,
} from '../../game/battle/types';

const TEST_STAGE_DEFINITION = requireStageDefinition('test-stage-dark');
const PRESERVE_DECK_ORDER = () => 0.999_999;

describe('battle engine', () => {
  it('calculates dominance from only orthogonally adjacent allied cards on empty slots', async () => {
    const runtime = await createRuntime();

    expect(calculateSlotDominance(runtime, 'player:FC')).toBe(1);
    expect(calculateSlotDominance(runtime, 'player:BR')).toBe(1);
    expect(calculateSlotDominance(runtime, 'player:FR')).toBe(0);
    expect(calculateSlotDominance(runtime, 'player:BC')).toBe(0);
  });

  it('lists place actions when hand card cost is within target slot dominance', async () => {
    const runtime = await createRuntime();
    const actions = listPlaceActions(runtime);
    const archerToCenterFront = actions.find(
      (action) => action.fromHandIndex === 1 && action.toSlotId === 'player:FC',
    );

    expect(archerToCenterFront).toMatchObject({
      type: 'PLACE',
      fromHandIndex: 1,
      toSlotId: 'player:FC',
      dominance: 1,
      cost: 1,
    });
    expect(actions.some((action) => action.fromHandIndex === 0)).toBe(false);
    expect(actions.some((action) => action.toSlotId === 'player:BC')).toBe(false);
  });

  it('applies place actions by moving a card from hand to battlefield and reindexing hand', async () => {
    const runtime = await createRuntime();
    const action = listPlaceActions(runtime).find(
      (candidate) => candidate.fromHandIndex === 1 && candidate.toSlotId === 'player:FC',
    );
    if (!action) {
      throw new Error('Expected a legal place action');
    }
    const placedCardId = action.cardInstanceId;

    applyPlaceAction(runtime, action);

    const placedCard = findBattlefieldCardAtSlot(runtime, 'player:FC');
    expect(placedCard?.card.instance.instanceId).toBe(placedCardId);
    expect(placedCard?.zone).toBe('BATTLEFIELD');
    expect(placedCard?.enteredBattlefieldTurnNumber).toBe(runtime.turnNumber);
    expect(placedCard?.handIndex).toBeNull();
    expect(runtime.player.hand).toHaveLength(4);
    expect(runtime.player.hand.map((card) => card.handIndex)).toEqual([0, 1, 2, 3]);
  });

  it('recalculates place dominance for every empty slot after placing a card', async () => {
    const runtime = await createRuntime();
    const action = listPlaceActions(runtime).find(
      (candidate) => candidate.fromHandIndex === 1 && candidate.toSlotId === 'player:FC',
    );
    if (!action) {
      throw new Error('Expected a legal place action');
    }

    applyPlaceAction(runtime, action);

    const scout = runtime.player.hand.find(
      (card) => card.card.definition.id === 'unit_elf_scout_001',
    );
    if (!scout) {
      throw new Error('Expected scout to remain in hand after placing archer');
    }

    const scoutPlaceSlots = listPlaceActions(runtime)
      .filter((candidate) => candidate.cardInstanceId === scout.card.instance.instanceId)
      .map((candidate) => candidate.toSlotId)
      .sort();

    expect(scoutPlaceSlots).toEqual(['player:BL', 'player:BR', 'player:FL', 'player:FR']);
  });

  it('keeps only cost-satisfied place slots after placing cards on center and right front', async () => {
    const runtime = await createRuntime();
    const archerAction = listPlaceActions(runtime).find(
      (candidate) => candidate.fromHandIndex === 1 && candidate.toSlotId === 'player:FC',
    );
    if (!archerAction) {
      throw new Error('Expected a legal archer place action');
    }
    applyPlaceAction(runtime, archerAction);

    const scoutAction = listPlaceActions(runtime).find(
      (candidate) => candidate.fromHandIndex === 1 && candidate.toSlotId === 'player:FR',
    );
    if (!scoutAction) {
      throw new Error('Expected a legal scout place action');
    }
    applyPlaceAction(runtime, scoutAction);

    expect(calculateSlotDominance(runtime, 'player:FL')).toBe(1);
    expect(calculateSlotDominance(runtime, 'player:BR')).toBe(2);
    expect(calculateSlotDominance(runtime, 'player:BL')).toBe(1);

    const remainingHandSlots = [
      ...new Set(listPlaceActions(runtime).map((action) => action.toSlotId)),
    ];
    expect(remainingHandSlots).toEqual(['player:BR']);
    expect(listPlaceActions(runtime).every((action) => action.cost === 2)).toBe(true);

    const lancer = moveCardToHand(runtime, 'player', 'unit_elf_lancer_001');
    const lancerPlaceSlots = listPlaceActions(runtime)
      .filter((action) => action.cardInstanceId === lancer.card.instance.instanceId)
      .map((action) => action.toSlotId)
      .sort();

    expect(lancerPlaceSlots).toEqual(['player:BL', 'player:BR', 'player:FL']);
  });

  it('allows each current-side battlefield card to move once to orthogonally adjacent empty slots before attacking', async () => {
    const runtime = await createRuntime();
    const moveAction = listMoveActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === runtime.player.leader.card.instance.instanceId &&
        candidate.toSlotId === 'player:FC',
    );
    if (!moveAction) {
      throw new Error('Expected a legal move action');
    }
    const leaderMoveSlots = listMoveActions(runtime)
      .filter(
        (candidate) => candidate.cardInstanceId === runtime.player.leader.card.instance.instanceId,
      )
      .map((candidate) => candidate.toSlotId);

    applyMoveAction(runtime, moveAction);

    expect(leaderMoveSlots).toEqual(['player:FC', 'player:BR', 'player:BL']);
    expect(leaderMoveSlots).not.toContain('player:FR');
    expect(runtime.player.leader.battlefieldSlot).toBe('player:FC');
    expect(runtime.player.leader.hasMovedThisTurn).toBe(true);
    expect(
      listMoveActions(runtime).some(
        (candidate) => candidate.cardInstanceId === runtime.player.leader.card.instance.instanceId,
      ),
    ).toBe(false);
    expect(
      listMoveActions(runtime).some((candidate) => candidate.toSlotId.startsWith('enemy:')),
    ).toBe(false);

    runtime.phase = 'ATTACK';
    expect(listMoveActions(runtime)).toEqual([]);
  });

  it('applies attacks and moves defeated non-leader cards to drop piles', async () => {
    const runtime = await createRuntime();
    const moveAction = listMoveActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === runtime.player.leader.card.instance.instanceId &&
        candidate.toSlotId === 'player:FC',
    );
    if (!moveAction) {
      throw new Error('Expected a legal leader move action');
    }
    applyMoveAction(runtime, moveAction);
    const target = placeHandCardOnBattlefield(runtime, 'enemy', 0, 'enemy:FC');
    target.card.instance.hp = (runtime.player.leader.card.instance.attack ?? 0) - 1;
    const attackAction = listAttackActions(runtime).find(
      (candidate) => candidate.targetInstanceId === target.card.instance.instanceId,
    );
    if (!attackAction) {
      throw new Error('Expected a legal attack action');
    }

    applyAttackAction(runtime, attackAction);

    expect(runtime.phase).toBe('ATTACK');
    expect(runtime.player.leader.hasAttackedThisTurn).toBe(true);
    expect(findBattlefieldCardAtSlot(runtime, 'enemy:FC')).toBeNull();
    expect(target.zone).toBe('DROP');
    expect(target.battlefieldSlot).toBeNull();
    expect(runtime.drop).toContain(target);
    expect(runtime.enemy.drop).toContain(target);
    expect(listMoveActions(runtime)).toEqual([]);
  });

  it('disables attacks and active skills only for cards on their battlefield entry turn', async () => {
    const runtime = await createRuntime(2);
    const establishedAttacker = moveCardToBattlefield(
      runtime,
      'player',
      'unit_elf_archer_001',
      'player:FC',
    );
    const newAttacker = moveCardToBattlefield(
      runtime,
      'player',
      'unit_elf_scout_001',
      'player:FL',
      runtime.turnNumber,
    );
    const newHealer = moveCardToBattlefield(
      runtime,
      'player',
      'unit_elf_healer_001',
      'player:FR',
      runtime.turnNumber,
    );

    const attackActions = listAttackActions(runtime);
    const skillActions = listActiveSkillActions(runtime);

    expect(
      attackActions.some(
        (action) => action.attackerInstanceId === establishedAttacker.card.instance.instanceId,
      ),
    ).toBe(true);
    expect(
      attackActions.some(
        (action) => action.attackerInstanceId === newAttacker.card.instance.instanceId,
      ),
    ).toBe(false);
    expect(
      skillActions.some((action) => action.cardInstanceId === newHealer.card.instance.instanceId),
    ).toBe(false);
    expect(listMoveActions(runtime).length).toBeGreaterThan(0);
    expect(listPlaceActions(runtime).length).toBeGreaterThan(0);
    expect(newAttacker.hasAttackedThisTurn).toBe(false);
    expect(newHealer.hasUsedActiveSkillThisTurn).toBe(false);
  });

  it('reenables a card attack and active skill after its battlefield entry turn ends', async () => {
    const runtime = await createRuntime(2);
    const attacker = moveCardToBattlefield(
      runtime,
      'player',
      'unit_elf_archer_001',
      'player:FC',
      runtime.turnNumber,
    );
    const healer = moveCardToBattlefield(
      runtime,
      'player',
      'unit_elf_healer_001',
      'player:FR',
      runtime.turnNumber,
    );

    expect(
      listAttackActions(runtime).some(
        (action) => action.attackerInstanceId === attacker.card.instance.instanceId,
      ),
    ).toBe(false);
    expect(
      listActiveSkillActions(runtime).some(
        (action) => action.cardInstanceId === healer.card.instance.instanceId,
      ),
    ).toBe(false);

    applyTurnEnd(runtime);
    applyTurnEnd(runtime);

    expect(runtime.currentSide).toBe('player');
    expect(runtime.turnNumber).toBe(3);
    expect(
      listAttackActions(runtime).some(
        (action) => action.attackerInstanceId === attacker.card.instance.instanceId,
      ),
    ).toBe(true);
    expect(
      listActiveSkillActions(runtime).some(
        (action) => action.cardInstanceId === healer.card.instance.instanceId,
      ),
    ).toBe(true);
  });

  it('rejects attack and active skill actions forged for a card battlefield entry turn', async () => {
    const runtime = await createRuntime(2);
    const attacker = moveCardToBattlefield(runtime, 'player', 'unit_elf_archer_001', 'player:FC');
    const healer = moveCardToBattlefield(runtime, 'player', 'unit_elf_healer_001', 'player:FR');
    const attackAction = listAttackActions(runtime).find(
      (action) =>
        action.attackerInstanceId === attacker.card.instance.instanceId &&
        action.targetInstanceId === runtime.enemy.leader.card.instance.instanceId,
    );
    const skillAction = listActiveSkillActions(runtime).find(
      (action) =>
        action.cardInstanceId === healer.card.instance.instanceId &&
        action.targetInstanceId === attacker.card.instance.instanceId,
    );
    if (!attackAction || !skillAction) {
      throw new Error('Expected legal post-opening actions');
    }

    attacker.enteredBattlefieldTurnNumber = runtime.turnNumber;
    healer.enteredBattlefieldTurnNumber = runtime.turnNumber;

    expect(() => applyAttackAction(runtime, attackAction)).toThrow('Illegal attack action');
    expect(() => applyActiveSkillAction(runtime, skillAction)).toThrow(
      'Illegal active skill action',
    );
  });

  it('records a game-over outcome when a leader is defeated', async () => {
    const runtime = await createRuntime();
    const moveAction = listMoveActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === runtime.player.leader.card.instance.instanceId &&
        candidate.toSlotId === 'player:FC',
    );
    if (!moveAction) {
      throw new Error('Expected a legal leader move action');
    }
    applyMoveAction(runtime, moveAction);
    runtime.enemy.leader.card.instance.hp = runtime.player.leader.card.instance.attack ?? 0;
    const attackAction = listAttackActions(runtime).find(
      (candidate) => candidate.targetInstanceId === runtime.enemy.leader.card.instance.instanceId,
    );
    if (!attackAction) {
      throw new Error('Expected a legal leader attack action');
    }

    applyAttackAction(runtime, attackAction);

    expect(runtime.phase).toBe('GAME_OVER');
    expect(runtime.outcome).toEqual({
      winner: 'player',
      loser: 'enemy',
      reason: 'LEADER_DEFEATED',
    });
    expect(findBattlefieldCardAtSlot(runtime, 'enemy:BC')).toBe(runtime.enemy.leader);
  });

  it('limits basic attacks by front and back row positioning', async () => {
    const runtime = await createRuntime();
    expect(
      listAttackActions(runtime).some(
        (candidate) =>
          candidate.attackerInstanceId === runtime.player.leader.card.instance.instanceId,
      ),
    ).toBe(false);

    const moveAction = listMoveActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === runtime.player.leader.card.instance.instanceId &&
        candidate.toSlotId === 'player:FC',
    );
    if (!moveAction) {
      throw new Error('Expected a legal leader move action');
    }
    applyMoveAction(runtime, moveAction);

    expect(
      listAttackActions(runtime).some(
        (candidate) => candidate.targetInstanceId === runtime.enemy.leader.card.instance.instanceId,
      ),
    ).toBe(true);

    placeHandCardOnBattlefield(runtime, 'enemy', 0, 'enemy:FC');

    expect(
      listAttackActions(runtime).some(
        (candidate) => candidate.targetInstanceId === runtime.enemy.leader.card.instance.instanceId,
      ),
    ).toBe(false);
  });

  it('applies FRONT and GLOBAL passive stat bonuses from battlefield abilities', async () => {
    const runtime = await createRuntime();
    const guardian = moveCardToBattlefield(runtime, 'player', 'unit_elf_guardian_001', 'player:FC');
    const archer = moveCardToBattlefield(runtime, 'player', 'unit_elf_archer_001', 'player:FR');
    const bard = moveCardToBattlefield(runtime, 'player', 'unit_elf_bard_001', 'player:BR');

    expect(getEffectiveHp(runtime, guardian)).toBe((guardian.card.instance.hp ?? 0) + 1);
    expect(getEffectiveAttack(runtime, archer)).toBe((archer.card.instance.attack ?? 0) + 1);
    expect(getEffectiveAttack(runtime, bard)).toBe(bard.card.instance.attack);
    expect(getEffectiveDominance(runtime, archer)).toBe(archer.card.instance.dominance);

    guardian.battlefieldSlot = 'player:BR';
    expect(getEffectiveHp(runtime, guardian)).toBe(guardian.card.instance.hp);
  });

  it('applies SUMMON attack bonuses after legal place and expires them at turn end', async () => {
    const runtime = await createRuntime();
    const lancer = moveCardToHand(runtime, 'player', 'unit_elf_lancer_001');
    const action = listPlaceActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === lancer.card.instance.instanceId &&
        candidate.toSlotId === 'player:FC',
    );
    if (!action) {
      throw new Error('Expected a legal lancer place action');
    }

    applyPlaceAction(runtime, action);

    expect(getEffectiveAttack(runtime, lancer)).toBe((lancer.card.instance.attack ?? 0) + 1);
    applyTurnEnd(runtime);
    expect(getEffectiveAttack(runtime, lancer)).toBe(lancer.card.instance.attack);
  });

  it('applies MOVE attack bonuses only after successful movement and expires them at turn end', async () => {
    const runtime = await createRuntime();
    const scout = moveCardToBattlefield(runtime, 'player', 'unit_elf_scout_001', 'player:FC');
    const action = listMoveActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === scout.card.instance.instanceId &&
        candidate.toSlotId === 'player:FR',
    );
    if (!action) {
      throw new Error('Expected a legal scout move action');
    }

    applyMoveAction(runtime, action);

    expect(getEffectiveAttack(runtime, scout)).toBe((scout.card.instance.attack ?? 0) + 1);
    applyTurnEnd(runtime);
    expect(getEffectiveAttack(runtime, scout)).toBe(scout.card.instance.attack);
  });

  it('uses ATTACK conditional bonuses when resolving damage against back row targets', async () => {
    const runtime = await createRuntime();
    const archer = moveCardToBattlefield(runtime, 'player', 'unit_elf_archer_001', 'player:FC');
    const targetHpBefore = runtime.enemy.leader.card.instance.hp ?? 0;
    const action = listAttackActions(runtime).find(
      (candidate) =>
        candidate.attackerInstanceId === archer.card.instance.instanceId &&
        candidate.targetInstanceId === runtime.enemy.leader.card.instance.instanceId,
    );
    if (!action) {
      throw new Error('Expected a legal archer attack action');
    }

    applyAttackAction(runtime, action);

    expect(action.attack).toBe((archer.card.instance.attack ?? 0) + 1);
    expect(runtime.enemy.leader.card.instance.hp).toBe(targetHpBefore - action.attack);
  });

  it('uses equipped ATTACK abilities when resolving attack damage', async () => {
    const state = await createInitialSaveState({ slotId: 1 });
    const session = createGameSession(state);
    const target = session.deck.cards.find(
      (card) => card.definition.id === 'unit_elf_guardian_001',
    )!;
    const equipment = session.collection.cards.find(
      (card) => card.definition.id === 'equipment_rapier_001',
    )!;
    const runtime = createTestBattleRuntime(
      equipCollectionEquipmentToDeckUnit(session, {
        targetDeckCardInstanceId: target.instance.instanceId,
        equipmentCardInstanceId: equipment.instance.instanceId,
      }),
      TEST_STAGE_DEFINITION,
      PRESERVE_DECK_ORDER,
    );
    runtime.turnNumber = 2;
    const guardian = moveCardToBattlefield(runtime, 'player', 'unit_elf_guardian_001', 'player:FC');
    const action = listAttackActions(runtime).find(
      (candidate) =>
        candidate.attackerInstanceId === guardian.card.instance.instanceId &&
        candidate.targetInstanceId === runtime.enemy.leader.card.instance.instanceId,
    );
    if (!action) {
      throw new Error('Expected a legal equipped guardian attack action');
    }

    applyAttackAction(runtime, action);

    expect(getEffectiveAttack(runtime, guardian)).toBe((target.instance.attack ?? 0) + 1);
    expect(action.attack).toBe((target.instance.attack ?? 0) + 3);
  });

  it('lists guardian_block cards adjacent to the original attack target as block candidates', async () => {
    const runtime = await createRuntime();
    const { attackAction, guardian } = setupGuardianBlockScenario(runtime, 'player:FR');

    const blockActions = listBlockActions(runtime, attackAction);

    expect(blockActions).toEqual([
      {
        type: 'BLOCK',
        attackAction,
        blockerInstanceId: guardian.card.instance.instanceId,
        blockerSlotId: 'player:FR',
      },
    ]);
  });

  it('does not list non-adjacent guardian_block cards as block candidates', async () => {
    const runtime = await createRuntime();
    const { attackAction } = setupGuardianBlockScenario(runtime, 'player:BL');

    expect(listBlockActions(runtime, attackAction)).toEqual([]);
  });

  it('does not list block candidates for direct leader attacks', async () => {
    const runtime = await createRuntime();
    const guardian = moveCardToBattlefield(runtime, 'player', 'unit_elf_guardian_001', 'player:BR');
    const attacker = moveCardToBattlefield(runtime, 'enemy', 'unit_dark_archer_001', 'enemy:FC');
    runtime.currentSide = 'enemy';
    runtime.phase = 'ATTACK';
    const attackAction = listAttackActions(runtime, 'enemy').find(
      (candidate) =>
        candidate.attackerInstanceId === attacker.card.instance.instanceId &&
        candidate.targetInstanceId === runtime.player.leader.card.instance.instanceId,
    );
    if (!attackAction) {
      throw new Error('Expected a legal direct leader attack action');
    }

    expect(guardian.battlefieldSlot).toBe('player:BR');
    expect(listBlockActions(runtime, attackAction)).toEqual([]);
  });

  it('applies block actions by damaging the blocker instead of the original target', async () => {
    const runtime = await createRuntime();
    const { attackAction, guardian, target } = setupGuardianBlockScenario(runtime, 'player:FR');
    const blockAction = listBlockActions(runtime, attackAction)[0];
    if (!blockAction) {
      throw new Error('Expected a legal block action');
    }
    const targetHpBefore = target.card.instance.hp ?? 0;
    const guardianHpBefore = guardian.card.instance.hp ?? 0;

    applyBlockAction(runtime, blockAction);

    expect(target.card.instance.hp).toBe(targetHpBefore);
    expect(guardian.card.instance.hp).toBe(guardianHpBefore - blockAction.attackAction.attack);
    expect(blockAction.attackAction.attack).toBeGreaterThan(0);
    expect(guardian.zone).toBe('BATTLEFIELD');
    expect(target.zone).toBe('BATTLEFIELD');
  });

  it('moves defeated blockers to drop after block damage resolves', async () => {
    const runtime = await createRuntime();
    const { attackAction, guardian } = setupGuardianBlockScenario(runtime, 'player:FR');
    guardian.card.instance.hp = 1;
    const blockAction = listBlockActions(runtime, attackAction)[0];
    if (!blockAction) {
      throw new Error('Expected a legal block action');
    }

    applyBlockAction(runtime, blockAction);

    expect(guardian.zone).toBe('DROP');
    expect(guardian.battlefieldSlot).toBeNull();
    expect(runtime.player.drop).toContain(guardian);
    expect(runtime.drop).toContain(guardian);
  });

  it('keeps existing attack resolution unchanged when no block candidate exists', async () => {
    const runtime = await createRuntime();
    const { attackAction, target } = setupGuardianBlockScenario(runtime, 'player:BL');
    const targetHpBefore = target.card.instance.hp ?? 0;

    expect(listBlockActions(runtime, attackAction)).toEqual([]);
    applyAttackAction(runtime, attackAction);

    expect(target.card.instance.hp).toBe(targetHpBefore - attackAction.attack);
    expect(target.zone).toBe('DROP');
    expect(target.battlefieldSlot).toBeNull();
  });

  it('stops automated enemy turns before applying a blockable attack', async () => {
    const runtime = await createRuntime();
    const { attacker, target } = setupGuardianBlockScenario(runtime, 'player:FR');
    const targetHpBefore = target.card.instance.hp ?? 0;

    const result = runAutomatedTurnUntilBlockDecision(runtime, 'enemy', {
      interruptForBlockSide: 'player',
    });

    expect(result.events).toEqual([]);
    expect(result.actionCount).toBe(0);
    expect(result.blockDecision?.attackAction.attackerInstanceId).toBe(
      attacker.card.instance.instanceId,
    );
    expect(result.blockDecision?.attackAction.targetInstanceId).toBe(
      target.card.instance.instanceId,
    );
    expect(result.blockDecision?.blockActions).toHaveLength(1);
    expect(target.card.instance.hp).toBe(targetHpBefore);
    expect(attacker.hasAttackedThisTurn).toBe(false);
  });

  it('keeps leafwind attack bonuses until the next own turn ends', async () => {
    const runtime = await createRuntime();
    const bladeDancer = moveCardToBattlefield(
      runtime,
      'player',
      'unit_elf_bladedancer_001',
      'player:FC',
    );
    const target = moveCardToBattlefield(runtime, 'enemy', 'unit_dark_guardian_001', 'enemy:FC');
    target.card.instance.hp = 20;
    const action = listAttackActions(runtime).find(
      (candidate) =>
        candidate.attackerInstanceId === bladeDancer.card.instance.instanceId &&
        candidate.targetInstanceId === target.card.instance.instanceId,
    );
    if (!action) {
      throw new Error('Expected a legal blade dancer attack action');
    }

    applyAttackAction(runtime, action);

    expect(getEffectiveAttack(runtime, bladeDancer)).toBe(
      (bladeDancer.card.instance.attack ?? 0) + 1,
    );
    applyTurnEnd(runtime);
    expect(getEffectiveAttack(runtime, bladeDancer)).toBe(
      (bladeDancer.card.instance.attack ?? 0) + 1,
    );
    applyTurnEnd(runtime);
    expect(getEffectiveAttack(runtime, bladeDancer)).toBe(
      (bladeDancer.card.instance.attack ?? 0) + 1,
    );
    applyTurnEnd(runtime);
    expect(getEffectiveAttack(runtime, bladeDancer)).toBe(bladeDancer.card.instance.attack);
  });

  it('applies ACTION healing to allied battlefield targets and marks the source used', async () => {
    const runtime = await createRuntime();
    const healer = moveCardToBattlefield(runtime, 'player', 'unit_elf_healer_001', 'player:FC');
    const archer = moveCardToBattlefield(runtime, 'player', 'unit_elf_archer_001', 'player:FR');
    archer.card.instance.hp = 1;
    const action = listActiveSkillActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === healer.card.instance.instanceId &&
        candidate.targetInstanceId === archer.card.instance.instanceId,
    );
    if (!action) {
      throw new Error('Expected a legal healer action');
    }

    applyActiveSkillAction(runtime, action);

    expect(action.effect).toBe('HEAL');
    expect(archer.card.instance.hp).toBe(3);
    expect(healer.hasUsedActiveSkillThisTurn).toBe(true);
    expect(
      listActiveSkillActions(runtime).some(
        (candidate) => candidate.cardInstanceId === healer.card.instance.instanceId,
      ),
    ).toBe(false);
  });

  it('applies ACTION damage and moves defeated non-leader targets to drop', async () => {
    const runtime = await createRuntime();
    const mage = moveCardToBattlefield(runtime, 'player', 'unit_elf_mage_001', 'player:FC');
    const target = moveCardToBattlefield(runtime, 'enemy', 'unit_dark_archer_001', 'enemy:FC');
    target.card.instance.hp = 2;
    const action = listActiveSkillActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === mage.card.instance.instanceId &&
        candidate.targetInstanceId === target.card.instance.instanceId,
    );
    if (!action) {
      throw new Error('Expected a legal mage action');
    }

    applyActiveSkillAction(runtime, action);

    expect(action.effect).toBe('DAMAGE');
    expect(mage.hasUsedActiveSkillThisTurn).toBe(true);
    expect(target.zone).toBe('DROP');
    expect(target.battlefieldSlot).toBeNull();
    expect(runtime.enemy.drop).toContain(target);
    expect(runtime.drop).toContain(target);
  });

  it('applies ACTION attack buffs and allows auto turn end after the skill is spent', async () => {
    const runtime = await createRuntime();
    runtime.player.hand = [];
    runtime.player.leader.card.instance.attack = 0;
    runtime.player.leader.hasMovedThisTurn = true;
    runtime.player.leader.hasAttackedThisTurn = true;
    const runesmith = moveCardToBattlefield(
      runtime,
      'player',
      'unit_elf_runesmith_001',
      'player:FC',
    );
    const archer = moveCardToBattlefield(runtime, 'player', 'unit_elf_archer_001', 'player:FR');
    runesmith.card.instance.attack = 0;
    runesmith.hasMovedThisTurn = true;
    runesmith.hasAttackedThisTurn = true;
    archer.card.instance.attack = 0;
    archer.hasMovedThisTurn = true;
    archer.hasAttackedThisTurn = true;
    const action = listActiveSkillActions(runtime).find(
      (candidate) =>
        candidate.cardInstanceId === runesmith.card.instance.instanceId &&
        candidate.targetInstanceId === archer.card.instance.instanceId,
    );
    if (!action) {
      throw new Error('Expected a legal runesmith action');
    }

    applyActiveSkillAction(runtime, action);

    expect(action.effect).toBe('BUFF_ATTACK');
    expect(getEffectiveAttack(runtime, archer)).toBe(1);
    expect(runesmith.hasUsedActiveSkillThisTurn).toBe(true);
    expect(applyAutoTurnEndIfStalled(runtime)).toBe(true);
    expect(runtime.currentSide).toBe('enemy');
  });

  it('does not keep stalled attack phases open for unused active skills', async () => {
    const runtime = await createRuntime();
    const healer = moveCardToBattlefield(runtime, 'player', 'unit_elf_healer_001', 'player:FC');
    runtime.player.hand = [];
    healer.hasAttackedThisTurn = true;
    runtime.phase = 'ATTACK';

    expect(listAttackActions(runtime)).toEqual([]);
    expect(listActiveSkillActions(runtime)).toEqual([]);
    expect(applyAutoTurnEndIfStalled(runtime)).toBe(true);
    expect(runtime.currentSide).toBe('enemy');
  });

  it('starts turns by resetting flags and drawing one card from the current side deck', async () => {
    const runtime = await createRuntime();
    const firstDeckCard = runtime.player.deck[0];
    if (!firstDeckCard) {
      throw new Error('Expected a player deck card to draw');
    }
    runtime.player.leader.hasMovedThisTurn = true;
    runtime.player.leader.hasAttackedThisTurn = true;
    firstDeckCard.hasUsedActiveSkillThisTurn = true;
    const deckSizeBefore = runtime.player.deck.length;

    const event = applyTurnStart(runtime);

    expect(event).toEqual({
      type: 'TURN_START',
      side: 'player',
      drewCardInstanceId: firstDeckCard.card.instance.instanceId,
      deckRemaining: deckSizeBefore - 1,
    });
    expect(runtime.player.hand.at(-1)).toBe(firstDeckCard);
    expect(firstDeckCard.zone).toBe('HAND');
    expect(firstDeckCard.handIndex).toBe(INITIAL_HAND_SIZE);
    expect(firstDeckCard.deckIndex).toBeNull();
    expect(runtime.player.deck.map((card) => card.deckIndex)).toEqual(
      runtime.player.deck.map((_, index) => index),
    );
    expect(runtime.player.leader.hasMovedThisTurn).toBe(false);
    expect(runtime.player.leader.hasAttackedThisTurn).toBe(false);
    expect(firstDeckCard.hasUsedActiveSkillThisTurn).toBe(false);
  });

  it('reports an empty deck without changing hand indexes during turn start', async () => {
    const runtime = await createRuntime();
    runtime.player.deck = [];
    const handIndexesBefore = runtime.player.hand.map((card) => card.handIndex);

    const event = applyTurnStart(runtime);

    expect(event).toEqual({
      type: 'TURN_START',
      side: 'player',
      drewCardInstanceId: null,
      deckRemaining: 0,
    });
    expect(runtime.player.hand.map((card) => card.handIndex)).toEqual(handIndexesBefore);
  });

  it('returns no active skill actions and auto-ends stalled turns once', async () => {
    const runtime = await createRuntime(1);
    runtime.player.hand = [];
    runtime.player.leader.card.instance.attack = 0;
    runtime.player.leader.hasMovedThisTurn = true;
    runtime.player.leader.hasAttackedThisTurn = true;
    const enemyHandSizeBefore = runtime.enemy.hand.length;
    const enemyDeckSizeBefore = runtime.enemy.deck.length;

    expect(listActiveSkillActions(runtime)).toEqual([]);
    expect(applyAutoTurnEndIfStalled(runtime)).toBe(true);
    expect(runtime.currentSide).toBe('enemy');
    expect(runtime.turnNumber).toBe(1);
    expect(runtime.enemy.hand).toHaveLength(enemyHandSizeBefore + 1);
    expect(runtime.enemy.deck).toHaveLength(enemyDeckSizeBefore - 1);
  });

  it('advances turn number when enemy turn ends, starts the next turn, and resets flags', async () => {
    const runtime = await createRuntime(1);
    runtime.enemy.leader.hasMovedThisTurn = true;
    runtime.enemy.leader.hasAttackedThisTurn = true;
    runtime.enemy.leader.hasUsedActiveSkillThisTurn = true;
    const enemyHandSizeBefore = runtime.enemy.hand.length;
    const enemyDeckSizeBefore = runtime.enemy.deck.length;
    const playerHandSizeBefore = runtime.player.hand.length;
    const playerDeckSizeBefore = runtime.player.deck.length;

    applyTurnEnd(runtime);
    expect(runtime.currentSide).toBe('enemy');
    expect(runtime.turnNumber).toBe(1);
    expect(runtime.enemy.hand).toHaveLength(enemyHandSizeBefore + 1);
    expect(runtime.enemy.deck).toHaveLength(enemyDeckSizeBefore - 1);

    applyTurnEnd(runtime);
    expect(runtime.currentSide).toBe('player');
    expect(runtime.turnNumber).toBe(2);
    expect(runtime.player.hand).toHaveLength(playerHandSizeBefore + 1);
    expect(runtime.player.deck).toHaveLength(playerDeckSizeBefore - 1);
    expect(runtime.player.leader.hasMovedThisTurn).toBe(false);
    expect(runtime.player.leader.hasAttackedThisTurn).toBe(false);
    expect(runtime.player.leader.hasUsedActiveSkillThisTurn).toBe(false);
  });

  it('chooses dominance-increasing place before attacks and prefers higher cost place ties', async () => {
    const runtime = await createRuntime();
    runtime.currentSide = 'enemy';

    const firstAction = chooseAutomatedBattleAction(runtime, 'enemy');
    expect(firstAction?.type).toBe('PLACE');

    const tieRuntime = await createRuntime();
    tieRuntime.currentSide = 'enemy';
    const anchorCard = placeHandCardOnBattlefield(tieRuntime, 'enemy', 2, 'enemy:FR');
    const highCostCard = tieRuntime.enemy.hand[0];
    const lowCostCard = tieRuntime.enemy.hand[1];
    if (!highCostCard || !lowCostCard) {
      throw new Error('Expected enemy hand cards for cost tie');
    }
    highCostCard.card.instance.cost = 2;
    highCostCard.card.instance.dominance = 3;
    lowCostCard.card.instance.cost = 1;
    lowCostCard.card.instance.dominance = 2;
    tieRuntime.enemy.leader.hasMovedThisTurn = true;
    anchorCard.hasMovedThisTurn = true;
    const highCostAction = chooseAutomatedBattleAction(tieRuntime, 'enemy');

    expect(highCostAction).toMatchObject({
      type: 'PLACE',
      cardInstanceId: highCostCard.card.instance.instanceId,
      cost: 2,
    });
  });

  it('falls back to highest-cost legal place when dominance cannot increase further', async () => {
    const runtime = await createRuntime();
    runtime.currentSide = 'enemy';
    const placedCard = placeHandCardOnBattlefield(runtime, 'enemy', 1, 'enemy:FC');
    applyMoveAction(runtime, {
      type: 'MOVE',
      cardInstanceId: runtime.enemy.leader.card.instance.instanceId,
      fromSlotId: 'enemy:BC',
      toSlotId: 'enemy:BR',
    });

    const action = chooseAutomatedBattleAction(runtime, 'enemy');

    expect(placedCard.hasMovedThisTurn).toBe(false);
    expect(action).toMatchObject({
      type: 'PLACE',
      cost: 2,
    });
  });

  it('does not choose a move that fails to increase dominance and falls back to attack without legal place', async () => {
    const runtime = await createRuntime();
    runtime.currentSide = 'enemy';
    runtime.enemy.hand = [];
    runtime.enemy.leader.battlefieldSlot = 'enemy:FC';

    const action = chooseAutomatedBattleAction(runtime, 'enemy');

    expect(action?.type).toBe('ATTACK');
  });

  it('chooses dominance-increasing moves when place is unavailable', async () => {
    const runtime = await createRuntime();
    runtime.currentSide = 'enemy';
    placeHandCardOnBattlefield(runtime, 'enemy', 1, 'enemy:FC');
    runtime.enemy.hand = [];

    const action = chooseAutomatedBattleAction(runtime, 'enemy');

    expect(action).toMatchObject({
      type: 'MOVE',
      cardInstanceId: runtime.enemy.leader.card.instance.instanceId,
      fromSlotId: 'enemy:BC',
      toSlotId: 'enemy:BR',
    });
  });

  it('chooses leader attacks first, then the lowest HP battlefield card', async () => {
    const runtime = await createRuntime();
    runtime.currentSide = 'enemy';
    runtime.phase = 'ATTACK';
    placeHandCardOnBattlefield(runtime, 'enemy', 1, 'enemy:FC');
    const highHpTarget = placeHandCardOnBattlefield(runtime, 'player', 1, 'player:FR');
    const lowHpTarget = placeHandCardOnBattlefield(runtime, 'player', 1, 'player:FL');
    highHpTarget.card.instance.hp = 5;
    lowHpTarget.card.instance.hp = 2;

    const leaderAction = chooseAutomatedBattleAction(runtime, 'enemy');
    expect(leaderAction).toMatchObject({
      type: 'ATTACK',
      targetInstanceId: runtime.player.leader.card.instance.instanceId,
    });

    runtime.player.leader.card.instance.hp = 0;
    const lowHpAction = chooseAutomatedBattleAction(runtime, 'enemy');
    expect(lowHpAction).toMatchObject({
      type: 'ATTACK',
      targetInstanceId: lowHpTarget.card.instance.instanceId,
    });
  });

  it('runs automated enemy turns through existing actions and returns control to player', async () => {
    const runtime = await createRuntime();
    const establishedAttacker = moveCardToBattlefield(
      runtime,
      'enemy',
      'unit_dark_archer_001',
      'enemy:FC',
    );
    applyTurnEnd(runtime);
    const playerLeaderHpBefore = runtime.player.leader.card.instance.hp ?? 0;
    const enemyHandSizeBefore = runtime.enemy.hand.length;

    const events = runAutomatedTurn(runtime, 'enemy');
    const placeActions = events.flatMap((event) =>
      event.type === 'ACTION' && event.action.type === 'PLACE' ? [event.action] : [],
    );
    const attackActions = events.flatMap((event) =>
      event.type === 'ACTION' && event.action.type === 'ATTACK' ? [event.action] : [],
    );
    const placedCardInstanceIds = new Set(placeActions.map((action) => action.cardInstanceId));

    expect(events.some((event) => event.type === 'ACTION')).toBe(true);
    expect(placeActions.length).toBeGreaterThan(1);
    expect(runtime.enemy.hand.length).toBeLessThan(enemyHandSizeBefore - 1);
    expect(attackActions.length).toBeGreaterThan(0);
    expect(
      attackActions.some(
        (action) => action.attackerInstanceId === establishedAttacker.card.instance.instanceId,
      ),
    ).toBe(true);
    expect(
      attackActions.every((action) => !placedCardInstanceIds.has(action.attackerInstanceId)),
    ).toBe(true);
    expect(runtime.currentSide).toBe('player');
    expect(runtime.player.leader.card.instance.hp).toBeLessThan(playerLeaderHpBefore);
  });

  it('stops automated turns immediately when a leader is defeated', async () => {
    const runtime = await createRuntime();
    runtime.currentSide = 'enemy';
    runtime.phase = 'ATTACK';
    const attacker = placeHandCardOnBattlefield(runtime, 'enemy', 1, 'enemy:FC');
    runtime.player.leader.card.instance.hp = attacker.card.instance.attack ?? 0;

    const events = runAutomatedTurn(runtime, 'enemy');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'ACTION',
      side: 'enemy',
    });
    expect(runtime.phase).toBe('GAME_OVER');
    expect(runtime.outcome).toEqual({
      winner: 'enemy',
      loser: 'player',
      reason: 'LEADER_DEFEATED',
    });
  });

  it('ends automated turns at the action limit', async () => {
    const runtime = await createRuntime();
    runtime.currentSide = 'enemy';
    runtime.phase = 'ATTACK';
    runtime.player.leader.card.instance.hp = 1000;
    moveEnemyDeckCardsToBattlefield(runtime, MAX_AUTOMATED_ACTIONS_PER_TURN + 1, 'enemy:FC');

    const events = runAutomatedTurn(runtime, 'enemy');

    expect(
      events.filter((event) => event.type === 'ACTION' && event.action.type === 'ATTACK'),
    ).toHaveLength(MAX_AUTOMATED_ACTIONS_PER_TURN);
    expect(events).toContainEqual({
      type: 'ACTION_LIMIT',
      side: 'enemy',
      actionCount: MAX_AUTOMATED_ACTIONS_PER_TURN,
    });
    expect(runtime.currentSide).toBe('player');
  });
});

async function createRuntime(turnNumber = 2): Promise<BattleRuntimeState> {
  const state = await createInitialSaveState({ slotId: 1 });
  const runtime = createTestBattleRuntime(
    createGameSession(state),
    TEST_STAGE_DEFINITION,
    PRESERVE_DECK_ORDER,
  );
  runtime.turnNumber = turnNumber;
  return runtime;
}

function setupGuardianBlockScenario(
  runtime: BattleRuntimeState,
  guardianSlotId: BattleSlotId,
): {
  attacker: BattleCardRuntimeState;
  target: BattleCardRuntimeState;
  guardian: BattleCardRuntimeState;
  attackAction: ReturnType<typeof listAttackActions>[number];
} {
  const target = moveCardToBattlefield(runtime, 'player', 'unit_elf_archer_001', 'player:FC');
  const guardian = moveCardToBattlefield(
    runtime,
    'player',
    'unit_elf_guardian_001',
    guardianSlotId,
  );
  const attacker = moveCardToBattlefield(runtime, 'enemy', 'unit_dark_archer_001', 'enemy:FC');
  runtime.currentSide = 'enemy';
  runtime.phase = 'ATTACK';
  const attackAction = listAttackActions(runtime, 'enemy').find(
    (candidate) =>
      candidate.attackerInstanceId === attacker.card.instance.instanceId &&
      candidate.targetInstanceId === target.card.instance.instanceId,
  );
  if (!attackAction) {
    throw new Error('Expected a legal attack action against the block target');
  }

  return {
    attacker,
    target,
    guardian,
    attackAction,
  };
}

function moveCardToHand(
  runtime: BattleRuntimeState,
  side: BattleSide,
  definitionId: string,
): BattleCardRuntimeState {
  const participant = side === 'player' ? runtime.player : runtime.enemy;
  const card = findParticipantCardByDefinitionId(runtime, side, definitionId);

  removeCardFromRuntimeCollections(runtime, card);
  card.zone = 'HAND';
  card.battlefieldSlot = null;
  card.enteredBattlefieldTurnNumber = null;
  card.handIndex = participant.hand.length;
  card.deckIndex = null;
  participant.hand.push(card);
  reindexTestHand(participant.hand);
  reindexTestDeck(participant.deck);

  return card;
}

function moveCardToBattlefield(
  runtime: BattleRuntimeState,
  side: BattleSide,
  definitionId: string,
  slotId: BattleSlotId,
  enteredBattlefieldTurnNumber = Math.max(1, runtime.turnNumber - 1),
): BattleCardRuntimeState {
  const participant = side === 'player' ? runtime.player : runtime.enemy;
  const card = findParticipantCardByDefinitionId(runtime, side, definitionId);

  removeCardFromRuntimeCollections(runtime, card);
  card.zone = 'BATTLEFIELD';
  card.battlefieldSlot = slotId;
  card.enteredBattlefieldTurnNumber = enteredBattlefieldTurnNumber;
  card.handIndex = null;
  card.deckIndex = null;
  runtime.battlefield.push(card);
  reindexTestHand(participant.hand);
  reindexTestDeck(participant.deck);

  return card;
}

function findParticipantCardByDefinitionId(
  runtime: BattleRuntimeState,
  side: BattleSide,
  definitionId: string,
): BattleCardRuntimeState {
  const participant = side === 'player' ? runtime.player : runtime.enemy;
  const card = [
    participant.leader,
    ...participant.hand,
    ...participant.deck,
    ...participant.drop,
    ...participant.exile,
    ...runtime.battlefield.filter((entry) => entry.side === side),
  ].find((entry) => entry.card.definition.id === definitionId);
  if (!card) {
    throw new Error(`Missing ${side} card definitionId: ${definitionId}`);
  }

  return card;
}

function removeCardFromRuntimeCollections(
  runtime: BattleRuntimeState,
  card: BattleCardRuntimeState,
): void {
  const participant = card.side === 'player' ? runtime.player : runtime.enemy;
  participant.hand = participant.hand.filter((entry) => entry !== card);
  participant.deck = participant.deck.filter((entry) => entry !== card);
  participant.drop = participant.drop.filter((entry) => entry !== card);
  participant.exile = participant.exile.filter((entry) => entry !== card);
  runtime.battlefield = runtime.battlefield.filter((entry) => entry !== card);
  runtime.drop = runtime.drop.filter((entry) => entry !== card);
  runtime.exile = runtime.exile.filter((entry) => entry !== card);
}

function reindexTestHand(cards: BattleCardRuntimeState[]): void {
  cards.forEach((card, index) => {
    card.handIndex = index;
  });
}

function reindexTestDeck(cards: BattleCardRuntimeState[]): void {
  cards.forEach((card, index) => {
    card.deckIndex = index;
  });
}

function placeHandCardOnBattlefield(
  runtime: BattleRuntimeState,
  side: BattleSide,
  handIndex: number,
  slotId: BattleSlotId,
): BattleCardRuntimeState {
  const participant = side === 'player' ? runtime.player : runtime.enemy;
  const card = participant.hand[handIndex];
  if (!card) {
    throw new Error(`Missing ${side} hand card at index ${handIndex}`);
  }

  participant.hand.splice(handIndex, 1);
  card.zone = 'BATTLEFIELD';
  card.battlefieldSlot = slotId;
  card.enteredBattlefieldTurnNumber = Math.max(1, runtime.turnNumber - 1);
  card.handIndex = null;
  runtime.battlefield.push(card);
  participant.hand.forEach((entry, index) => {
    entry.handIndex = index;
  });

  return card;
}

function moveEnemyDeckCardsToBattlefield(
  runtime: BattleRuntimeState,
  count: number,
  slotId: BattleSlotId,
): void {
  for (let index = 0; index < count; index += 1) {
    const card = runtime.enemy.deck.shift();
    if (!card) {
      throw new Error(`Missing enemy deck card ${index}`);
    }

    card.zone = 'BATTLEFIELD';
    card.battlefieldSlot = slotId;
    card.enteredBattlefieldTurnNumber = Math.max(1, runtime.turnNumber - 1);
    card.handIndex = null;
    card.deckIndex = null;
    runtime.battlefield.push(card);
  }

  runtime.enemy.deck.forEach((card, index) => {
    card.deckIndex = index;
  });
}
