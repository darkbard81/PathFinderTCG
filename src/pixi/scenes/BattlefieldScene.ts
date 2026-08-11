import { Assets, Container, Graphics, Sprite, type Texture, type Ticker } from 'pixi.js';
import { toCardDetail } from '../../dom/screens/card-detail';
import { toBattleCardTile } from '../battle/battle-card-tile';
import {
  BATTLE_ROW_IDS,
  listRowSlotIds,
  resolveBattleBoardMetrics,
  type BattleRowId,
} from '../../dom/screens/battlefield-layout';
import { formatBattleTurnEvents, readCardName } from '../battle/battle-log';
import {
  createBattlefieldView,
  type BattlefieldView,
  type BattleBlockPromptModel,
  type BattleDragSource,
  type BattleHandCardModel,
  type BattleResultModel,
  type BattleSideModel,
  type BattleSkillBadgeModel,
  type BattleSlotModel,
} from '../../dom/screens/battlefield-view';
import type { CardTile } from '../../dom/screens/card-tile';
import { ACTIVE_SKILL_DEFINITIONS } from '../../game/battle/ability-handlers';
import {
  applyActiveSkillAction,
  applyAttackAction,
  applyAutoTurnEndIfStalled,
  applyBlockAction,
  applyMoveAction,
  applyPlaceAction,
  applyTurnEnd,
  calculateSlotDominance,
  findBattlefieldCardAtSlot,
  listActiveSkillActions,
  listAttackActions,
  listBlockActions,
  listMoveActions,
  listPlaceActions,
  stepAutomatedTurn,
} from '../../game/battle/battle-engine';
import { createInitialBattleRuntime } from '../../game/battle/create-battle-runtime';
import type {
  ActiveSkillBattleEffect,
  BattleBlockDecision,
  BattleCardRuntimeState,
  BattlePhase,
  BattleParticipantRuntimeState,
  BattleRuntimeState,
  BattleSlotId,
  BattleTurnEvent,
} from '../../game/battle/types';
import {
  createGameSession,
  createSaveSlotStateFromGameSession,
  type GameSession,
} from '../../game/save/session';
import { applyStageBattleResultToSession, createStageBattleResult } from '../../game/stage/result';
import { requireStageDefinition } from '../../game/stage/stage-definitions';
import type { StageBattleResult, StageDefinition } from '../../game/stage/types';
import type { GameServices } from '../../services/game-services';
import {
  createBattleEffectsLayer,
  readBattleEffectRequest,
  toBattleEffectRequest,
  type BattleEffectKind,
  type BattleEffects,
} from '../battle/battle-effects';
import { SequenceRunner } from '../sequence/SequenceRunner';
import type { SequenceTicker, SequenceTickerFrame } from '../sequence/sequence-types';
import { UI_THEME } from '../../theme';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

const TITLE_BACKGROUND_ALIAS = 'ui.title-screen';

/** 적 행동 하나를 보여주고 다음으로 넘어가기 전까지 두는 간격이다. */
const ENEMY_STEP_DELAY_MS = 620;

/**
 * 자동으로 연달아 넘길 수 있는 턴 수의 상한이다.
 * 양측 다 둘 수가 없으면 턴이 영원히 오가므로, 그 전에 멈추고 조작을 돌려준다.
 */
const MAX_AUTO_TURN_CHAIN = 16;

const PHASE_LABELS: Record<BattlePhase, string> = {
  MAIN: '메인',
  ATTACK: '공격',
  GAME_OVER: '종료',
};

/** 스킬 배지에 찍는 한 글자다. 값과 붙여 `회2`처럼 보인다. */
const SKILL_GLYPHS: Record<ActiveSkillBattleEffect, string> = {
  HEAL: '회',
  DAMAGE: '피',
  BUFF_ATTACK: '강',
};

const SKILL_EFFECT_LABELS: Record<ActiveSkillBattleEffect, string> = {
  HEAL: '회복',
  DAMAGE: '피해',
  BUFF_ATTACK: '공격력',
};

