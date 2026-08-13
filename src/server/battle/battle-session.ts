import type { BattleCommand, BattlePublicState, BattleUpdate } from '../../game/battle/protocol';
import type {
  ActiveSkillBattleAction,
  AttackBattleAction,
  BattleBlockDecision,
  BattleRuntimeState,
  BattleTurnEvent,
} from '../../game/battle/types';
import type { GameSession } from '../../game/save/session';
import type { SaveSlotId, SaveSlotState } from '../../game/save/types';
import { createStageBattleResult } from '../../game/stage/result';
import type {
  StageBattleResult,
  StageDefinition,
  StageEnemyDeckDefinition,
} from '../../game/stage/types';
import {
  applyActiveSkillAction,
  applyAttackAction,
  applyAutoTurnEndIfStalled,
  applyBlockAction,
  applyMoveAction,
  applyPlaceAction,
  applyTurnEnd,
  listActiveSkillActions,
  listAttackActions,
  listBlockActions,
  listMoveActions,
  listPlaceActions,
  stepAutomatedTurn,
} from './battle-engine';
import { toBattleEffectRequests } from './battle-effect-request';
import { collectEventCardNames, projectBattleState } from './battle-projection';
import { createInitialBattleRuntime } from './create-battle-runtime';

/**
 * 자동으로 연달아 넘길 수 있는 턴 수의 상한이다.
 * 양측 다 둘 수가 없으면 턴이 영원히 오가므로, 그 전에 멈추고 조작을 돌려준다.
 */
const MAX_AUTO_TURN_CHAIN = 16;

/** 클라이언트가 보낸 명령을 지금 상태에서 받을 수 없을 때 던진다. HTTP 409로 나간다. */
export class BattleCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BattleCommandError';
  }
}

export type BattleSessionOptions = {
  battleId: string;
  session: GameSession;
  stageDefinition: StageDefinition;
  enemyDeck: StageEnemyDeckDefinition;
  random?: (() => number) | undefined;
  /**
   * 이미 만들어 둔 런타임으로 시작한다.
   * 테스트가 판을 세워 두고 그 상태부터 돌리려고 쓴다. 실서비스는 넣지 않는다.
   */
  runtime?: BattleRuntimeState | undefined;
};

/**
 * 전투 한 판의 authoritative 상태다.
 *
 * `BattleRuntimeState`는 여기에만 있다. 클라이언트는 행동 의도만 보내고,
 * 이 클래스가 지금 상태에서 그 행동이 합법인지 다시 계산해 확정된 결과만 돌려준다.
 * 브라우저가 보낸 HP·턴·필드 값은 어디에서도 읽지 않는다.
 */
export class BattleSession {
  private readonly runtime: BattleRuntimeState;
  private readonly random: () => number;
  /** 방어 선택을 기다리는 중이면 남는다. 이때 공격은 아직 적용되지 않았다. */
  private pendingBlock: BattleBlockDecision | null = null;
  /** 자동 턴이 지금까지 몇 번 움직였는지다. 행동 제한 판정에 쓴다. */
  private automationActionCount = 0;
  private automationPending = false;
  private automationChain = 0;
  private automationStalled = false;
  /** 전투가 끝나면 한 번만 만든다. 두 번 만들면 보상 추첨이 다시 돌아 결과가 바뀐다. */
  private result: StageBattleResult | null = null;
  /** 결과를 아직 저장 슬롯에 반영하지 못했으면 true다. 반영에 성공할 때까지 남는다. */
  private resultPendingSave = false;
  private savedState: SaveSlotState | null = null;
  private saveError: string | null = null;

  public constructor(private readonly options: BattleSessionOptions) {
    this.random = options.random ?? Math.random;
    this.runtime =
      options.runtime ??
      createInitialBattleRuntime({
        session: options.session,
        enemyDeck: options.enemyDeck,
        random: this.random,
      });
  }

  public get battleId(): string {
    return this.options.battleId;
  }

  /** 결과를 반영할 저장 슬롯이다. 전투를 연 그 슬롯이다. */
  public get slotId(): SaveSlotId {
    return this.options.session.slotId;
  }

  /**
   * 아직 저장 슬롯에 반영하지 못한 결과를 돌려준다.
   *
   * 반영은 디스크를 만지는 일이라 이 클래스가 하지 않는다. 호출자가 반영한 뒤 결과를 알려 준다.
   * 실패하면 계속 남아 다음 요청에서 다시 시도한다.
   */
  public readUnsavedResult(): StageBattleResult | null {
    return this.resultPendingSave ? this.result : null;
  }

  /** 저장 슬롯 반영이 끝났음을 알린다. 저장된 상태는 공개 상태에 실려 브라우저로 간다. */
  public completeResultSave(savedState: SaveSlotState): void {
    this.resultPendingSave = false;
    this.savedState = savedState;
    this.saveError = null;
  }

  /** 저장 슬롯 반영이 실패했음을 알린다. 다음 요청에서 다시 시도한다. */
  public failResultSave(message: string): void {
    this.saveError = message;
  }

