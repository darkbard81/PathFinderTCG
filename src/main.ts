import './app.css';
import { DomLayer } from './dom/DomLayer';
import { buildCardArtUrl } from './dom/screens/card-tile';
import { loadThemeFont } from './dom/theme-font';
import { warmImages } from './dom/warm-images';
import { fetchAssetsManifest, joinAssetUrl } from './game/assets/manifest';
import type { GameSession } from './game/save/session';
import type { BgmTrack, VoiceTrack } from './game/sound/playlist';
import {
  findSoundTrack,
  loadBgmPlaylist,
  loadVoicePlaylist,
  type SoundTrackSource,
} from './game/sound/playlist-loader';
import { MAIN_MENU_VOICE_TRACK_ID, selectMainBgmTrack } from './game/sound/sound-cues';
import { SoundPlayer } from './game/sound/sound-player';
import { unlockSoundOnGesture } from './game/sound/unlock-on-gesture';
import { loadVolumeState, saveVolumeState } from './game/sound/volume-storage';
import { WebAudioBackend } from './game/sound/web-audio-backend';
import { resolveStageBgmId } from './game/stage/stage-bgm';
import { findStageDefinition } from './game/stage/stage-definitions';
import type { StageBattleResult } from './game/stage/types';
import { createPixiApp } from './pixi/app/create-app';
import { ASSET_BASE_URL } from './pixi/app/runtime-config';
import {
  BattlefieldScene,
  DEFAULT_BATTLEFIELD_PLAYBACK_RATE,
} from './pixi/scenes/BattlefieldScene';
import { DeckBuildScene } from './pixi/scenes/DeckBuildScene';
import { EquipmentScene } from './pixi/scenes/EquipmentScene';
import { GrowthScene } from './pixi/scenes/GrowthScene';
import { LoaderScene } from './pixi/scenes/LoaderScene';
import { LobbyScene } from './pixi/scenes/LobbyScene';
import { MainMenuScene } from './pixi/scenes/MainMenuScene';
import { SaveSlotScene } from './pixi/scenes/SaveSlotScene';
import { SceneRouter } from './pixi/scenes/SceneRouter';
import { StageScene } from './pixi/scenes/StageScene';
import { TitleScene } from './pixi/scenes/TitleScene';
import { createGameServices } from './services/game-services';
import { UI_THEME } from './theme';

const TITLE_BACKGROUND_PATH = 'ui/title-screen.png';

