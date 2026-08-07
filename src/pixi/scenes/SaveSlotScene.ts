import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import {
  createSaveSlotView,
  type SaveSlotStatusTone,
  type SaveSlotView,
} from '../../dom/screens/save-slot-view';
import { createGameSession, type GameSession } from '../../game/save/session';
import type { SaveSlotSummary } from '../../game/save/types';
import type { GameServices } from '../../services/game-services';
import { UI_THEME } from '../../theme';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

/** 원본 Phaser 키 `title-background`에 대응하는 manifest alias다. */
const TITLE_BACKGROUND_ALIAS = 'ui.title-screen';

export type SaveSlotSceneOptions = {
  services: GameServices;
  backgroundImageUrl: string;
  /** 뒤로 가기. 원본은 MainMenu로 돌아간다. */
  onBack: () => void;
  /** 로그아웃이 끝난 뒤 타이틀로 넘기기 위한 신호다. */
  onLoggedOut: (statusMessage: string) => void;
  /** 슬롯 생성·로드가 끝난 세션을 다음 화면(Stage)으로 넘긴다. */
  onSessionReady: (session: GameSession) => void;
  /** 테스트에서 document 없이 화면 로직만 검증할 때 주입한다. */
  view?: SaveSlotView;
};

/**
 * 로그인 후 3개의 저장 슬롯을 고르는 화면이다.
 * 배경은 캔버스(Sprite + 딤 Graphics), 선택 UI 크롬은 DOM 오버레이다.
 */
export class SaveSlotScene implements Scene {
  public readonly view = new Container({
    label: 'save-slot',
    // 크롬 입력은 DOM이 담당한다. 캔버스 hit-test를 건너뛴다.
    eventMode: 'none',
  });
  public readonly element: HTMLElement;

  private readonly saveSlotView: SaveSlotView;
  private readonly backdrop = new Graphics({ label: 'save-backdrop', eventMode: 'none' });
  private readonly shade = new Graphics({ label: 'save-shade', eventMode: 'none' });
  private background: Sprite | null = null;
  private layout: ViewportLayout | null = null;
  private slotSummaries: SaveSlotSummary[] = [];
  private deleteMode = false;
  private isSlotActionPending = false;
  private isLoggingOut = false;
  private active = true;

  public constructor(private readonly options: SaveSlotSceneOptions) {
    this.saveSlotView =
      options.view ??
      createSaveSlotView({
        onBack: () => this.options.onBack(),
        onLogout: () => {
          void this.logout();
        },
        onRetry: () => {
          void this.reload();
        },
        onToggleDelete: () => this.toggleDeleteMode(),
        onSelectSlot: (slotId) => {
          const slot = this.slotSummaries.find((entry) => entry.slotId === slotId);

          if (slot) {
            void this.handleSlotSelection(slot);
          }
        },
      });
    this.element = this.saveSlotView.element;
    this.view.addChild(this.backdrop, this.shade);
  }

  /**
   * 배경 텍스처를 Assets로 받은 뒤 슬롯 목록을 불러온다.
   * `Texture.from`은 캐시만 읽으므로 로딩은 반드시 `Assets.load`다.
   */
  public async enter(): Promise<void> {
    this.active = true;
    this.isLoggingOut = false;
    this.isSlotActionPending = false;
    this.deleteMode = false;
    this.slotSummaries = [];
    this.saveSlotView.setDeleteMode(false);
    this.saveSlotView.showRetry(false);
    this.saveSlotView.showDeleteButton(true);
    this.saveSlotView.renderSlots([], false);
    this.showLoadingState();

    await this.ensureBackground();
    if (this.layout) {
      this.layoutBackground(this.layout);
    }

    await this.loadSaveSlots();
  }

  public exit(): void {
    this.active = false;
  }

  /** 논리 영역에 맞춰 배경 Sprite와 딤 레이어를 다시 깐다. */
  public resize(layout: ViewportLayout): void {
    this.layout = layout;
    this.layoutBackground(layout);
  }

  private async ensureBackground(): Promise<void> {
    if (this.background) {
      return;
    }

    try {
      // 프리로드 번들은 webp만 담으므로 title-screen.png는 여기서 받는다.
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
      // 배경 실패해도 슬롯 API 흐름은 이어간다. 딤 Graphics만 남긴다.
      this.background = null;
    }
  }

  private layoutBackground(layout: ViewportLayout): void {
    if (this.background) {
      // 원본은 고정 해상도에 스트레치했다. 반응형 논리 영역에 동일하게 맞춘다.
      this.background.width = layout.width;
      this.background.height = layout.height;
    }

    const { saveBackdrop, saveShade } = UI_THEME.surfaces;

    this.backdrop
      .clear()
      .rect(0, 0, layout.width, layout.height)
      .fill({ color: saveBackdrop.fill.canvas, alpha: saveBackdrop.fillAlpha });

    this.shade
      .clear()
      .rect(0, 0, layout.width, layout.height)
      .fill({ color: saveShade.fill.canvas, alpha: saveShade.fillAlpha });
  }