  /** 전투를 시작하고 첫 상태를 만든다. 첫 턴부터 둘 수 없는 배치면 여기서 바로 턴을 넘긴다. */
  public start(): BattleUpdate {
    const events: BattleTurnEvent[] = [];
    // 적 차례부터 시작하는 판도 있다. 그때는 열자마자 자동 진행이 붙어야 한다.
    if (this.runtime.currentSide === 'enemy' || this.autoEndStalledPlayerTurn(events)) {
      this.beginAutomation();
    }

    return this.toUpdate(events);
  }

  public get state(): BattlePublicState {
    return this.projectState();
  }

  /**
   * 행동 의도 하나를 처리한다.
   * 합법성은 언제나 지금 런타임에서 다시 계산하며, 맞는 합법 행동이 없으면 아무 상태도 바꾸지 않는다.
   */
  public apply(command: BattleCommand): BattleUpdate {
    const events: BattleTurnEvent[] = [];

    if (command.type === 'ADVANCE') {
      this.advance(events);
      return this.toUpdate(events);
    }

    if (command.type === 'RESOLVE_BLOCK') {
      this.resolveBlock(command.blockerInstanceId, events);
      return this.toUpdate(events);
    }

    this.requirePlayerTurn();

    if (command.type === 'END_TURN') {
      events.push(...applyTurnEnd(this.runtime, 'MANUAL'));
      this.beginAutomation();
      return this.toUpdate(events);
    }

    this.applyPlayerAction(command, events);
    // 방금 수로 둘 것이 다 떨어졌을 수 있다. 그러면 여기서 바로 턴이 넘어간다.
    if (this.autoEndStalledPlayerTurn(events)) {
      this.beginAutomation();
    }

    return this.toUpdate(events);
  }

  private applyPlayerAction(
    command: Exclude<BattleCommand, { type: 'ADVANCE' | 'RESOLVE_BLOCK' | 'END_TURN' }>,
    events: BattleTurnEvent[],
  ): void {
    if (command.type === 'PLACE') {
      const action = listPlaceActions(this.runtime, 'player').find(
        (candidate) =>
          candidate.cardInstanceId === command.cardInstanceId &&
          candidate.toSlotId === command.toSlotId,
      );
      if (!action) {
        throw new BattleCommandError('지금은 그 카드를 그 칸에 낼 수 없습니다.');
      }

      applyPlaceAction(this.runtime, action);
      events.push({ type: 'ACTION', side: 'player', action });
      return;
    }

    if (command.type === 'MOVE') {
      const action = listMoveActions(this.runtime, 'player').find(
        (candidate) =>
          candidate.cardInstanceId === command.cardInstanceId &&
          candidate.toSlotId === command.toSlotId,
      );
      if (!action) {
        throw new BattleCommandError('지금은 그 카드를 그 칸으로 옮길 수 없습니다.');
      }

      applyMoveAction(this.runtime, action);
      events.push({ type: 'ACTION', side: 'player', action });
      return;
    }

    if (command.type === 'ACTIVE_SKILL') {
      const action = listActiveSkillActions(this.runtime, 'player').find(
        (candidate) =>
          candidate.cardInstanceId === command.cardInstanceId &&
          candidate.skillId === command.skillId &&
          candidate.targetSlotId === command.targetSlotId,
      );
      if (!action) {
        throw new BattleCommandError('지금은 그 스킬을 그 대상에게 쓸 수 없습니다.');
      }

      this.applyActiveSkill(action, events);
      return;
    }

    const action = listAttackActions(this.runtime, 'player').find(
      (candidate) =>
        candidate.attackerInstanceId === command.attackerInstanceId &&
        candidate.toSlotId === command.toSlotId,
    );
    if (!action) {
      throw new BattleCommandError('지금은 그 칸을 칠 수 없습니다.');
    }

    this.applyPlayerAttack(action, events);
  }

  private applyActiveSkill(action: ActiveSkillBattleAction, events: BattleTurnEvent[]): void {
    applyActiveSkillAction(this.runtime, action);
    events.push({ type: 'ACTIVE_SKILL', side: 'player', action });
  }

  /** 방어 측 선택은 적이 한다. 막을 수 있으면 막는 것이 가디언 능력의 목적이라 항상 막게 한다. */
  private applyPlayerAttack(action: AttackBattleAction, events: BattleTurnEvent[]): void {
    const [blockAction] = listBlockActions(this.runtime, action);
    if (blockAction) {
      applyBlockAction(this.runtime, blockAction);
      events.push(
        { type: 'ACTION', side: 'player', action },
        { type: 'BLOCK', side: 'enemy', action: blockAction },
      );
      return;
    }

    applyAttackAction(this.runtime, action);
    events.push({ type: 'ACTION', side: 'player', action });
  }

