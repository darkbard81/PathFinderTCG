import { Assets, Container, Graphics, Sprite, type Texture, type Ticker } from 'pixi.js';
import { toCardDetail } from '../../dom/screens/card-detail';
import { toBattleCardTile } from '../battle/battle-card-tile';
import {
  BATTLE_ROW_IDS,
  listRowSlotIds,
  resolveBattleBoardMetrics,
  type BattleRowId,
} from '../../dom/screens/battlefield-layout';
import { appendBattleLogLines, formatBattleTurnEvents } from '../battle/battle-log';
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
import type {
  BattleCommand,
  BattleEffectRequest,
  BattlePublicCard,
  BattlePublicPiles,
  BattlePublicSkill,
  BattlePublicSlot,
  BattlePublicState,
  BattleService,
  BattleUpdate,
} from '../../game/battle/protocol';
import type { ActiveSkillBattleEffect, BattlePhase, BattleSlotId } from '../../game/battle/types';
import {
  createGameSession,
  createSaveSlotStateFromGameSession,
  type GameSession,
} from '../../game/save/session';
import { applyStageBattleResultToSession } from '../../game/stage/result';
import { requireStageDefinition } from '../../game/stage/stage-definitions';
import type { StageBattleResult, StageDefinition } from '../../game/stage/types';
import type { GameServices } from '../../services/game-services';
import { createBattleEffectsLayer, type BattleEffects } from '../battle/battle-effects';
import { SequenceRunner } from '../sequence/SequenceRunner';
import type { SequenceTicker, SequenceTickerFrame } from '../sequence/sequence-types';
import { UI_THEME } from '../../theme';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

const TITLE_BACKGROUND_ALIAS = 'ui.title-screen';

/** 전장 HUD에서 고를 수 있는 연출 배속이다. */
export const BATTLEFIELD_PLAYBACK_RATES = [1, 1.5, 2] as const;
export type BattlefieldPlaybackRate = (typeof BATTLEFIELD_PLAYBACK_RATES)[number];
/** 전장 연출 배속의 앱 메모리 기본값이다. */
export const DEFAULT_BATTLEFIELD_PLAYBACK_RATE: BattlefieldPlaybackRate =
  BATTLEFIELD_PLAYBACK_RATES[0];

/** HUD select와 앱 메모리에서 들어온 값이 고를 수 있는 배속인지 확인한다. */
export function isBattlefieldPlaybackRate(value: unknown): value is BattlefieldPlaybackRate {
  return BATTLEFIELD_PLAYBACK_RATES.some((rate) => rate === value);
}

/** 적 행동 하나를 보여주고 다음으로 넘어가기 전까지 두는 간격이다. */
const ENEMY_STEP_DELAY_MS = 620;

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
  /** 앱 메모리에서 이어받은 연출 배속이다. 저장 데이터에는 넣지 않는다. */
  playbackRate?: number;
  /** HUD에서 고른 배속을 다음 전투에도 쓸 수 있게 앱 메모리로 돌려준다. */
  onPlaybackRateChange?: (playbackRate: number) => void;
  /** 전투가 끝났으면 보상까지 반영해 저장한 세션과 결과를 함께 넘긴다. */
  onLeave: (session: GameSession, result: StageBattleResult | null) => void;
  view?: BattlefieldView;
  effects?: BattleEffects;
  /** 테스트가 서버 대신 같은 경계를 그대로 구현해 넣는다. */
  battleService?: BattleService;
};

