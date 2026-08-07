import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import {
  CARD_TEXT_TOOL_ACCOUNT_ID,
  createDefaultLicenseLinks,
  createMainMenuView,
  formatMainMenuLoadSummary,
  LICENSE_INTRO_TEXT,
  type MainMenuView,
} from '../../dom/screens/main-menu-view';
import type { GameServices } from '../../services/game-services';
import { UI_THEME } from '../../theme';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

/** 원본 Phaser 키 `title-background`에 대응하는 manifest alias다. */
const TITLE_BACKGROUND_ALIAS = 'ui.title-screen';

export type MainMenuSceneOptions = {
  services: GameServices;
  backgroundImageUrl: string;
  loadedCount: number;
  failedCount: number;
  onStartGame: () => void;
  onLoggedOut: (statusMessage: string) => void;
  /** 테스트에서 document 없이 화면 로직만 검증할 때 주입한다. */
  view?: MainMenuView;
};

/**
 * 자산 로딩이 끝난 뒤 저장 슬롯·라이선스·로그아웃 진입을 제공하는 허브 화면이다.
 * 배경은 캔버스, 메뉴 크롬은 DOM이다.
 */
export class MainMenuScene implements Scene {
  public readonly view = new Container({
    label: 'main-menu',
    eventMode: 'none',
  });
  public readonly element: HTMLElement;

  private readonly menuView: MainMenuView;
  private readonly backdrop = new Graphics({ label: 'menu-backdrop', eventMode: 'none' });
  private readonly shade = new Graphics({ label: 'menu-shade', eventMode: 'none' });
  private background: Sprite | null = null;
  private layout: ViewportLayout | null = null;
  private isLoggingOut = false;
  private active = true;
  private readonly escapeHandler = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.menuView.isLicenseOpen()) {
      this.menuView.setLicenseOpen(false);
    }
  };

  public constructor(private readonly options: MainMenuSceneOptions) {
    const accountId = options.services.auth.current?.id ?? null;
    this.menuView =
      options.view ??
      createMainMenuView({
        accountId,
        loadSummary: formatMainMenuLoadSummary(options.loadedCount, options.failedCount),
        showCardTextTool: accountId === CARD_TEXT_TOOL_ACCOUNT_ID,
        licenseLinks: createDefaultLicenseLinks(),
        licenseIntro: LICENSE_INTRO_TEXT,
        onStartGame: () => this.options.onStartGame(),
        onCardTextTool: () => {
          window.location.assign('/tools/card-text/');
        },
        onLicense: () => this.menuView.setLicenseOpen(true),
        onLogout: () => {
          void this.logout();
        },
        onCloseLicense: () => this.menuView.setLicenseOpen(false),
      });
    this.element = this.menuView.element;
    this.view.addChild(this.backdrop, this.shade);
  }

  /** 배경을 준비한다. 라이선스 다이얼로그 Escape 닫기를 등록한다. */
  public async enter(): Promise<void> {
    this.active = true;
    this.isLoggingOut = false;
    this.menuView.setBusy(false);
    this.menuView.setLicenseOpen(false);
    document.addEventListener('keydown', this.escapeHandler);

    await this.ensureBackground();
    if (this.layout) {
      this.layoutBackground(this.layout);
    }
  }

  public exit(): void {
    this.active = false;
    document.removeEventListener('keydown', this.escapeHandler);
    this.menuView.setLicenseOpen(false);
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

    const { menuBackdrop, menuShade } = UI_THEME.surfaces;

    this.backdrop
      .clear()
      .rect(0, 0, layout.width, layout.height)
      .fill({ color: menuBackdrop.fill.canvas, alpha: menuBackdrop.fillAlpha });

    this.shade
      .clear()
      .rect(0, 0, layout.width, layout.height)
      .fill({ color: menuShade.fill.canvas, alpha: menuShade.fillAlpha });
  }

  private async logout(): Promise<void> {
    if (this.isLoggingOut) {
      return;
    }

    this.isLoggingOut = true;
    this.menuView.setBusy(true);
    this.menuView.setLicenseOpen(false);
    this.menuView.setStatus('Signing out...');

    try {
      await this.options.services.auth.logout();
      this.options.onLoggedOut('You have been logged out.');
    } catch (error: unknown) {
      this.isLoggingOut = false;
      this.menuView.setBusy(false);
      this.menuView.setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }
}