void (async (): Promise<void> => {
  const mount = document.querySelector<HTMLDivElement>('#app');

  if (!mount) {
    throw new Error('#app element not found');
  }

  document.body.style.background = UI_THEME.colors.background.css;

  const pixi = await createPixiApp(mount);
  mount.replaceChildren(pixi.app.canvas);

  const domLayer = new DomLayer(mount);
  const router = new SceneRouter(pixi.stageRoot, pixi.app.ticker, pixi.layout, domLayer);

  pixi.subscribeViewport((layout) => {
    domLayer.applyLayout(layout);
    router.resize(layout);
  });

  // 타이틀 화면부터 테마 글꼴로 보이도록 첫 화면 전에 받는다. 실패해도 폴백으로 진행한다.
  await loadThemeFont();

  const backgroundImageUrl = joinAssetUrl(ASSET_BASE_URL, TITLE_BACKGROUND_PATH);
  let preloadCounts = { loadedCount: 0, failedCount: 0 };
  const lobbyStandingPlayback = {
    source: '',
    currentTime: 0,
  };
  let battlePlaybackRate: number = DEFAULT_BATTLEFIELD_PLAYBACK_RATE;
  const services = createGameServices({
    onSessionExpired: (message) => {
      void showTitle(message);
    },
  });

  /*
   * 소리는 화면이 아니라 앱이 들고 있다.
   * Main BGM은 로그인부터 로비까지 다섯 화면을 넘나드는 동안 끊기면 안 되는데,
   * Scene 수명에 묶으면 화면을 옮길 때마다 곡이 처음으로 돌아간다.
   *
   * 어느 단계가 실패해도 조용히 넘어간다. 소리가 없다고 게임이 멈추면 안 된다.
   */
  const soundPlayer = createSoundPlayer();
  let mainBgmTrack: SoundTrackSource<BgmTrack> | null = null;
  let mainMenuVoiceTrack: SoundTrackSource<VoiceTrack> | null = null;
  /** BGM 플레이리스트 전체다. 로비가 이 중에서 자기 목록을 고른다. */
  let bgmTracks: SoundTrackSource<BgmTrack>[] = [];
  /** 재생 곡이 바뀔 때 알릴 곳이다. 지금은 로비 BGM 탭 하나가 듣는다. */
  const bgmTrackListeners = new Set<() => void>();

  if (soundPlayer) {
    // AudioContext는 잠긴 채로 시작한다. 첫 입력에서 풀고, 풀릴 때까지 계속 듣는다.
    unlockSoundOnGesture({ target: window, unlock: () => soundPlayer.unlock() });
    void loadSoundPlaylists();
  }

  function createSoundPlayer(): SoundPlayer | null {
    try {
      return new SoundPlayer({
        backend: new WebAudioBackend(),
        // 볼륨은 기기에 저장한다. 슬롯을 따라다니면 안 되는 값이다.
        volume: loadVolumeState(),
        onVolumeChange: (state) => saveVolumeState(state),
        onError: (message, error) => console.warn(`[sound] ${message}`, error),
        onBgmTrackChange: () => {
          for (const listener of bgmTrackListeners) {
            listener();
          }
        },
      });
    } catch (error: unknown) {
      console.warn('소리를 켜지 못했습니다. 소리 없이 진행합니다.', error);
      return null;
    }
  }

  /**
   * 소리 플레이리스트를 받아 쓸 트랙을 골라 둔다.
   *
   * 프리로드와 따로 assets.json을 받는다. Main BGM은 로그인 화면부터 흘러야 하는데
   * 프리로드는 로그인 뒤에야 돌기 때문이다. 목록은 여기서 한 번만 받아 두 채널이
   * 나눠 쓴다. manifest는 `no-cache`라 프리로드가 다시 물어도 304로 끝난다.
   *
   * 채널마다 따로 감싼다. 한쪽이 없다고 다른 쪽까지 잃지 않는다.
   */
  async function loadSoundPlaylists(): Promise<void> {
    let manifest;
    try {
      manifest = await fetchAssetsManifest(ASSET_BASE_URL);
    } catch (error: unknown) {
      console.warn('자산 목록을 받지 못해 소리를 켜지 못했습니다.', error);
      return;
    }

    try {
      const playlist = await loadBgmPlaylist({ assetBaseUrl: ASSET_BASE_URL, manifest });
      if (playlist.missingTrackIds.length > 0) {
        console.warn(`자산이 없어 뺀 BGM: ${playlist.missingTrackIds.join(', ')}`);
      }

      bgmTracks = playlist.tracks;
      mainBgmTrack = selectMainBgmTrack(playlist);
      requestMainBgm();
    } catch (error: unknown) {
      console.warn('BGM 플레이리스트를 불러오지 못했습니다.', error);
    }

    try {
      const playlist = await loadVoicePlaylist({ assetBaseUrl: ASSET_BASE_URL, manifest });
      if (playlist.missingTrackIds.length > 0) {
        console.warn(`[sound] 자산이 없어 뺀 대사: ${playlist.missingTrackIds.join(', ')}`);
      }

      mainMenuVoiceTrack = findSoundTrack(playlist, MAIN_MENU_VOICE_TRACK_ID);
      if (!mainMenuVoiceTrack) {
        // 목록은 읽었는데 쓸 id가 없다. 오타이거나 자산이 아직 안 들어온 것이다.
        console.warn(
          `[sound] 대사 목록에 ${MAIN_MENU_VOICE_TRACK_ID}가 없습니다. 있는 것: ${playlist.tracks
            .map((track) => track.id)
            .join(', ')}`,
        );
      }
    } catch (error: unknown) {
      console.warn('[sound] 대사 플레이리스트를 불러오지 못했습니다.', error);
    }
  }

  /**
   * 이 화면이 Main BGM을 원한다고 알린다.
   * 이미 그 곡이 울리고 있으면 재생기가 아무것도 하지 않는다.
   */
  function requestMainBgm(): void {
    if (!mainBgmTrack) {
      return;
    }

    soundPlayer?.requestBgm(mainBgmTrack);
  }

  /** 저장된 곡 id를 실제 트랙으로 바꾼다. 자산에서 사라진 id는 조용히 버린다. */
  function resolveBgmTracks(trackIds: readonly string[]): SoundTrackSource<BgmTrack>[] {
    const byId = new Map(bgmTracks.map((track) => [track.id, track]));
    return trackIds.flatMap((trackId) => {
      const track = byId.get(trackId);
      return track ? [track] : [];
    });
  }

  /**
   * 로비가 원하는 BGM을 건다.
   *
   * 고른 곡이 있으면 그 목록으로 넘어가고, 비어 있으면 Main BGM을 그대로 둔다.
   * 로비를 드나들어도 같은 목록이면 재생기가 되감지 않는다.
   */
  function requestLobbyBgm(session: GameSession): void {
    const tracks = resolveBgmTracks(session.lobby.bgmTrackIds);
    if (tracks.length === 0) {
      requestMainBgm();
      return;
    }

    soundPlayer?.requestBgmPlaylist(tracks, session.lobby.bgmPlayMode);
  }

  function showTitle(statusMessage?: string): Promise<void> {
    requestMainBgm();
    return router.goto(
      new TitleScene({
        services,
        backgroundImageUrl,
        onAuthenticated: () => void showLoader(),
        ...(statusMessage ? { statusMessage } : {}),
      }),
    );
  }

  function showLoader(): Promise<void> {
    requestMainBgm();
    return router.goto(
      new LoaderScene({
        assetBaseUrl: ASSET_BASE_URL,
        onComplete: (result) => {
          // 프리로드는 세션당 한 번이다. 메뉴로 되돌아와도 같은 요약을 보여준다.
          preloadCounts = { loadedCount: result.loadedCount, failedCount: result.failedCount };
          void showMainMenu();
        },
      }),
    );
  }

  function showMainMenu(): Promise<void> {
    requestMainBgm();
    /*
     * 메뉴에 들어설 때마다 한 번 흐른다. 슬롯에서 되돌아와도 다시 난다.
     *
     * 소리 잠금이 아직 안 풀렸어도 부른다. 재생기가 담아 두었다가 첫 입력에서 낸다.
     * 쿠키 세션이 살아 있으면 로그인 화면이 입력 없이 지나가 여기까지 제스처가
     * 한 번도 없을 수 있다.
     */
    if (mainMenuVoiceTrack) {
      void soundPlayer?.playVoice(mainMenuVoiceTrack);
    } else if (soundPlayer) {
      // 목록을 아직 못 받았거나 못 읽은 것이다. 위쪽 경고에 이유가 남아 있다.
      console.warn('[sound] 메뉴 대사가 준비되지 않아 건너뜁니다.');
    }
    return router.goto(
      new MainMenuScene({
        services,
        backgroundImageUrl,
        loadedCount: preloadCounts.loadedCount,
        failedCount: preloadCounts.failedCount,
        onStartGame: () => {
          void showSaveSlot();
        },
        onLoggedOut: (message) => {
          void showTitle(message);
        },
      }),
    );
  }

  function showSaveSlot(): Promise<void> {
    requestMainBgm();
    return router.goto(
      new SaveSlotScene({
        services,
        backgroundImageUrl,
        onBack: () => {
          void showMainMenu();
        },
        onLoggedOut: (message) => {
          void showTitle(message);
        },
        onSessionReady: (session) => {
          warmOwnedCardArt(session);
          void showLobby(session);
        },
      }),
    );
  }

  /**
   * 슬롯을 고른 순간 보유 카드 그림을 배경에서 받아 둔다.
   *
   * 부팅 프리로드는 UI만 받는다. 어느 카드를 볼지는 슬롯을 골라야 정해지는데,
   * 그 답이 나오는 자리가 여기다. 기다리지 않는다. 로비는 바로 열리고, 아직 안 온
   * 그림은 카드 뒷면이 대신 지킨다.
   *
   * 덱의 리더는 컬렉션에 없을 수 있어 따로 넣는다. 같은 주소는 받는 쪽에서 한 번만 받는다.
   */
  function warmOwnedCardArt(session: GameSession): void {
    const cards = [...session.collection.cards, session.deck.leader, ...session.deck.cards];

    void warmImages(cards.map((card) => buildCardArtUrl(ASSET_BASE_URL, card.definition.id)));
  }

  function showLobby(session: GameSession): Promise<void> {
    requestLobbyBgm(session);
    return router.goto(
      new LobbyScene({
        services,
        assetBaseUrl: ASSET_BASE_URL,
        session,
        ...(soundPlayer
          ? {
              bgm: {
                listTracks: () => bgmTracks.map((track) => ({ id: track.id, title: track.title })),
                play: (trackIds, mode) =>
                  soundPlayer.requestBgmPlaylist(resolveBgmTracks(trackIds), mode),
                // 미리듣기를 멈추면 현재 BGM을 끈다. 다시 로비에 들어오면 저장된 설정으로 시작한다.
                stop: () => soundPlayer.requestBgm(null),
                skip: (delta) => soundPlayer.skipBgm(delta),
                getPlayingTrackId: () => soundPlayer.getPlayingBgmId(),
                subscribe: (listener) => {
                  bgmTrackListeners.add(listener);
                  return () => bgmTrackListeners.delete(listener);
                },
              },
            }
          : {}),
        onBack: () => {
          void showSaveSlot();
        },
        onPlay: (currentSession) => {
          void showStage(currentSession);
        },
        onDeck: (currentSession) => {
          void showDeckBuild(currentSession);
        },
        onEquipment: (currentSession) => {
          void showEquipment(currentSession);
        },
        onGrowth: (currentSession) => {
          void showGrowth(currentSession);
        },
        standingPlayback: lobbyStandingPlayback,
        ...(soundPlayer ? { volume: soundPlayer } : {}),
        onLoggedOut: (message) => {
          void showTitle(message);
        },
      }),
    );
  }

  /**
   * 전투에서 흘릴 곡을 건다.
   *
   * 스테이지가 정한 곡이 없으면 아무것도 하지 않는다. 흐르던 곡이 그대로 이어진다.
   * 한 곡을 반복하므로 로비 목록과 달리 `requestBgm`을 쓴다.
   */
  function requestStageBattleBgm(session: GameSession, stageId: string): void {
    const stage = findStageDefinition(stageId);
    if (!stage || bgmTracks.length === 0) {
      return;
    }

    const playable = new Set(bgmTracks.map((track) => track.id));
    const trackId = resolveStageBgmId(stage, session.stageProgress, (id) => playable.has(id));
    const track = bgmTracks.find((candidate) => candidate.id === trackId);
    if (track) {
      soundPlayer?.requestBgm(track);
    }
  }

  function showStage(session: GameSession, lastBattleResult?: StageBattleResult): Promise<void> {
    // 스테이지 선택은 아직 전투 밖이다. 로비에서 흐르던 것으로 돌아간다.
    requestLobbyBgm(session);
    return router.goto(
      new StageScene({
        services,
        backgroundImageUrl,
        session,
        bgmTracks: bgmTracks.map((track) => ({ id: track.id, title: track.title })),
        ...(lastBattleResult ? { lastBattleResult } : {}),
        onBack: (currentSession) => {
          void showLobby(currentSession);
        },
        onStartBattle: (nextSession, stageId) => {
          void showBattlefield(nextSession, stageId);
        },
      }),
    );
  }

  function showDeckBuild(session: GameSession): Promise<void> {
    return router.goto(
      new DeckBuildScene({
        services,
        backgroundImageUrl,
        assetBaseUrl: ASSET_BASE_URL,
        session,
        // 저장했다면 갱신된 세션으로, 아니면 들어올 때 세션으로 Stage에 돌아간다.
        onBack: (nextSession) => {
          void showLobby(nextSession);
        },
      }),
    );
  }

  function showEquipment(session: GameSession): Promise<void> {
    return router.goto(
      new EquipmentScene({
        services,
        backgroundImageUrl,
        assetBaseUrl: ASSET_BASE_URL,
        session,
        onBack: (nextSession) => {
          void showLobby(nextSession);
        },
      }),
    );
  }

  function showGrowth(session: GameSession): Promise<void> {
    return router.goto(
      new GrowthScene({
        services,
        backgroundImageUrl,
        assetBaseUrl: ASSET_BASE_URL,
        session,
        onBack: (nextSession) => {
          void showLobby(nextSession);
        },
      }),
    );
  }

  function showBattlefield(session: GameSession, stageId: string): Promise<void> {
    requestStageBattleBgm(session, stageId);
    return router.goto(
      new BattlefieldScene({
        services,
        backgroundImageUrl,
        assetBaseUrl: ASSET_BASE_URL,
        session,
        stageId,
        playbackRate: battlePlaybackRate,
        onPlaybackRateChange: (playbackRate) => {
          battlePlaybackRate = playbackRate;
        },
        // 전투가 끝났으면 보상까지 반영해 저장한 세션이 돌아온다. 결과는 Stage가 요약으로 보여준다.
        onLeave: (nextSession, result) => {
          void showStage(nextSession, result ?? undefined);
        },
      }),
    );
  }

  await showTitle();
})().catch((error: unknown) => {
  console.error('Arcane Frontier TCG bootstrap failed.', error);
});