  private showLoadingState(): void {
    this.saveSlotView.setBusy(true);
    this.saveSlotView.showRetry(false);
    this.saveSlotView.renderSlots([], this.deleteMode);
    this.setStatus('Loading save slots...');
  }

  private async reload(): Promise<void> {
    if (this.isLoggingOut || this.isSlotActionPending) {
      return;
    }

    this.deleteMode = false;
    this.saveSlotView.setDeleteMode(false);
    this.saveSlotView.showDeleteButton(true);
    this.showLoadingState();
    await this.loadSaveSlots();
  }

  private async loadSaveSlots(): Promise<void> {
    try {
      const slots = await this.options.services.saveSlots.fetchSummaries();

      if (!this.active || this.isLoggingOut) {
        return;
      }

      this.slotSummaries = slots;
      this.saveSlotView.renderSlots(slots, this.deleteMode);
      this.saveSlotView.setBusy(false);
      this.saveSlotView.showRetry(false);
      this.setStatus('Select a slot to continue or create a new save.');
    } catch (error: unknown) {
      if (!this.active || this.isLoggingOut) {
        return;
      }

      this.showFailureState(error);
    }
  }

  private showFailureState(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.saveSlotView.renderSlots([], false);
    this.saveSlotView.setBusy(false);
    this.saveSlotView.showRetry(true);
    this.saveSlotView.showDeleteButton(false);
    this.setStatus(`Failed to load save slots: ${message}`, 'error');
  }

  private setStatus(message: string, tone: SaveSlotStatusTone = 'normal'): void {
    this.saveSlotView.setStatus(message, tone);
  }

  private toggleDeleteMode(): void {
    if (this.isSlotActionPending || this.isLoggingOut) {
      return;
    }

    if (this.slotSummaries.length === 0) {
      this.setStatus('Save slots are not available yet.');
      return;
    }

    this.deleteMode = !this.deleteMode;
    this.saveSlotView.setDeleteMode(this.deleteMode);
    this.saveSlotView.renderSlots(this.slotSummaries, this.deleteMode);

    if (this.deleteMode) {
      this.setStatus('Delete mode: select a saved slot to delete.', 'danger');
      return;
    }

    this.setStatus('Select a slot to continue or create a new save.');
  }

  private async handleSlotSelection(slot: SaveSlotSummary): Promise<void> {
    if (this.isSlotActionPending || this.isLoggingOut || !this.active) {
      return;
    }

    if (this.deleteMode) {
      await this.deleteSlot(slot);
      return;
    }

    this.isSlotActionPending = true;
    this.saveSlotView.setBusy(true);

    try {
      if (slot.isEmpty) {
        this.setStatus(`Initializing Slot ${slot.slotId}...`);
        const result = await this.options.services.saveSlots.initialize(slot.slotId);

        if (!this.active || this.isLoggingOut) {
          return;
        }

        this.options.onSessionReady(createGameSession(result.state));
        return;
      }

      this.setStatus(`Loading Slot ${slot.slotId}...`);
      const state = await this.options.services.saveSlots.fetch(slot.slotId);

      if (!this.active || this.isLoggingOut) {
        return;
      }

      this.options.onSessionReady(createGameSession(state));
    } catch (error: unknown) {
      if (!this.active || this.isLoggingOut) {
        return;
      }

      this.showFailureState(error);
    } finally {
      this.isSlotActionPending = false;
    }
  }

  private async deleteSlot(slot: SaveSlotSummary): Promise<void> {
    if (slot.isEmpty) {
      this.setStatus(`Slot ${slot.slotId} is already empty.`, 'danger');
      return;
    }

    this.isSlotActionPending = true;
    this.saveSlotView.setBusy(true);
    this.setStatus(`Deleting Slot ${slot.slotId}...`, 'danger');

    try {
      const summary = await this.options.services.saveSlots.delete(slot.slotId);

      if (!this.active || this.isLoggingOut) {
        return;
      }

      this.slotSummaries = this.slotSummaries.map((entry) =>
        entry.slotId === summary.slotId ? summary : entry,
      );
      this.deleteMode = false;
      this.saveSlotView.setDeleteMode(false);
      this.saveSlotView.renderSlots(this.slotSummaries, false);
      this.saveSlotView.setBusy(false);
      this.setStatus(`Slot ${slot.slotId} deleted. Select a slot to continue.`);
    } catch (error: unknown) {
      if (!this.active || this.isLoggingOut) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.saveSlotView.setBusy(false);
      this.setStatus(`Failed to delete Slot ${slot.slotId}: ${message}`, 'danger');
    } finally {
      this.isSlotActionPending = false;
    }
  }

  private async logout(): Promise<void> {
    if (this.isLoggingOut) {
      return;
    }

    this.isLoggingOut = true;
    this.saveSlotView.setBusy(true);
    this.setStatus('Signing out...');

    try {
      await this.options.services.auth.logout();
      this.options.onLoggedOut('You have been logged out.');
    } catch (error: unknown) {
      this.isLoggingOut = false;
      this.saveSlotView.setBusy(false);
      this.setStatus(error instanceof Error ? error.message : String(error), 'error');
    }
  }
}
