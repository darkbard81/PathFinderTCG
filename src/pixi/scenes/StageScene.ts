import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import {
  createStageView,
  type StageEntryModel,
  type StageView,
} from '../../dom/screens/stage-view';
import {
  createGameSession,
  createSaveSlotStateFromGameSession,
  type GameSession,
} from '../../game/save/session';
import { isStageUnlocked, listStageDefinitions } from '../../game/stage/stage-definitions';
import type { StageBattleResult, StageDefinition } from '../../game/stage/types';
import type { GameServices } from '../../services/game-services';
import { UI_THEME } from '../../theme';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

const TITLE_BACKGROUND_ALIAS = 'ui.title-screen';

export type StageSceneOptions = {
  services: GameServices;
  backgroundImageUrl: string;
  session: GameSession;
  lastBattleResult?: StageBattleResult;
  /** 로비로 돌아간다. Stage 선택은 전투 시작 시에만 저장하므로 들어올 때 세션을 그대로 넘긴다. */
  onBack: (session: GameSession) => void;
  /** 세션을 먼저 저장한 뒤 호출한다. 전투 중 이탈해도 스테이지 선택이 남는다. */
  onStartBattle: (session: GameSession, stageId: string) => void;
  view?: StageView;
};

/**
 * 저장 슬롯 이후 전투 전 Stage 목록과 상세를 보여주는 허브 화면이다.
 * 배경은 캔버스, 목록·상세·HUD는 DOM이다.
 */
export class StageScene implements Scene {
  public readonly view = new Container({
    label: 'stage',
    eventMode: 'none',
  });
  public readonly element: HTMLElement;

  private readonly stageView: StageView;
  private readonly backdrop = new Graphics({ label: 'stage-backdrop', eventMode: 'none' });
  private readonly shade = new Graphics({ label: 'stage-shade', eventMode: 'none' });
  private background: Sprite | null = null;
  private layout: ViewportLayout | null = null;
  private session: GameSession;
  private readonly lastBattleResult: StageBattleResult | null;
  private readonly stageDefinitions: StageDefinition[];
  private selectedStageId: string;
  private isStartingBattle = false;
  private active = true;

  public constructor(private readonly options: StageSceneOptions) {
    this.session = options.session;
    this.lastBattleResult = options.lastBattleResult ?? null;
    this.stageDefinitions = listStageDefinitions();
    this.selectedStageId = resolveInitialSelectedStage(this.stageDefinitions, this.session).id;

    this.stageView =
      options.view ??
      createStageView({
        onSelectStage: (stageId) => this.selectStage(stageId),
        onBack: () => {
          if (!this.isStartingBattle) {
            this.options.onBack(this.session);
          }
        },
        onStartBattle: () => {
          void this.handleStartBattle();
        },
      });
    this.element = this.stageView.element;
    this.view.addChild(this.backdrop, this.shade);
  }

  public async enter(): Promise<void> {
    this.active = true;
    this.isStartingBattle = false;
    this.renderView('Select a stage and start battle.');

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
  }

  private renderView(status: string, statusIsError = false): void {
    this.stageView.render({
      stages: this.buildStageEntries(),
      selectedStageId: this.selectedStageId,
      lastBattleResult: this.lastBattleResult,
      status,
      statusIsError,
      busy: this.isStartingBattle,
    });
  }

  /** 잠금·클리어 판정을 여기서 끝내 뷰가 도메인 규칙을 부르지 않게 한다. */
  private buildStageEntries(): StageEntryModel[] {
    return this.stageDefinitions.map((definition) => ({
      definition,
      unlocked: isStageUnlocked(definition, this.session.stageProgress),
      cleared: this.session.stageProgress.clearedStageIds.includes(definition.id),
    }));
  }

  private selectStage(stageId: string): void {
    if (this.isStartingBattle) {
      return;
    }

    this.selectedStageId = stageId;
    this.session = {
      ...this.session,
      stageProgress: {
        ...this.session.stageProgress,
        clearedStageIds: [...this.session.stageProgress.clearedStageIds],
        lastSelectedStageId: stageId,
      },
    };

    const selected = this.getSelectedStageDefinition();
    this.renderView(`Selected ${selected.name}.`);
  }

  private async handleStartBattle(): Promise<void> {
    if (this.isStartingBattle) {
      return;
    }

    const stageDefinition = this.getSelectedStageDefinition();
    if (!isStageUnlocked(stageDefinition, this.session.stageProgress)) {
      this.renderView('This stage is locked.', true);
      return;
    }

    this.isStartingBattle = true;
    this.renderView(`Preparing ${stageDefinition.name}...`);

    const nextSession: GameSession = {
      ...this.session,
      stageProgress: {
        ...this.session.stageProgress,
        clearedStageIds: [...this.session.stageProgress.clearedStageIds],
        lastSelectedStageId: stageDefinition.id,
      },
    };

    try {
      const savedState = await this.options.services.saveSlots.save(
        createSaveSlotStateFromGameSession(nextSession),
      );
      if (!this.active) {
        return;
      }

      const savedSession = createGameSession(savedState);
      this.session = savedSession;
      this.options.onStartBattle(savedSession, stageDefinition.id);
    } catch (error: unknown) {
      if (!this.active) {
        return;
      }

      this.isStartingBattle = false;
      const message = error instanceof Error ? error.message : String(error);
      this.renderView(`Failed to start battle: ${message}`, true);
    }
  }

  private getSelectedStageDefinition(): StageDefinition {
    const selected = this.stageDefinitions.find((stage) => stage.id === this.selectedStageId);
    if (selected) {
      return selected;
    }

    return resolveInitialSelectedStage(this.stageDefinitions, this.session);
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

    const { stageBackdrop, screenShade } = UI_THEME.surfaces;

    this.backdrop
      .clear()
      .rect(0, 0, layout.width, layout.height)
      .fill({ color: stageBackdrop.fill.canvas, alpha: stageBackdrop.fillAlpha });

    this.shade
      .clear()
      .rect(0, 0, layout.width, layout.height)
      .fill({ color: screenShade.fill.canvas, alpha: screenShade.fillAlpha });
  }
}

/** 최근 선택 Stage 또는 첫 해금 Stage를 고른다. */
export function resolveInitialSelectedStage(
  stages: StageDefinition[],
  session: GameSession,
): StageDefinition {
  const lastSelectedStage = stages.find(
    (stage) =>
      stage.id === session.stageProgress.lastSelectedStageId &&
      isStageUnlocked(stage, session.stageProgress),
  );
  if (lastSelectedStage) {
    return lastSelectedStage;
  }

  const firstUnlockedStage = stages.find((stage) => isStageUnlocked(stage, session.stageProgress));
  if (firstUnlockedStage) {
    return firstUnlockedStage;
  }

  const firstStage = stages[0];
  if (!firstStage) {
    throw new Error('No stage definitions registered');
  }

  return firstStage;
}