export type BattlefieldSceneOptions = {
  services: GameServices;
  backgroundImageUrl: string;
  assetBaseUrl: string;
  session: GameSession;
  stageId: string;
  /** 전투가 끝났으면 보상까지 반영해 저장한 세션과 결과를 함께 넘긴다. */
  onLeave: (session: GameSession, result: StageBattleResult | null) => void;
  view?: BattlefieldView;
  effects?: BattleEffects;
  random?: () => number;
};

/**
 * 전장 화면이다.
 * 규칙 판정은 전부 battle-engine이 맡고, 이 Scene은 런타임 상태를 뷰 모델로 옮기고
 * 드래그 결과를 엔진 액션으로 바꿔 적용하는 일만 한다.
 * 적 차례는 한 행동씩 재생하고, 내가 둘 수 없는 턴은 자동으로 넘긴다.
 */
export class BattlefieldScene implements Scene {
  public readonly view = new Container({
    label: 'battlefield',
    eventMode: 'none',
  });
  public readonly element: HTMLElement;

  private readonly battlefieldView: BattlefieldView;
  private readonly backdrop = new Graphics({ label: 'battlefield-backdrop', eventMode: 'none' });
  private readonly stageDefinition: StageDefinition;
  private readonly runtime: BattleRuntimeState;
  /** 전투가 끝나면 한 번만 만든다. 두 번 만들면 보상 추첨이 다시 돌아 결과가 바뀐다. */
  private battleResult: StageBattleResult | null = null;
  private savedSession: GameSession;
  private savingResult = false;
  private saveError: string | null = null;
  private background: Sprite | null = null;
  private layout: ViewportLayout | null = null;
  private active = true;
  private log: string[] = [];
  /** 적 턴 도중 내 방어 선택을 기다리는 중이면 여기에 남는다. 이때 공격은 아직 적용되지 않았다. */
  private pendingBlock: { decision: BattleBlockDecision; actionCount: number } | null = null;
  /** 적 차례를 한 수씩 재생하는 중이면 true다. 이 동안에는 내 조작을 받지 않는다. */
  private playingEnemyTurn = false;
  /** 연출 캔버스는 화면에 들어온 뒤에야 만들 수 있다. 없으면 연출만 건너뛴다. */
  private effects: BattleEffects | null = null;

  /**
   * SequenceRunner에 넘길 프레임 공급원이다.
   * Scene은 Ticker 자체를 받지 않고 `update`로만 프레임을 받으므로 여기서 중계한다.
   * 화면이 라우터에서 빠지면 update가 끊겨 자연히 멈춘다.
   */
  private readonly frameCallbacks = new Set<(frame: SequenceTickerFrame) => void>();
  private readonly sequenceTicker: SequenceTicker = {
    add: (callback) => this.frameCallbacks.add(callback),
    remove: (callback) => this.frameCallbacks.delete(callback),
  };
  private readonly sequence = new SequenceRunner({
    ticker: this.sequenceTicker,
    isActive: () => this.active,
  });

  public constructor(private readonly options: BattlefieldSceneOptions) {
    this.effects = options.effects ?? null;
    this.stageDefinition = requireStageDefinition(options.stageId);
    this.savedSession = options.session;
    this.runtime = createInitialBattleRuntime(
      options.session,
      this.stageDefinition,
      options.random ?? Math.random,
    );

    this.battlefieldView =
      options.view ??
      createBattlefieldView({
        onEndTurn: () => this.endTurn(),
        onLeave: () => this.leave(),
        onBlock: (blockerInstanceId) => this.resolveBlock(blockerInstanceId),
        resolveTargets: (source) => this.resolveTargets(source),
        onDrop: (source, slotId) => this.applyDrop(source, slotId),
        onInspect: (cardInstanceId) => this.inspect(cardInstanceId),
      });

    this.element = this.battlefieldView.element;
    this.view.addChild(this.backdrop);
  }

