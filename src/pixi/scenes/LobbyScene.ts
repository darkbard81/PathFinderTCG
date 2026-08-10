import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import {
  createLobbyView,
  type LobbyMenuItem,
  type LobbyStandingPlayback,
  type LobbyView,
} from '../../dom/screens/lobby-view';
import { joinAssetUrl } from '../../game/assets/manifest';
import { findLobbyBackground } from '../../game/lobby/backgrounds';
import type { GameSession } from '../../game/save/session';
import type { GameServices } from '../../services/game-services';
import { UI_THEME } from '../../theme';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

/** 리더 standing 그림이 놓인 폴더다. 파일명은 리더 카드 id를 그대로 쓴다. */
const STANDING_PATH_PREFIX = 'cards/standing';

/**
 * standing 후보를 찾는 순서다. 앞에서부터 시도한다.
 *
 * webm이 먼저다. 영상은 브라우저가 스트리밍으로 풀어 프레임 수가 많아도
 * 메모리를 크게 쓰지 않는다.
 *
 * 알파 webm을 못 그리는 Safari/iOS는 hevc mov를 탄다. mov가 없거나 재생에
 * 실패하면 정지화 webp로 내려간다. gif는 색이 256개로 깎이는 데다 14MB라
 * 로비 진입만 무거워져 뺐다.
 *
 * 캔버스가 아니라 <img>·<video>로 그리므로 PixiJS의 포맷 제약을 받지 않는다.
 */
const STANDING_FILE_SUFFIXES = ['.webm', '.mov', '.webp'];

export type LobbySceneOptions = {
  services: GameServices;
  assetBaseUrl: string;
  session: GameSession;
  /** 저장 슬롯 선택으로 돌아간다. */
  onBack: () => void;
  /** Stage 화면으로 들어간다. */
  onPlay: (session: GameSession) => void;
  onDeck: (session: GameSession) => void;
  onEquipment: (session: GameSession) => void;
  onGrowth: (session: GameSession) => void;
  onLoggedOut: (statusMessage: string) => void;
  /** Lobby를 다시 열 때 standing 영상의 마지막 위치를 복원한다. */
  standingPlayback?: LobbyStandingPlayback;
  /** Lobby를 다시 열 때 standing 캐릭터 표시 상태를 복원한다. */
  standingVisible?: boolean;
  /** standing 캐릭터 표시 상태를 앱 임시 상태에 반영한다. */
  onStandingVisibilityChange?: (visible: boolean) => void;
  view?: LobbyView;
};

/**
 * 저장 슬롯과 Stage 사이의 허브 화면이다.
 *
 * 배경만 캔버스가 그리고, 리더 standing과 크롬은 DOM이 맡는다.
 * 배경은 저장 데이터가 고른 것을 쓰고, standing은 현재 덱 리더의 카드 id로 찾는다.
 */
export class LobbyScene implements Scene {
  public readonly view = new Container({ label: 'lobby', eventMode: 'none' });
  public readonly element: HTMLElement;

  private readonly lobbyView: LobbyView;
  private readonly shade = new Graphics({ label: 'lobby-shade', eventMode: 'none' });
  private background: Sprite | null = null;
  private layout: ViewportLayout | null = null;
  private isLoggingOut = false;
  private active = true;

  public constructor(private readonly options: LobbySceneOptions) {
    this.lobbyView =
      options.view ??
      createLobbyView(this.buildViewOptions(options.standingPlayback, options.standingVisible));
    this.element = this.lobbyView.element;
    this.view.addChild(this.shade);
  }

  public async enter(): Promise<void> {
    this.active = true;
    this.isLoggingOut = false;
    this.lobbyView.setStatus('');
    this.lobbyView.setBusy(false);

    await this.ensureBackground();
    if (this.layout) {
      this.layoutCanvas(this.layout);
    }
  }

  public exit(): void {
    const playback = this.lobbyView.readStandingPlayback();
    const standingPlayback = this.options.standingPlayback;
    if (playback && standingPlayback) {
      standingPlayback.source = playback.source;
      standingPlayback.currentTime = playback.currentTime;
    }
    this.active = false;
  }

