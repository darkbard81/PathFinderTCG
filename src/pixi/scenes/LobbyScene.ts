import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import {
  createLobbyView,
  type LobbyCustomizationModel,
  type LobbyMenuItem,
  type LobbyBgmTrackOption,
  type LobbyStandingPlayback,
  type LobbyView,
  type LobbyViewOptions,
} from '../../dom/screens/lobby-view';
import { joinAssetUrl } from '../../game/assets/manifest';
import { findLobbyBackground, LOBBY_BACKGROUNDS } from '../../game/lobby/backgrounds';
import {
  type LobbyBgmPlayMode,
  DEFAULT_LOBBY_STANDING_POSITION_X,
  DEFAULT_LOBBY_STANDING_POSITION_Y,
  DEFAULT_LOBBY_STANDING_SCALE,
  LOBBY_STANDING_POSITION_X_RANGE,
  LOBBY_STANDING_POSITION_Y_RANGE,
  LOBBY_STANDING_SCALE_RANGE,
  normalizeLobbyState,
  type LobbyState,
} from '../../game/lobby/lobby-state';
import { normalizeSaveName, SAVE_NAME_MAX_LENGTH } from '../../game/save/save-name';
import {
  createGameSession,
  createSaveSlotStateFromGameSession,
  type GameSession,
} from '../../game/save/session';
import type { SaveSlotState } from '../../game/save/types';
import type { SoundVolumeControl } from '../../game/sound/sound-player';
import type { GameServices } from '../../services/game-services';
import { UI_THEME } from '../../theme';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

/**
 * 리더 standing 그림이 놓인 폴더다.
 * 그 아래 리더 카드 id로 폴더를 하나 더 두고, 파일명은 역할 이름으로 고정한다.
 * 리더마다 굽는 원본과 포맷 변형이 여러 개라 한 폴더에 평평하게 두면 섞인다.
 *
 *   cards/standing/<리더 카드 id>/standing.<확장자>
 */
const STANDING_PATH_PREFIX = 'cards/standing';
const STANDING_FILE_STEM = 'standing';

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

/**
 * BGM 탭이 쓰는 좁은 표면이다.
 *
 * 재생기를 통째로 넘기지 않는다. 씬이 필요한 것은 고를 수 있는 곡과 미리듣기뿐이고,
 * 잠금 해제나 대사 재생까지 손댈 수 있게 두면 로비가 소리 수명에 얽힌다.
 */
