import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { toBattleCardTile } from '../../dom/screens/battle-card-tile';
import {
  BATTLE_ROW_IDS,
  listRowSlotIds,
  resolveBattleBoardMetrics,
  type BattleRowId,
} from '../../dom/screens/battlefield-layout';
import {
  createBattlefieldView,
  type BattlefieldView,
  type BattleDragSource,
  type BattleHandCardModel,
  type BattleSkillBadgeModel,
  type BattleSlotModel,
} from '../../dom/screens/battlefield-view';
import type { CardTile } from '../../dom/screens/card-tile';
import { ACTIVE_SKILL_DEFINITIONS } from '../../game/battle/ability-handlers';
import {
  applyActiveSkillAction,
  applyAttackAction,
  applyBlockAction,
  applyMoveAction,
  applyPlaceAction,
  calculateSlotDominance,
  findBattlefieldCardAtSlot,
  listActiveSkillActions,
  listAttackActions,
  listBlockActions,
  listMoveActions,
  listPlaceActions,
} from '../../game/battle/battle-engine';
import { createInitialBattleRuntime } from '../../game/battle/create-battle-runtime';
import type {
  ActiveSkillBattleEffect,
  BattleCardRuntimeState,
  BattlePhase,
  BattleParticipantRuntimeState,
  BattleRuntimeState,
  BattleSlotId,
} from '../../game/battle/types';
import type { GameSession } from '../../game/save/session';
import { requireStageDefinition } from '../../game/stage/stage-definitions';
import { UI_THEME } from '../../theme';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

const TITLE_BACKGROUND_ALIAS = 'ui.title-screen';

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
  backgroundImageUrl: string;
  assetBaseUrl: string;
  session: GameSession;
  stageId: string;
  onLeave: (session: GameSession) => void;
  view?: BattlefieldView;
  random?: () => number;
};

/**
 * 전장 화면이다.
 * 규칙 판정은 전부 battle-engine이 맡고, 이 Scene은 런타임 상태를 뷰 모델로 옮기고
 * 드래그 결과를 엔진 액션으로 바꿔 적용하는 일만 한다.
 * 턴 진행과 적 차례는 다음 단계에서 붙인다.
 */
export class BattlefieldScene implements Scene {
  public readonly view = new Container({
    label: 'battlefield',
    eventMode: 'none',
  });
  public readonly element: HTMLElement;

  private readonly battlefieldView: BattlefieldView;
  private readonly backdrop = new Graphics({ label: 'battlefield-backdrop', eventMode: 'none' });
  private readonly stageName: string;
  private readonly runtime: BattleRuntimeState;
  private background: Sprite | null = null;
  private layout: ViewportLayout | null = null;
  private active = true;

  public constructor(private readonly options: BattlefieldSceneOptions) {
    const stageDefinition = requireStageDefinition(options.stageId);
    this.stageName = stageDefinition.name;
    this.runtime = createInitialBattleRuntime(
      options.session,
      stageDefinition,
      options.random ?? Math.random,
    );

    this.battlefieldView =
      options.view ??
      createBattlefieldView({
        onEndTurn: () => this.endTurn(),
        onLeave: () => this.options.onLeave(this.options.session),
        resolveTargets: (source) => this.resolveTargets(source),
        onDrop: (source, slotId) => this.applyDrop(source, slotId),
      });

    this.element = this.battlefieldView.element;
    this.view.addChild(this.backdrop);
  }

  public async enter(): Promise<void> {
    this.active = true;
    this.renderView('전투를 시작합니다.');

    await this.ensureBackground();
    if (this.layout) {
      this.layoutBackground(this.layout);
    }
  }

  public exit(): void {
    this.active = false;
  }

  public resize(layout: ViewportLayout): void {
    this.layout = layout;
    this.layoutBackground(layout);
    // 카드 크기가 뷰포트에 따라 달라진다. 배율이 바뀌면 보드를 다시 그려야 한다.
    this.renderView();
  }

  private endTurn(): void {
    this.renderView('턴 진행은 다음 단계에서 연결합니다.');
  }

  /**
   * 집은 것을 놓을 수 있는 칸 목록이다. 드래그를 시작할 때 강조할 칸이기도 하다.
   * 이동 대상은 빈 칸, 공격 대상은 적이 선 칸이라 둘은 절대 겹치지 않는다.
   */
  private resolveTargets(source: BattleDragSource): BattleSlotId[] {
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
    try {
      const message = this.executeDrop(source, slotId);
      if (message === null) {
        // 드래그를 시작한 뒤 상태가 바뀌면 여기에 온다. 규칙 판정은 엔진에만 두고 조용히 되돌린다.
        this.renderView('지금은 그렇게 할 수 없습니다.', true);
        return;
      }

      this.renderView(message);
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
      return `공격을 ${attackAction.attack} 피해로 선언했지만 적이 막았습니다.`;
    }

    applyAttackAction(this.runtime, attackAction);
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
      stageName: this.stageName,
      turnNumber: this.runtime.turnNumber,
      currentSide: this.runtime.currentSide,
      phaseLabel: PHASE_LABELS[this.runtime.phase],
      enemy: {
        ...this.readPileCounts(this.runtime.enemy),
        handCount: this.runtime.enemy.hand.length,
      },
      player: this.readPileCounts(this.runtime.player),
      slots: this.buildSlotModels(),
      hand: this.buildHandModels(),
      status,
      statusIsError,
      canEndTurn: false,
    });
  }

  private readPileCounts(participant: BattleParticipantRuntimeState): {
    deckCount: number;
    dropCount: number;
    exileCount: number;
  } {
    return {
      deckCount: participant.deck.length,
      dropCount: participant.drop.length,
      exileCount: participant.exile.length,
    };
  }

  private buildSlotModels(): Record<BattleRowId, BattleSlotModel[]> {
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
            // 스킬만 남은 카드도 아직 할 일이 있다. 셋 중 하나라도 남았으면 소진으로 그리지 않는다.
            ready:
              movableCardIds.has(instanceId) ||
              attackerCardIds.has(instanceId) ||
              skills.length > 0,
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