  public async enter(): Promise<void> {
    this.active = true;
    this.renderView('전투를 시작합니다.');

    await this.ensureEffects();
    await this.ensureBackground();
    if (this.layout) {
      this.layoutBackground(this.layout);
    }

    // 첫 턴부터 둘 수 없는 배치도 있다. 시작하자마자 멈춰 있지 않게 여기서도 확인한다.
    // 화면 전환을 적 턴 한 판이 끝날 때까지 붙잡지 않도록 기다리지 않는다.
    if (this.autoEndStalledPlayerTurn()) {
      void this.advanceTurns(0);
    }
  }

  public exit(): void {
    this.active = false;
    // 대기 중인 연출을 깨워 보낸다. 남겨 두면 적 턴 재생 루프가 영원히 멈춘 채로 남는다.
    this.sequence.destroy();
    this.effects?.destroy();
    this.effects = null;
  }

  private async ensureEffects(): Promise<void> {
    if (this.effects) {
      return;
    }

    try {
      const effects = await createBattleEffectsLayer({
        host: this.battlefieldView.effectsHost,
        resolveSlotCenter: (slotId) => this.battlefieldView.getSlotCenter(slotId),
      });

      if (!this.active) {
        effects.destroy();
        return;
      }

      this.effects = effects;
      if (this.layout) {
        effects.resize(this.layout);
      }
    } catch {
      // 연출은 없어도 전투가 굴러간다. 캔버스를 못 만들면 조용히 포기한다.
      this.effects = null;
    }
  }

  public update(ticker: Ticker): void {
    for (const callback of [...this.frameCallbacks]) {
      callback(ticker);
    }
  }

  public resize(layout: ViewportLayout): void {
    this.layout = layout;
    this.layoutBackground(layout);
    this.effects?.resize(layout);
    // 카드 크기가 뷰포트에 따라 달라진다. 배율이 바뀌면 보드를 다시 그려야 한다.
    this.renderView();
  }

  /**
   * 내 턴을 끝내고 적 턴을 끝까지 돌린 뒤 다시 내 턴으로 돌아온다.
   * 적 공격을 내가 막을지 골라야 하면 그 앞에서 멈추고, 선택이 끝나면 이어서 돌린다.
   */
  private endTurn(): void {
    if (!this.canEndTurn()) {
      return;
    }

    this.appendLog(applyTurnEnd(this.runtime, 'MANUAL'));
    void this.advanceTurns(0);
  }

  /**
   * 내가 다시 둘 수 있게 될 때까지 차례를 넘긴다.
   *
   * 적 차례를 재생하고, 돌아온 내 차례에 둘 수 있는 수가 하나도 없으면 그 턴을 자동으로 넘긴다.
   * 손패가 전부 비싸고 전장도 꽉 차면 아무것도 못 하는 턴이 생기는데,
   * 그때 턴 종료를 직접 누르게 하면 무엇을 놓쳤는지 모른 채 버튼만 찾게 된다.
   */
  private async advanceTurns(initialActionCount: number): Promise<void> {
    let actionCount = initialActionCount;

    for (let guard = 0; guard < MAX_AUTO_TURN_CHAIN; guard += 1) {
      await this.runEnemyTurn(actionCount);
      if (!this.active || this.pendingBlock || this.runtime.outcome) {
        return;
      }

      if (!this.autoEndStalledPlayerTurn()) {
        return;
      }

      actionCount = 0;
    }

    // 양측 다 둘 수가 없으면 여기에 닿는다. 무한히 넘기지 않고 조작을 돌려준다.
    this.renderView('양측 모두 둘 수 있는 수가 없습니다.', true);
  }

  /**
   * 런타임을 건드린 뒤 화면을 갱신한다.
   * 승패가 났는지 확인하는 유일한 지점이라, 어떤 경로로 끝나든 결과 처리가 한 번은 지나간다.
   */
  private commit(status = '', statusIsError = false): void {
    this.finishBattleIfOver();
    this.renderView(status, statusIsError);
  }

  /** 승패가 났으면 결과를 만들고 저장을 시작한다. 이미 만들었으면 아무것도 하지 않는다. */
  private finishBattleIfOver(): void {
    if (this.battleResult || !this.runtime.outcome) {
      return;
    }

    this.battleResult = createStageBattleResult(this.runtime, this.stageDefinition);
    void this.persistResult(this.battleResult);
  }