export type LobbyBgmControl = {
  /** 로비 플레이리스트에 담을 수 있는 곡이다. */
  listTracks: () => LobbyBgmTrackOption[];
  /** 지금 짜고 있는 목록을 그대로 들려준다. */
  play: (trackIds: string[], mode: LobbyBgmPlayMode) => void;
  /** 미리듣기를 멈추고 현재 BGM을 끈다. */
  stop: () => void;
  /** 목록에서 한 곡 건너뛴다. -1이면 이전 곡이다. */
  skip: (delta: 1 | -1) => void;
  /** 지금 울리는 곡 id다. 없으면 null이다. */
  getPlayingTrackId: () => string | null;
  /**
   * 재생 곡이 바뀔 때 부른다. 떼는 함수를 돌려준다.
   *
   * 곡은 씬 바깥에서도 바뀐다. 한 곡이 끝나 다음으로 넘어가는 일이 그렇다.
   * 씬이 열릴 때 한 번 읽고 마는 것으로는 표시가 곧 낡는다.
   */
  subscribe: (listener: () => void) => () => void;
};

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
  /** 설정 다이얼로그의 볼륨 슬라이더가 쓴다. 소리를 켤 수 없으면 넘기지 않는다. */
  volume?: SoundVolumeControl;
  /** BGM 탭이 쓰는 표면이다. 곡 목록과 미리듣기를 맡는다. */
  bgm?: LobbyBgmControl;
  /** Lobby를 다시 열 때 standing 영상의 마지막 위치를 복원한다. */
  standingPlayback?: LobbyStandingPlayback;
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
  private backgroundId: string | null = null;
  /** 비동기 배경 로딩 중 마지막 요청만 씬 그래프에 반영하기 위한 세대 번호다. */
  private backgroundRequestGeneration = 0;
  private layout: ViewportLayout | null = null;
  private isLoggingOut = false;
  private isSavingSettings = false;
  /** BGM 재생 곡 구독을 떼는 함수다. 로비를 떠날 때 뗀다. */
  private unsubscribeBgm: (() => void) | null = null;
  private active = true;

  public constructor(private readonly options: LobbySceneOptions) {
    this.lobbyView =
      options.view ?? createLobbyView(this.buildViewOptions(options.standingPlayback));
    this.element = this.lobbyView.element;
    this.view.addChild(this.shade);
  }

  public async enter(): Promise<void> {
    this.active = true;
    this.isLoggingOut = false;
    this.isSavingSettings = false;
    this.lobbyView.setStatus('');
    this.lobbyView.setBusy(false);
    this.watchPlayingBgm();

    await this.ensureBackground();
    if (this.layout) {
      this.layoutCanvas(this.layout);
    }
  }

  public exit(): void {
    this.unsubscribeBgm?.();
    this.unsubscribeBgm = null;
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

  /** 지금 울리는 곡을 BGM 탭에 알리고, 바뀔 때마다 따라가게 구독한다. */
  private watchPlayingBgm(): void {
    const bgm = this.options.bgm;
    if (!bgm) {
      return;
    }

    const sync = (): void => this.lobbyView.setPlayingBgmTrackId(bgm.getPlayingTrackId());
    sync();
    this.unsubscribeBgm?.();
    this.unsubscribeBgm = bgm.subscribe(sync);
  }

  private buildViewOptions(standingPlayback?: LobbyStandingPlayback): LobbyViewOptions {
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
    const volume = this.options.volume;
    const bgm = this.options.bgm;

    return {
      standingSources: STANDING_FILE_SUFFIXES.map((suffix) =>
        joinAssetUrl(
          this.options.assetBaseUrl,
          `${STANDING_PATH_PREFIX}/${leaderId}/${STANDING_FILE_STEM}${suffix}`,
        ),
      ),
      saveNameMaxLength: SAVE_NAME_MAX_LENGTH,
      saveName: this.options.session.saveName,
      leaderName: this.options.session.deck.leader.definition.name,
      resources: this.options.session.resources,
      menuItems,
      backgroundOptions: LOBBY_BACKGROUNDS.filter((background) =>
        this.options.session.lobby.ownedBackgroundIds.includes(background.id),
      ).map((background) => ({ id: background.id, name: background.name })),
      customization: this.toCustomizationModel(),
      standingPositionRange: LOBBY_STANDING_POSITION_X_RANGE,
      standingPositionYRange: LOBBY_STANDING_POSITION_Y_RANGE,
      standingScaleRange: LOBBY_STANDING_SCALE_RANGE,
      standingDefaults: {
        standingPositionX: DEFAULT_LOBBY_STANDING_POSITION_X,
        standingPositionY: DEFAULT_LOBBY_STANDING_POSITION_Y,
        standingScale: DEFAULT_LOBBY_STANDING_SCALE,
      },
      ...(volume
        ? {
            volume: {
              state: volume.getVolume(),
              onChange: (channel, patch) => volume.setVolume(channel, patch),
            },
          }
        : {}),
      ...(bgm
        ? {
            bgmTracks: bgm.listTracks(),
            onPlayBgmPreview: (trackIds: string[], mode: LobbyBgmPlayMode) =>
              bgm.play(trackIds, mode),
            onStopBgmPreview: () => bgm.stop(),
            onSkipBgm: (delta: 1 | -1) => bgm.skip(delta),
          }
        : {}),
      ...(standingPlayback ? { standingPlayback } : {}),
      onSaveName: (saveName: string) => void this.saveName(saveName),
      onSaveCustomization: (customization: LobbyCustomizationModel) =>
        void this.saveCustomization(customization),
      onBack: guard(() => this.options.onBack()),
      onLogout: () => void this.logout(),
    };
  }

  /** 저장 데이터가 고른 배경을 깐다. 카탈로그에 없으면 배경 없이 진행한다. */
  private async ensureBackground(): Promise<void> {
    await this.replaceBackground(this.options.session.lobby.selectedBackgroundId);
  }

  private async replaceBackground(backgroundId: string): Promise<boolean> {
    const requestGeneration = ++this.backgroundRequestGeneration;
    if (this.background && this.backgroundId === backgroundId) {
      return true;
    }

    const definition = findLobbyBackground(backgroundId);
    if (!definition) {
      return false;
    }

    const texture = await this.loadAsset<Texture>(
      `lobby.background.${definition.id}`,
      joinAssetUrl(this.options.assetBaseUrl, definition.path),
    );
    if (!texture || !this.active || requestGeneration !== this.backgroundRequestGeneration) {
      return false;
    }

    const nextBackground = new Sprite({ texture, label: 'lobby-background', eventMode: 'none' });
    const previousBackground = this.background;
    this.background = nextBackground;
    this.backgroundId = backgroundId;
    this.view.addChildAt(nextBackground, 0);
    if (this.layout) {
      this.layoutCanvas(this.layout);
    }
    if (previousBackground) {
      this.view.removeChild(previousBackground);
      previousBackground.destroy();
    }
    return true;
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

  private toCustomizationModel(): LobbyCustomizationModel {
    const {
      selectedBackgroundId,
      standingVisible,
      standingMediaType,
      standingPositionX,
      standingPositionY,
      standingScale,
      bgmTrackIds,
      bgmPlayMode,
    } = this.options.session.lobby;
    return {
      selectedBackgroundId,
      standingVisible,
      standingMediaType,
      standingPositionX,
      standingPositionY,
      standingScale,
      bgmTrackIds: [...bgmTrackIds],
      bgmPlayMode,
    };
  }

  private applySavedState(state: SaveSlotState): void {
    Object.assign(this.options.session, createGameSession(state));
  }

  private async saveName(value: string): Promise<void> {
    if (this.isSavingSettings || this.isLoggingOut || !this.active) {
      return;
    }

    let saveName: string;
    try {
      saveName = normalizeSaveName(value);
    } catch (error: unknown) {
      this.lobbyView.setSettingsStatus(error instanceof Error ? error.message : String(error));
      return;
    }
    if (saveName === this.options.session.saveName) {
      this.lobbyView.setSettingsStatus('저장 이름이 이미 같습니다.');
      return;
    }

    const previousSaveName = this.options.session.saveName;
    this.isSavingSettings = true;
    this.lobbyView.setBusy(true);
    this.lobbyView.setSettingsStatus('저장 이름을 저장하는 중입니다...');
    this.options.session.saveName = saveName;

    try {
      const savedState = await this.options.services.saveSlots.save(
        createSaveSlotStateFromGameSession(this.options.session),
      );
      if (!this.active) {
        return;
      }

      this.applySavedState(savedState);
      this.lobbyView.setSaveName(this.options.session.saveName);
      this.lobbyView.setSettingsStatus('저장 이름을 바꿨습니다.');
    } catch (error: unknown) {
      this.options.session.saveName = previousSaveName;
      this.lobbyView.setSaveName(previousSaveName);
      this.lobbyView.setSettingsStatus(error instanceof Error ? error.message : String(error));
    } finally {
      this.isSavingSettings = false;
      if (!this.isLoggingOut) {
        this.lobbyView.setBusy(false);
      }
    }
  }

  private async saveCustomization(customization: LobbyCustomizationModel): Promise<void> {
    if (this.isSavingSettings || this.isLoggingOut || !this.active) {
      return;
    }

    const previousLobby = structuredClone(this.options.session.lobby);
    let nextLobby: LobbyState;
    try {
      nextLobby = normalizeLobbyState({ ...previousLobby, ...customization });
    } catch (error: unknown) {
      this.lobbyView.setCustomization(this.toCustomizationModel());
      this.lobbyView.setCustomizationStatus(error instanceof Error ? error.message : String(error));
      return;
    }

    this.isSavingSettings = true;
    this.lobbyView.setBusy(true);
    this.lobbyView.setCustomizationStatus('로비 설정을 저장하는 중입니다...');

    try {
      if (!(await this.replaceBackground(nextLobby.selectedBackgroundId))) {
        throw new Error('선택한 로비 배경을 불러오지 못했습니다.');
      }

      this.options.session.lobby = nextLobby;
      const savedState = await this.options.services.saveSlots.save(
        createSaveSlotStateFromGameSession(this.options.session),
      );
      if (!this.active) {
        return;
      }

      this.applySavedState(savedState);
      this.lobbyView.setCustomization(this.toCustomizationModel());
      this.lobbyView.setCustomizationStatus('로비 설정을 저장했습니다.');
    } catch (error: unknown) {
      this.options.session.lobby = previousLobby;
      this.lobbyView.setCustomization(this.toCustomizationModel());
      await this.replaceBackground(previousLobby.selectedBackgroundId);
      this.lobbyView.setCustomizationStatus(error instanceof Error ? error.message : String(error));
    } finally {
      this.isSavingSettings = false;
      if (!this.isLoggingOut) {
        this.lobbyView.setBusy(false);
      }
    }
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