/**
 * 전장 화면이다.
 *
 * 규칙 판정은 이 화면에 없다. 서버가 `BattleRuntimeState`를 갖고 합법 행동과 승패를 정하며,
 * 이 Scene은 사용자의 행동 의도를 서버로 보내고 돌려받은 상태와 이벤트로 화면과 연출만 만든다.
 * 적 차례는 한 행동씩 받아서 재생하고, 내가 둘 수 없는 턴은 서버가 알아서 넘겨 준다.
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
  private readonly battle: BattleService;
  /** 서버가 준 공개 상태다. 전투가 열리기 전에는 null이다. */
  private state: BattlePublicState | null = null;
  /** 전투가 끝나면 서버가 결과를 한 번만 만든다. 그 결과를 저장에 쓴다. */
  private battleResult: StageBattleResult | null = null;
  private savedSession: GameSession;
  private savingResult = false;
  private saveError: string | null = null;
  private background: Sprite | null = null;
  private layout: ViewportLayout | null = null;
  private active = true;
  private log: string[] = [];
  /** 적 차례를 한 수씩 재생하는 중이면 true다. 이 동안에는 내 조작을 받지 않는다. */
  private playingEnemyTurn = false;
  /** 요청이 나가 있는 동안은 조작을 막는다. 같은 수를 두 번 보내지 않기 위해서다. */
  private sending = false;
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
    this.sequence.setPlaybackRate(
      isBattlefieldPlaybackRate(options.playbackRate)
        ? options.playbackRate
        : DEFAULT_BATTLEFIELD_PLAYBACK_RATE,
    );
    this.effects = options.effects ?? null;
    this.stageDefinition = requireStageDefinition(options.stageId);
    this.savedSession = options.session;
    this.battle = options.battleService ?? options.services.battle;

    this.battlefieldView =
      options.view ??
      createBattlefieldView({
        playbackRates: BATTLEFIELD_PLAYBACK_RATES,
        onEndTurn: () => void this.endTurn(),
        onLeave: () => this.leave(),
        onPlaybackRateChange: (playbackRate) => this.setPlaybackRate(playbackRate),
        onBlock: (blockerInstanceId) => void this.resolveBlock(blockerInstanceId),
        resolveTargets: (source) => this.resolveTargets(source),
        onDrop: (source, slotId) => void this.applyDrop(source, slotId),
        onInspect: (cardInstanceId) => this.inspect(cardInstanceId),
      });

    this.element = this.battlefieldView.element;
    this.view.addChild(this.backdrop);
  }

  public async enter(): Promise<void> {
    this.active = true;
    this.renderView('전투를 여는 중입니다...');

    await this.ensureEffects();
    await this.ensureBackground();
    if (this.layout) {
      this.layoutBackground(this.layout);
    }

    await this.startBattle();
  }

  public exit(): void {
    this.active = false;
    // 대기 중인 연출을 깨워 보낸다. 남겨 두면 적 턴 재생 루프가 영원히 멈춘 채로 남는다.
    this.sequence.destroy();
    this.effects?.destroy();
    this.effects = null;
    this.closeBattle();
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

  /** 서버에 전투를 열고 첫 상태를 받는다. 첫 턴부터 둘 수 없으면 서버가 이미 턴을 넘겨 둔다. */
  private async startBattle(): Promise<void> {
    try {
      const update = await this.battle.createBattle({
        slotId: this.options.session.slotId,
        stageId: this.options.stageId,
      });
      if (!this.active) {
        return;
      }

      this.applyUpdate(update, '전투를 시작합니다.');
      // 화면 전환을 적 턴 한 판이 끝날 때까지 붙잡지 않도록 기다리지 않는다.
      void this.runAutomation();
    } catch (error: unknown) {
      if (this.active) {
        this.renderView(`전투를 열지 못했습니다: ${readErrorMessage(error)}`, true);
      }
    }
  }

  /** 서버가 들고 있는 전투를 접는다. 실패해도 화면 전환을 막지 않는다. */
  private closeBattle(): void {
    const battleId = this.state?.battleId;
    if (!battleId) {
      return;
    }

    this.state = null;
    void this.battle.endBattle(battleId).catch(() => undefined);
  }

  private async ensureEffects(): Promise<void> {
    if (this.effects) {
      return;
    }

    try {
      const effects = await createBattleEffectsLayer({
        host: this.battlefieldView.effectsHost,
        resolveSlotCenter: (slotId) => this.battlefieldView.getSlotCenter(slotId),
        getPlaybackRate: () => this.sequence.getPlaybackRate(),
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

  /**
   * 행동 의도 하나를 서버로 보내고 결과를 화면에 반영한다.
   * 서버가 거절하면 상태는 그대로 두고 이유만 적는다. 되돌릴 것이 없다.
   */
  private async send(command: BattleCommand): Promise<BattleUpdate | null> {
    const battleId = this.state?.battleId;
    if (!battleId || this.sending) {
      return null;
    }

    this.sending = true;
    try {
      return await this.battle.applyCommand(battleId, command);
    } catch (error: unknown) {
      if (this.active) {
        this.renderView(readErrorMessage(error), true);
      }
      return null;
    } finally {
      this.sending = false;
    }
  }

  /** 서버가 확정한 결과를 기록·상태·화면에 반영한다. 규칙 판정은 여기서 하지 않는다. */
  private applyUpdate(update: BattleUpdate, status = '', statusIsError = false): void {
    this.state = update.state;
    this.log = appendBattleLogLines(
      this.log,
      formatBattleTurnEvents(update.cardNames, update.events),
    );
    this.finishBattleIfOver();
    this.renderView(status, statusIsError);
  }

  /**
   * 적 자동 턴을 한 행동씩 받아 재생한다.
   * 무엇을 얼마나 진행할지는 서버가 정하고, 이 루프는 사이에 간격만 넣는다.
   */
  private async runAutomation(): Promise<void> {
    if (this.playingEnemyTurn) {
      return;
    }

    this.playingEnemyTurn = true;
    try {
      while (this.active && this.state?.automationPending) {
        this.renderView('적이 움직입니다...');
        const update = await this.send({ type: 'ADVANCE' });
        if (!update || !this.active) {
          return;
        }

        this.applyUpdate(update, '적이 움직입니다...');
        if (!this.state?.automationPending) {
          // 마지막 걸음이다. 연출은 내되 기다리지 않는다.
          this.playEffects(update.effects);
          break;
        }

        await this.playStepFeedback(update.effects);
      }
    } finally {
      this.playingEnemyTurn = false;
    }

    if (this.active) {
      this.renderView(this.readIdleStatus(), this.state?.automationStalled === true);
    }
  }

  /** 자동 진행이 멈춘 뒤 무엇을 하면 되는지 적는다. */
  private readIdleStatus(): string {
    const state = this.state;
    if (!state) {
      return '';
    }

    if (state.blockPrompt) {
      return '적의 공격을 막을지 고르세요.';
    }

    if (state.automationStalled) {
      return '양측 모두 둘 수 있는 수가 없습니다.';
    }

    return state.outcome ? '' : '내 차례입니다.';
  }

  /**
   * 적 행동 하나를 읽을 시간을 준다.
   * 연출이 나가면 그 길이가 곧 간격이다. 연출과 고정 간격을 겹치면 한 수가 너무 길어진다.
   */
  private async playStepFeedback(effects: readonly BattleEffectRequest[]): Promise<void> {
    const [request] = effects;
    if (request && this.effects) {
      await this.effects.play(request);
      return;
    }

    await this.wait(ENEMY_STEP_DELAY_MS);
  }

  /** 내 행동의 연출이다. 기다리지 않는다. 내 조작은 곧바로 이어질 수 있어야 한다. */
  private playEffects(effects: readonly BattleEffectRequest[]): void {
    for (const request of effects) {
      void this.effects?.play(request);
    }
  }

  private wait(durationMs: number): Promise<void> {
    return this.sequence
      .createSequence()
      .add({ timer: 0, duration: durationMs, action: 'wait' })
      .play();
  }

  private setPlaybackRate(playbackRate: number): void {
    // 모르는 값은 기본값으로 접지 않고 무시한다. HUD 오작동이 배속을 되돌리면 더 헷갈린다.
    if (!isBattlefieldPlaybackRate(playbackRate)) {
      return;
    }

    this.sequence.setPlaybackRate(playbackRate);
    this.options.onPlaybackRateChange?.(playbackRate);
    this.renderView();
  }

  /** 내 턴을 끝내고 적 턴이 끝날 때까지 재생한다. */
  private async endTurn(): Promise<void> {
    if (!this.canEndTurn()) {
      return;
    }

    const update = await this.send({ type: 'END_TURN' });
    if (!update) {
      return;
    }

    this.applyUpdate(update);
    void this.runAutomation();
  }

  /** 방어 선택 결과를 서버에 보낸다. 막지 않기를 고르면 원래 공격이 그대로 들어온다. */
  private async resolveBlock(blockerInstanceId: string | null): Promise<void> {
    if (!this.state?.blockPrompt) {
      return;
    }

    const update = await this.send({ type: 'RESOLVE_BLOCK', blockerInstanceId });
    if (!update) {
      return;
    }

    const blocked = update.events.some((event) => event.type === 'BLOCK');
    this.applyUpdate(update, blocked ? '공격을 막았습니다.' : '공격을 그대로 받았습니다.');
    this.playEffects(update.effects);
    void this.runAutomation();
  }

  /** 내가 카드를 움직일 수 있는 상태인지다. 턴 종료 조건과 같다. */
  private canAct(): boolean {
    const state = this.state;

    return (
      state !== null &&
      state.phase !== 'GAME_OVER' &&
      state.currentSide === 'player' &&
      state.blockPrompt === null &&
      !state.automationPending &&
      !this.playingEnemyTurn &&
      !this.sending
    );
  }

  private canEndTurn(): boolean {
    return this.canAct();
  }

  /**
   * 집은 것을 놓을 수 있는 칸 목록이다. 드래그를 시작할 때 강조할 칸이기도 하다.
   * 목록은 서버가 이미 판정해 상태에 담아 준 것이라 여기서 규칙을 다시 세지 않는다.
   */
  private resolveTargets(source: BattleDragSource): BattleSlotId[] {
    // 적 차례 재생이나 방어 선택 중에는 아무것도 집히지 않게 빈 목록을 낸다.
    if (!this.canAct() || !this.state) {
      return [];
    }

    if (source.kind === 'hand') {
      return (
        this.state.hand.find((entry) => entry.card.instanceId === source.cardInstanceId)
          ?.placeSlotIds ?? []
      );
    }

    const slot = this.findSlotByCard(source.cardInstanceId);
    if (!slot) {
      return [];
    }

    if (source.kind === 'skill') {
      return slot.skills.find((skill) => skill.skillId === source.skillId)?.targetSlotIds ?? [];
    }

    return [...slot.moveSlotIds, ...slot.attackSlotIds];
  }

  private async applyDrop(source: BattleDragSource, slotId: BattleSlotId): Promise<void> {
    if (!this.canAct()) {
      return;
    }

    const command = this.toDropCommand(source, slotId);
    if (!command) {
      // 드래그를 시작한 뒤 상태가 바뀌면 여기에 온다. 규칙 판정은 서버에만 두고 조용히 되돌린다.
      this.renderView('지금은 그렇게 할 수 없습니다.', true);
      return;
    }

    const update = await this.send(command);
    if (!update) {
      return;
    }

    this.applyUpdate(update, this.readActionStatus(update));
    this.playEffects(update.effects);
    // 방금 수로 둘 것이 다 떨어졌을 수 있다. 그러면 서버가 턴을 넘겨 두었다.
    void this.runAutomation();
  }

  /**
   * 놓은 자리에 맞는 행동 의도를 만든다.
   * 서버가 준 후보에 없는 칸이면 null이다. 최종 판정은 어차피 서버가 다시 한다.
   */
  private toDropCommand(source: BattleDragSource, slotId: BattleSlotId): BattleCommand | null {
    if (source.kind === 'hand') {
      const hand = this.state?.hand.find(
        (entry) => entry.card.instanceId === source.cardInstanceId,
      );
      if (!hand?.placeSlotIds.includes(slotId)) {
        return null;
      }

      return { type: 'PLACE', cardInstanceId: source.cardInstanceId, toSlotId: slotId };
    }

    const slot = this.findSlotByCard(source.cardInstanceId);
    if (!slot) {
      return null;
    }

    if (source.kind === 'skill') {
      const skill = slot.skills.find((candidate) => candidate.skillId === source.skillId);
      if (!skill?.targetSlotIds.includes(slotId)) {
        return null;
      }

      return {
        type: 'ACTIVE_SKILL',
        cardInstanceId: source.cardInstanceId,
        skillId: source.skillId,
        targetSlotId: slotId,
      };
    }

    if (slot.moveSlotIds.includes(slotId)) {
      return { type: 'MOVE', cardInstanceId: source.cardInstanceId, toSlotId: slotId };
    }

    if (slot.attackSlotIds.includes(slotId)) {
      return { type: 'ATTACK', attackerInstanceId: source.cardInstanceId, toSlotId: slotId };
    }

    return null;
  }

  /** 서버가 확정한 이벤트에서 내 행동의 결과 문구를 만든다. */
  private readActionStatus(update: BattleUpdate): string {
    const blocked = update.events.some((event) => event.type === 'BLOCK');

    for (const event of update.events) {
      if (event.type === 'ACTIVE_SKILL') {
        return `${SKILL_EFFECT_LABELS[event.action.effect]} ${event.action.value}을(를) 적용했습니다.`;
      }

      if (event.type !== 'ACTION' || event.side !== 'player') {
        continue;
      }

      const { action } = event;
      if (action.type === 'PLACE') {
        return `${action.cost} 코스트 카드를 배치했습니다.`;
      }

      if (action.type === 'MOVE') {
        return '카드를 이동했습니다.';
      }

      return blocked
        ? `공격을 ${action.attack} 피해로 선언했지만 적이 막았습니다.`
        : `${action.attack} 피해로 공격했습니다.`;
    }

    return '';
  }

  private findSlotByCard(cardInstanceId: string): BattlePublicSlot | null {
    return this.state?.slots.find((slot) => slot.card?.instanceId === cardInstanceId) ?? null;
  }

  /** 승패가 났으면 서버가 만든 결과를 받아 저장을 시작한다. 이미 받았으면 아무것도 하지 않는다. */
  private finishBattleIfOver(): void {
    const result = this.state?.result;
    if (this.battleResult || !result) {
      return;
    }

    this.battleResult = result;
    void this.persistResult(result);
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
      this.saveError = readErrorMessage(error);
    }

    this.renderView();
  }

  /**
   * Stage로 돌아간다. 결과 저장 중에는 막는다.
   * 서버 전투를 접는 일은 `exit`가 맡는다. 여기서 상태를 비우면 화면이 넘어가기 전에 판이 사라진다.
   */
  private leave(): void {
    if (this.savingResult) {
      return;
    }

    this.options.onLeave(this.savedSession, this.battleResult);
  }

  private renderView(status = '', statusIsError = false): void {
    const layout = this.layout ?? { width: 1024, height: 768, scale: 1 };
    const state = this.state;

    this.battlefieldView.render({
      metrics: resolveBattleBoardMetrics(layout),
      stageName: this.stageDefinition.name,
      turnNumber: state?.turnNumber ?? 1,
      currentSide: state?.currentSide ?? 'player',
      phaseLabel: PHASE_LABELS[state?.phase ?? 'MAIN'],
      enemy: {
        ...this.readPiles(state?.enemy),
        handCount: state?.enemy.handCount ?? 0,
      },
      player: this.readPiles(state?.player),
      slots: this.buildSlotModels(),
      hand: this.buildHandModels(),
      status,
      statusIsError,
      canEndTurn: this.canEndTurn(),
      playbackRate: this.sequence.getPlaybackRate(),
      log: this.log,
      blockPrompt: this.buildBlockPrompt(),
      result: this.buildResult(),
    });
  }

  private buildBlockPrompt(): BattleBlockPromptModel | null {
    const prompt = this.state?.blockPrompt;
    if (!prompt) {
      return null;
    }

    return {
      message: `${prompt.attackerName}이(가) ${prompt.targetName}을(를) ${prompt.attack} 피해로 공격합니다. 대신 맞을 유닛을 고를 수 있습니다.`,
      blockers: prompt.blockers.map((blocker) => ({
        instanceId: blocker.instanceId,
        label: `${blocker.name}이(가) 막는다`,
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

  /** 더미 수치와 맨 위 카드를 읽는다. 값은 서버가 이미 세어 보낸 것이다. */
  private readPiles(piles: BattlePublicPiles | undefined): BattleSideModel {
    return {
      deckCount: piles?.deckCount ?? 0,
      dropCount: piles?.dropCount ?? 0,
      exileCount: piles?.exileCount ?? 0,
      dropTop: piles?.dropTop ? this.toTile(piles.dropTop) : null,
      exileTop: piles?.exileTop ? this.toTile(piles.exileTop) : null,
    };
  }

  private buildSlotModels(): Record<BattleRowId, BattleSlotModel[]> {
    const slotsById = new Map((this.state?.slots ?? []).map((slot) => [slot.slotId, slot]));

    return Object.fromEntries(
      BATTLE_ROW_IDS.map((row) => [
        row,
        listRowSlotIds(row).map((slotId): BattleSlotModel => {
          const slot = slotsById.get(slotId);
          if (!slot) {
            return { slotId, card: null, dominance: null, ready: null, skills: [] };
          }

          return {
            slotId,
            card: slot.card ? this.toTile(slot.card) : null,
            dominance: slot.dominance,
            ready: slot.ready,
            skills: slot.skills.map((skill) => this.toSkillBadge(skill)),
          };
        }),
      ]),
    ) as Record<BattleRowId, BattleSlotModel[]>;
  }

  private toSkillBadge(skill: BattlePublicSkill): BattleSkillBadgeModel {
    return {
      skillId: skill.skillId,
      glyph: `${SKILL_GLYPHS[skill.effect]}${skill.value}`,
      effect: skill.effect,
      label: `${skill.name} · ${SKILL_EFFECT_LABELS[skill.effect]} ${skill.value} · 끌어서 대상 지정`,
    };
  }

  private buildHandModels(): BattleHandCardModel[] {
    return (this.state?.hand ?? []).map((entry) => ({
      tile: this.toTile(entry.card),
      playable: entry.placeSlotIds.length > 0,
    }));
  }

  /**
   * 길게 누르기·우클릭으로 연 카드를 떠 있는 상세 패널에 싣는다.
   * 화면에 보이는 카드만 상태에 담겨 오므로, 그릴 수 있는 것은 모두 여기서 찾힌다.
   */
  private inspect(cardInstanceId: string): void {
    const state = this.state;
    const found = state
      ? [
          ...state.slots.flatMap((slot) => (slot.card ? [slot.card] : [])),
          ...state.hand.map((entry) => entry.card),
          ...[
            state.player.dropTop,
            state.player.exileTop,
            state.enemy.dropTop,
            state.enemy.exileTop,
          ].filter((card): card is BattlePublicCard => card !== null),
        ].find((card) => card.instanceId === cardInstanceId)
      : undefined;

    this.battlefieldView.showDetail(
      found ? toCardDetail(found.card, this.options.assetBaseUrl) : null,
    );
  }

  private toTile(card: BattlePublicCard): CardTile {
    return toBattleCardTile(card, this.options.assetBaseUrl);
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

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