  /**
   * 보상과 참여 EXP를 세션에 반영해 저장한다.
   * 저장이 끝나기 전에는 돌아가기를 막는다. 저장 전 세션으로 Stage에 돌아가면 보상이 사라진다.
   */
  private async persistResult(result: StageBattleResult): Promise<void> {
    this.savingResult = true;
    this.saveError = null;
    this.renderView();

    try {
      const savedState = await this.options.services.saveSlots.save(
        createSaveSlotStateFromGameSession(
          applyStageBattleResultToSession(this.options.session, result),
        ),
      );

      if (!this.active) {
        return;
      }

      this.savedSession = createGameSession(savedState);
      this.savingResult = false;
    } catch (error: unknown) {
      if (!this.active) {
        return;
      }

      this.savingResult = false;
      this.saveError = error instanceof Error ? error.message : String(error);
    }

    this.renderView();
  }

  /** Stage로 돌아간다. 결과 저장 중에는 막는다. */
  private leave(): void {
    if (this.savingResult) {
      return;
    }

    this.options.onLeave(this.savedSession, this.battleResult);
  }

  /** 내 차례에 둘 수 있는 수가 없으면 턴을 넘긴다. 넘겼으면 true다. */
  private autoEndStalledPlayerTurn(): boolean {
    if (this.runtime.currentSide !== 'player' || this.runtime.phase === 'GAME_OVER') {
      return false;
    }

    const events: BattleTurnEvent[] = [];
    if (!applyAutoTurnEndIfStalled(this.runtime, events)) {
      return false;
    }

    this.appendLog(events);
    this.renderView('둘 수 있는 수가 없어 턴을 넘겼습니다.');
    return true;
  }

  /**
   * 적 자동 턴을 한 행동씩 보여준다.
   * 판정은 `stepAutomatedTurn`이 그대로 하고, 이 메서드는 사이에 간격만 넣는다.
   * 방어 선택이 필요한 공격 앞에서 멈추면 선택이 끝난 뒤 이어서 재생한다.
   */
  private async runEnemyTurn(initialActionCount: number): Promise<void> {
    if (this.runtime.currentSide !== 'enemy' || this.runtime.phase === 'GAME_OVER') {
      return;
    }

    this.playingEnemyTurn = true;
    this.renderView('적이 움직입니다...');
    let actionCount = initialActionCount;

    for (;;) {
      const step = stepAutomatedTurn(this.runtime, 'enemy', {
        interruptForBlockSide: 'player',
        initialActionCount: actionCount,
      });
      actionCount = step.actionCount;
      this.appendLog(step.events);

      if (step.blockDecision) {
        this.pendingBlock = { decision: step.blockDecision, actionCount };
        this.playingEnemyTurn = false;
        this.renderView('적의 공격을 막을지 고르세요.');
        return;
      }

      this.commit('적이 움직입니다...');
      if (step.finished) {
        break;
      }

      await this.playStepFeedback(step.events);
      if (!this.active) {
        return;
      }
    }

    this.playingEnemyTurn = false;
    this.commit(this.runtime.outcome ? '' : '내 차례입니다.');
  }

  /**
   * 적 행동 하나를 읽을 시간을 준다.
   * 연출이 나가면 그 길이가 곧 간격이다. 연출과 고정 간격을 겹치면 한 수가 너무 길어진다.
   */
  private async playStepFeedback(events: readonly BattleTurnEvent[]): Promise<void> {
    const request = readBattleEffectRequest(events);
    if (request && this.effects) {
      await this.effects.play(request);
      return;
    }

    await this.wait(ENEMY_STEP_DELAY_MS);
  }

  private wait(durationMs: number): Promise<void> {
    return this.sequence
      .createSequence()
      .add({ timer: 0, duration: durationMs, action: 'wait' })
      .play();
  }