  /** 방어 선택 결과를 적용한다. 막지 않기를 고르면 원래 공격이 그대로 들어온다. */
  private resolveBlock(blockerInstanceId: string | null, events: BattleTurnEvent[]): void {
    const pending = this.pendingBlock;
    if (!pending) {
      throw new BattleCommandError('지금은 방어를 고를 차례가 아닙니다.');
    }

    const blockAction =
      blockerInstanceId === null
        ? null
        : (pending.blockActions.find((action) => action.blockerInstanceId === blockerInstanceId) ??
          null);
    if (blockerInstanceId !== null && !blockAction) {
      throw new BattleCommandError('그 유닛은 이 공격을 막을 수 없습니다.');
    }

    this.pendingBlock = null;
    if (blockAction) {
      applyBlockAction(this.runtime, blockAction);
      events.push(
        { type: 'ACTION', side: 'enemy', action: pending.attackAction },
        { type: 'BLOCK', side: 'player', action: blockAction },
      );
    } else {
      applyAttackAction(this.runtime, pending.attackAction);
      events.push({ type: 'ACTION', side: 'enemy', action: pending.attackAction });
    }

    // 멈춘 공격도 한 번의 행동이다. 이어서 돌릴 때 행동 제한 계산이 어긋나지 않게 1을 더한다.
    this.automationActionCount += 1;
    this.automationPending = true;
    this.automationStalled = false;
  }

  /**
   * 자동 진행을 한 걸음 옮긴다.
   *
   * 적 차례는 한 행동씩 끊어 내보낸다. 연출을 한 수씩 보여줄 수 있어야 하기 때문이다.
   * 적 차례가 끝났는데 내 차례에도 둘 수 있는 수가 없으면 그 턴도 자동으로 넘긴다.
   */
  private advance(events: BattleTurnEvent[]): void {
    if (!this.automationPending) {
      throw new BattleCommandError('지금은 자동으로 진행할 것이 없습니다.');
    }

    if (this.runtime.currentSide === 'enemy' && this.runtime.phase !== 'GAME_OVER') {
      const step = stepAutomatedTurn(this.runtime, 'enemy', {
        interruptForBlockSide: 'player',
        initialActionCount: this.automationActionCount,
      });
      this.automationActionCount = step.actionCount;
      events.push(...step.events);

      if (step.blockDecision) {
        this.pendingBlock = step.blockDecision;
        this.automationPending = false;
        return;
      }

      if (!step.finished) {
        return;
      }
    }

    if (this.runtime.phase === 'GAME_OVER') {
      this.automationPending = false;
      return;
    }

    // 적 턴이 끝났다. 돌아온 내 차례에 둘 수 있는 수가 없으면 그 턴도 넘기고 적 턴을 다시 돌린다.
    this.automationActionCount = 0;
    if (!this.autoEndStalledPlayerTurn(events)) {
      this.automationPending = false;
      this.automationChain = 0;
      return;
    }

    this.automationChain += 1;
    if (this.automationChain >= MAX_AUTO_TURN_CHAIN) {
      // 양측 다 둘 수가 없으면 여기에 닿는다. 무한히 넘기지 않고 조작을 돌려준다.
      this.automationPending = false;
      this.automationStalled = true;
      this.automationChain = 0;
    }
  }

  private beginAutomation(): void {
    this.automationActionCount = 0;
    this.automationPending = true;
    this.automationStalled = false;
  }

  /** 내 차례에 둘 수 있는 수가 없으면 턴을 넘긴다. 넘겼으면 true다. */
  private autoEndStalledPlayerTurn(events: BattleTurnEvent[]): boolean {
    if (this.runtime.currentSide !== 'player' || this.runtime.phase === 'GAME_OVER') {
      return false;
    }

    return applyAutoTurnEndIfStalled(this.runtime, events);
  }

  private requirePlayerTurn(): void {
    if (this.runtime.phase === 'GAME_OVER') {
      throw new BattleCommandError('전투가 이미 끝났습니다.');
    }
    if (this.pendingBlock) {
      throw new BattleCommandError('방어를 먼저 골라야 합니다.');
    }
    if (this.automationPending || this.runtime.currentSide !== 'player') {
      throw new BattleCommandError('지금은 내 차례가 아닙니다.');
    }
  }

  /** 승패가 났으면 결과를 만든다. 이미 만들었으면 아무것도 하지 않는다. */
  private finishBattleIfOver(): void {
    if (this.result || !this.runtime.outcome) {
      return;
    }

    this.automationPending = false;
    this.automationStalled = false;
    this.pendingBlock = null;
    // 보상 추첨은 전투 셔플과 다른 난수를 쓴다. 셔플을 고정한 테스트가 보상까지 고정하지 않게 한다.
    this.result = createStageBattleResult(this.runtime, this.options.stageDefinition);
    this.resultPendingSave = true;
  }

  private projectState(): BattlePublicState {
    return projectBattleState({
      battleId: this.options.battleId,
      stageId: this.options.stageDefinition.id,
      runtime: this.runtime,
      pendingBlock: this.pendingBlock,
      automationPending: this.automationPending,
      automationStalled: this.automationStalled,
      result: this.result,
      savedState: this.savedState,
      saveError: this.saveError,
    });
  }

  private toUpdate(events: BattleTurnEvent[]): BattleUpdate {
    this.finishBattleIfOver();

    return {
      events,
      cardNames: collectEventCardNames(this.runtime, events),
      effects: toBattleEffectRequests(events),
      state: this.projectState(),
    };
  }
}