  public resize(layout: ViewportLayout): void {
    this.layout = layout;
    this.layoutCanvas(layout);
  }

  private buildViewOptions(standingPlayback?: LobbyStandingPlayback, standingVisible?: boolean) {
    const guard = (run: () => void) => () => {
      if (!this.isLoggingOut) {
        run();
      }
    };

    const menuItems: LobbyMenuItem[] = [
      {
        id: 'play',
        label: '플레이',
        caption: 'Play',
        icon: 'battle',
        onSelect: guard(() => this.options.onPlay(this.options.session)),
      },
      {
        id: 'deck',
        label: '구성',
        caption: 'Deck Build',
        icon: 'deck',
        onSelect: guard(() => this.options.onDeck(this.options.session)),
      },
      {
        id: 'equipment',
        label: '장비',
        caption: 'Equipment',
        icon: 'shield',
        onSelect: guard(() => this.options.onEquipment(this.options.session)),
      },
      {
        id: 'growth',
        label: '성장',
        caption: 'Growth',
        icon: 'rank',
        onSelect: guard(() => this.options.onGrowth(this.options.session)),
      },
      // 연성은 아직 화면이 없다. 자리만 두고 눌리지 않게 한다.
      { id: 'forge', label: '연성', caption: 'Forge', icon: 'card', disabled: true },
    ];

    const leaderId = this.options.session.deck.leader.definition.id;

    return {
      standingSources: STANDING_FILE_SUFFIXES.map((suffix) =>
        joinAssetUrl(this.options.assetBaseUrl, `${STANDING_PATH_PREFIX}/${leaderId}${suffix}`),
      ),
      saveName: this.options.session.saveName,
      leaderName: this.options.session.deck.leader.definition.name,
      menuItems,
      ...(standingPlayback ? { standingPlayback } : {}),
      ...(standingVisible !== undefined ? { standingVisible } : {}),
      ...(this.options.onStandingVisibilityChange
        ? { onStandingVisibilityChange: this.options.onStandingVisibilityChange }
        : {}),
      onBack: guard(() => this.options.onBack()),
      onLogout: () => void this.logout(),
    };
  }

  /** 저장 데이터가 고른 배경을 깐다. 카탈로그에 없으면 배경 없이 진행한다. */
  private async ensureBackground(): Promise<void> {
    if (this.background) {
      return;
    }

    const definition = findLobbyBackground(this.options.session.lobby.selectedBackgroundId);
    if (!definition) {
      return;
    }

    const texture = await this.loadAsset<Texture>(
      `lobby.background.${definition.id}`,
      joinAssetUrl(this.options.assetBaseUrl, definition.path),
    );
    if (!texture || !this.active) {
      return;
    }

    this.background = new Sprite({ texture, label: 'lobby-background', eventMode: 'none' });
    this.view.addChildAt(this.background, 0);
  }

  private async loadAsset<T>(alias: string, src: string, data?: unknown): Promise<T | null> {
    try {
      return (await Assets.load({ alias, src, ...(data ? { data } : {}) })) as T;
    } catch {
      return null;
    }
  }

  private layoutCanvas(layout: ViewportLayout): void {
    if (this.background) {
      this.background.width = layout.width;
      this.background.height = layout.height;
    }

    const { screenShade } = UI_THEME.surfaces;
    this.shade
      .clear()
      .rect(0, 0, layout.width, layout.height)
      .fill({ color: screenShade.fill.canvas, alpha: screenShade.fillAlpha });
  }

  private async logout(): Promise<void> {
    if (this.isLoggingOut) {
      return;
    }

    this.isLoggingOut = true;
    this.lobbyView.setBusy(true);
    this.lobbyView.setStatus('Signing out...');

    try {
      await this.options.services.auth.logout();
      this.options.onLoggedOut('You have been logged out.');
    } catch (error: unknown) {
      this.isLoggingOut = false;
      this.lobbyView.setBusy(false);
      this.lobbyView.setStatus(error instanceof Error ? error.message : String(error));
    }
  }
}