  /** 내 행동의 연출이다. 기다리지 않는다. 내 조작은 곧바로 이어질 수 있어야 한다. */
  private playEffect(kind: BattleEffectKind, slotId: BattleSlotId, value: number): void {
    void this.effects?.play({ kind, slotId, value });
  }

  private playEffectFor(action: Parameters<typeof toBattleEffectRequest>[0]): void {
    const request = toBattleEffectRequest(action);
    if (request) {
      void this.effects?.play(request);
    }
  }

  /** 방어 선택 결과를 적용한다. 막지 않기를 고르면 원래 공격이 그대로 들어온다. */
  private resolveBlock(blockerInstanceId: string | null): void {
    const pending = this.pendingBlock;
    if (!pending) {
      return;
    }

    const blockAction =
      blockerInstanceId === null
        ? null
        : (pending.decision.blockActions.find(
            (action) => action.blockerInstanceId === blockerInstanceId,
          ) ?? null);

    this.pendingBlock = null;
    try {
      if (blockAction) {
        applyBlockAction(this.runtime, blockAction);
      } else {
        applyAttackAction(this.runtime, pending.decision.attackAction);
      }
    } catch (error: unknown) {
      this.renderView(error instanceof Error ? error.message : String(error), true);
      return;
    }

    this.appendLog([{ type: 'ACTION', side: 'enemy', action: pending.decision.attackAction }]);
    this.commit(blockAction ? '공격을 막았습니다.' : '공격을 그대로 받았습니다.');
    // 막았다면 피해는 원래 대상이 아니라 막은 유닛이 받는다. 연출도 그 칸에서 나야 한다.
    this.playEffect(
      'damage',
      blockAction ? blockAction.blockerSlotId : pending.decision.attackAction.toSlotId,
      pending.decision.attackAction.attack,
    );
    // 멈춘 공격도 한 번의 행동이다. 이어서 돌릴 때 행동 제한 계산이 어긋나지 않게 1을 더한다.
    void this.advanceTurns(pending.actionCount + 1);
  }

  /** 내가 카드를 움직일 수 있는 상태인지다. 턴 종료 조건과 같다. */
  private canAct(): boolean {
    return (
      this.runtime.phase !== 'GAME_OVER' &&
      this.runtime.currentSide === 'player' &&
      this.pendingBlock === null &&
      !this.playingEnemyTurn
    );
  }

  private canEndTurn(): boolean {
    return this.canAct();
  }

  private appendLog(events: readonly BattleTurnEvent[]): void {
    this.log = [...this.log, ...formatBattleTurnEvents(this.runtime, events)];
  }

  /**
   * 집은 것을 놓을 수 있는 칸 목록이다. 드래그를 시작할 때 강조할 칸이기도 하다.
   * 이동 대상은 빈 칸, 공격 대상은 적이 선 칸이라 둘은 절대 겹치지 않는다.
   */
  private resolveTargets(source: BattleDragSource): BattleSlotId[] {
    // 적 차례 재생이나 방어 선택 중에는 아무것도 집히지 않게 빈 목록을 낸다.
    if (!this.canAct()) {
      return [];
    }

    if (source.kind === 'hand') {
      return listPlaceActions(this.runtime, 'player')
        .filter((action) => action.cardInstanceId === source.cardInstanceId)
        .map((action) => action.toSlotId);
    }

    if (source.kind === 'skill') {
      return this.listSkillActions(source.cardInstanceId, source.skillId).map(
        (action) => action.targetSlotId,
      );
    }

    return [
      ...listMoveActions(this.runtime, 'player')
        .filter((action) => action.cardInstanceId === source.cardInstanceId)
        .map((action) => action.toSlotId),
      ...listAttackActions(this.runtime, 'player')
        .filter((action) => action.attackerInstanceId === source.cardInstanceId)
        .map((action) => action.toSlotId),
    ];
  }

  private applyDrop(source: BattleDragSource, slotId: BattleSlotId): void {
    if (!this.canAct()) {
      return;
    }

    try {
      const message = this.executeDrop(source, slotId);
      if (message === null) {
        // 드래그를 시작한 뒤 상태가 바뀌면 여기에 온다. 규칙 판정은 엔진에만 두고 조용히 되돌린다.
        this.renderView('지금은 그렇게 할 수 없습니다.', true);
        return;
      }

      this.log = [...this.log, `나: ${message}`];
      this.commit(message);
      // 방금 수로 둘 것이 다 떨어졌을 수 있다. 그러면 여기서 바로 턴이 넘어간다.
      void this.advanceTurns(0);
    } catch (error: unknown) {
      this.renderView(error instanceof Error ? error.message : String(error), true);
    }
  }

  /** 실제로 액션을 적용하고 상태 문구를 돌려준다. 맞는 액션이 없으면 null이다. */
  private executeDrop(source: BattleDragSource, slotId: BattleSlotId): string | null {
    if (source.kind === 'hand') {
      const action = listPlaceActions(this.runtime, 'player').find(
        (candidate) =>
          candidate.cardInstanceId === source.cardInstanceId && candidate.toSlotId === slotId,
      );
      if (!action) {
        return null;
      }

      applyPlaceAction(this.runtime, action);
      return `${action.cost} 코스트 카드를 배치했습니다.`;
    }

    if (source.kind === 'skill') {
      const action = this.listSkillActions(source.cardInstanceId, source.skillId).find(
        (candidate) => candidate.targetSlotId === slotId,
      );
      if (!action) {
        return null;
      }

      applyActiveSkillAction(this.runtime, action);
      this.playEffectFor(action);
      return `${SKILL_EFFECT_LABELS[action.effect]} ${action.value}을(를) 적용했습니다.`;
    }

    const moveAction = listMoveActions(this.runtime, 'player').find(
      (candidate) =>
        candidate.cardInstanceId === source.cardInstanceId && candidate.toSlotId === slotId,
    );
    if (moveAction) {
      applyMoveAction(this.runtime, moveAction);
      return '카드를 이동했습니다.';
    }

    const attackAction = listAttackActions(this.runtime, 'player').find(
      (candidate) =>
        candidate.attackerInstanceId === source.cardInstanceId && candidate.toSlotId === slotId,
    );
    if (!attackAction) {
      return null;
    }

    // 방어 측 선택은 적이 한다. 막을 수 있으면 막는 것이 가디언 능력의 목적이라 항상 막게 한다.
    const [blockAction] = listBlockActions(this.runtime, attackAction);
    if (blockAction) {
      applyBlockAction(this.runtime, blockAction);
      // 막았으면 피해는 막은 유닛이 받는다. 연출도 그 칸에서 나야 한다.
      this.playEffect('damage', blockAction.blockerSlotId, attackAction.attack);
      return `공격을 ${attackAction.attack} 피해로 선언했지만 적이 막았습니다.`;
    }

    applyAttackAction(this.runtime, attackAction);
    this.playEffectFor(attackAction);
    return `${attackAction.attack} 피해로 공격했습니다.`;
  }

  private listSkillActions(cardInstanceId: string, skillId: string) {
    return listActiveSkillActions(this.runtime, 'player').filter(
      (action) => action.cardInstanceId === cardInstanceId && action.skillId === skillId,
    );
  }

  private renderView(status = '', statusIsError = false): void {
    const layout = this.layout ?? { width: 1024, height: 768, scale: 1 };

    this.battlefieldView.render({
      metrics: resolveBattleBoardMetrics(layout),
      stageName: this.stageDefinition.name,
      turnNumber: this.runtime.turnNumber,
      currentSide: this.runtime.currentSide,
      phaseLabel: PHASE_LABELS[this.runtime.phase],
      enemy: {
        ...this.readPiles(this.runtime.enemy),
        handCount: this.runtime.enemy.hand.length,
      },
      player: this.readPiles(this.runtime.player),
      slots: this.buildSlotModels(),
      hand: this.buildHandModels(),
      status,
      statusIsError,
      canEndTurn: this.canEndTurn(),
      log: this.log,
      blockPrompt: this.buildBlockPrompt(),
      result: this.buildResult(),
    });
  }

  private buildBlockPrompt(): BattleBlockPromptModel | null {
    if (!this.pendingBlock) {
      return null;
    }

    const { attackAction, blockActions } = this.pendingBlock.decision;
    const attacker = readCardName(this.runtime, attackAction.attackerInstanceId);
    const target = readCardName(this.runtime, attackAction.targetInstanceId);

    return {
      message: `${attacker}이(가) ${target}을(를) ${attackAction.attack} 피해로 공격합니다. 대신 맞을 유닛을 고를 수 있습니다.`,
      blockers: blockActions.map((action) => ({
        instanceId: action.blockerInstanceId,
        label: `${readCardName(this.runtime, action.blockerInstanceId)}이(가) 막는다`,
      })),
    };
  }

  private buildResult(): BattleResultModel | null {
    const result = this.battleResult;
    if (!result) {
      return null;
    }

    const isWin = result.outcome === 'WIN';
    const lines = [
      isWin
        ? `${this.stageDefinition.name}을(를) ${result.turnNumber}라운드에 돌파했습니다.`
        : `${this.stageDefinition.name}에서 리더를 잃었습니다.`,
      `보상: ${result.rewardCardNames.length === 0 ? '없음' : result.rewardCardNames.join(', ')}`,
      `성장: ${
        result.growth.cardInstanceIds.length === 0 || result.growth.expPerCard <= 0
          ? '없음'
          : `참여한 ${result.growth.cardInstanceIds.length}장에 +${result.growth.expPerCard} EXP`
      }`,
      this.savingResult ? '결과를 저장하는 중입니다...' : null,
      this.saveError === null ? null : `저장에 실패했습니다: ${this.saveError}`,
    ];

    return {
      title: isWin ? '승리' : '패배',
      body: lines.filter((line): line is string => line !== null).join('\n'),
      isWin,
      busy: this.savingResult,
    };
  }

  /**
   * 더미 수치와 맨 위 카드를 읽는다.
   * drop과 exile은 뒤에 붙이므로 마지막 원소가 가장 나중에 들어간 카드다.
   */
  private readPiles(participant: BattleParticipantRuntimeState): BattleSideModel {
    const dropTop = participant.drop.at(-1);
    const exileTop = participant.exile.at(-1);

    return {
      deckCount: participant.deck.length,
      dropCount: participant.drop.length,
      exileCount: participant.exile.length,
      dropTop: dropTop ? this.toTile(dropTop) : null,
      exileTop: exileTop ? this.toTile(exileTop) : null,
    };
  }

  private buildSlotModels(): Record<BattleRowId, BattleSlotModel[]> {
    const canAct = this.canAct();
    // 행동이 남은 카드를 미리 모아 둔다. 칸마다 후보를 다시 계산하면 12번 반복된다.
    const movableCardIds = new Set(
      listMoveActions(this.runtime, 'player').map((action) => action.cardInstanceId),
    );
    const attackerCardIds = new Set(
      listAttackActions(this.runtime, 'player').map((action) => action.attackerInstanceId),
    );
    const skillActions = listActiveSkillActions(this.runtime, 'player');

    return Object.fromEntries(
      BATTLE_ROW_IDS.map((row) => [
        row,
        listRowSlotIds(row).map((slotId): BattleSlotModel => {
          const card = findBattlefieldCardAtSlot(this.runtime, slotId);
          if (!card) {
            return {
              slotId,
              card: null,
              // 빈 칸에만 인접 지배력을 적는다. 무엇을 놓을 수 있는지 집기 전에 읽게 하는 값이다.
              dominance: calculateSlotDominance(this.runtime, slotId),
              ready: null,
              skills: [],
            };
          }

          const instanceId = card.card.instance.instanceId;
          if (card.side !== 'player') {
            return { slotId, card: this.toTile(card), dominance: null, ready: null, skills: [] };
          }

          const skills = this.buildSkillBadges(
            card,
            new Set(
              skillActions
                .filter((action) => action.cardInstanceId === instanceId)
                .map((action) => action.skillId),
            ),
          );

          return {
            slotId,
            card: this.toTile(card),
            dominance: null,
            // 내 차례가 아니면 소진 여부를 판정하지 않는다. 적 턴 내내 내 카드가 회색이 되면 산만하다.
            ready: canAct
              ? // 스킬만 남은 카드도 아직 할 일이 있다. 셋 중 하나라도 남았으면 소진으로 그리지 않는다.
                movableCardIds.has(instanceId) ||
                attackerCardIds.has(instanceId) ||
                skills.length > 0
              : null,
            skills,
          };
        }),
      ]),
    ) as Record<BattleRowId, BattleSlotModel[]>;
  }

  /** 지금 쓸 수 있는 대상이 하나라도 있는 스킬만 배지로 만든다. 눌러도 안 되는 배지는 띄우지 않는다. */
  private buildSkillBadges(
    card: BattleCardRuntimeState,
    usableSkillIds: ReadonlySet<string>,
  ): BattleSkillBadgeModel[] {
    return card.card.definition.abilities.flatMap((ability): BattleSkillBadgeModel[] => {
      const definition = ACTIVE_SKILL_DEFINITIONS[ability.id];
      if (!definition || !usableSkillIds.has(ability.id)) {
        return [];
      }

      return [
        {
          skillId: ability.id,
          glyph: `${SKILL_GLYPHS[definition.effect]}${definition.value}`,
          effect: definition.effect,
          label: `${ability.name} · ${SKILL_EFFECT_LABELS[definition.effect]} ${definition.value} · 끌어서 대상 지정`,
        },
      ];
    });
  }

  private buildHandModels(): BattleHandCardModel[] {
    // 놓을 곳이 있는 카드를 한 번에 모아 둔다. 카드마다 후보를 다시 계산하면 손패 길이만큼 반복된다.
    const placeableCardIds = new Set(
      listPlaceActions(this.runtime, 'player').map((action) => action.cardInstanceId),
    );

    return [...this.runtime.player.hand]
      .sort((left, right) => (left.handIndex ?? 0) - (right.handIndex ?? 0))
      .map((card) => ({
        tile: this.toTile(card),
        playable: placeableCardIds.has(card.card.instance.instanceId),
      }));
  }

  /**
   * 길게 누르기·우클릭으로 연 카드를 떠 있는 상세 패널에 싣는다.
   * 전장·손패·더미 어디에 있든 찾을 수 있도록 양 진영의 통을 모두 훑는다.
   */
  private inspect(cardInstanceId: string): void {
    const found = [
      ...this.runtime.battlefield,
      ...this.runtime.player.hand,
      ...this.runtime.enemy.hand,
      ...this.runtime.drop,
      ...this.runtime.exile,
      this.runtime.player.leader,
      this.runtime.enemy.leader,
    ].find((entry) => entry.card.instance.instanceId === cardInstanceId);

    this.battlefieldView.showDetail(
      found ? toCardDetail(found.card, this.options.assetBaseUrl) : null,
    );
  }

  private toTile(card: Parameters<typeof toBattleCardTile>[1]): CardTile {
    return toBattleCardTile(this.runtime, card, this.options.assetBaseUrl);
  }

  private async ensureBackground(): Promise<void> {
    if (this.background) {
      return;
    }

    try {
      const texture = (await Assets.load({
        alias: TITLE_BACKGROUND_ALIAS,
        src: this.options.backgroundImageUrl,
      })) as Texture;

      if (!this.active) {
        return;
      }

      this.background = new Sprite({
        texture,
        label: 'title-background',
        eventMode: 'none',
      });
      this.view.addChildAt(this.background, 0);
    } catch {
      this.background = null;
    }
  }

  private layoutBackground(layout: ViewportLayout): void {
    if (this.background) {
      this.background.width = layout.width;
      this.background.height = layout.height;
    }

    const { screenDim } = UI_THEME.surfaces;

    this.backdrop
      .clear()
      .rect(0, 0, layout.width, layout.height)
      .fill({ color: screenDim.fill.canvas, alpha: screenDim.fillAlpha });
  }
}
