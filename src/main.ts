import { DomLayer } from './dom/DomLayer';
import { loadThemeFont } from './dom/theme-font';
import { joinAssetUrl } from './game/assets/manifest';
import type { GameSession } from './game/save/session';
import { createPixiApp } from './pixi/app/create-app';
import { ASSET_BASE_URL } from './pixi/app/runtime-config';
import { DeckBuildScene } from './pixi/scenes/DeckBuildScene';
import { LoaderScene } from './pixi/scenes/LoaderScene';
import { MainMenuScene } from './pixi/scenes/MainMenuScene';
import { SaveSlotScene } from './pixi/scenes/SaveSlotScene';
import { SceneRouter } from './pixi/scenes/SceneRouter';
import { StageScene } from './pixi/scenes/StageScene';
import { TitleScene } from './pixi/scenes/TitleScene';
import { ViewportProbeScene } from './pixi/scenes/ViewportProbeScene';
import { createGameServices } from './services/game-services';
import { UI_THEME } from './theme';

const TITLE_BACKGROUND_PATH = 'ui/title-screen.png';

void (async (): Promise<void> => {
  const mount = document.querySelector<HTMLDivElement>('#app');

  if (!mount) {
    throw new Error('#app element not found');
  }

  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  document.body.style.background = UI_THEME.colors.background.css;
  mount.style.width = '100vw';
  mount.style.height = '100vh';
  mount.style.position = 'relative';

  const pixi = await createPixiApp();
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
  const services = createGameServices({
    onSessionExpired: (message) => {
      void showTitle(message);
    },
  });

  function showTitle(statusMessage?: string): Promise<void> {
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
          void showStage(session);
        },
      }),
    );
  }

  function showStage(session: GameSession): Promise<void> {
    return router.goto(
      new StageScene({
        services,
        backgroundImageUrl,
        session,
        onBack: () => {
          void showSaveSlot();
        },
        onDeck: (currentSession) => {
          void showDeckBuild(currentSession);
        },
        onLoggedOut: (message) => {
          void showTitle(message);
        },
        onStartBattle: (nextSession, stageId) => {
          void showBattlePending(nextSession, stageId);
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
          void showStage(nextSession);
        },
      }),
    );
  }

  // Battlefield 이식 전 임시 착지점.
  function showBattlePending(session: GameSession, stageId: string): Promise<void> {
    return router.goto(
      new ViewportProbeScene({
        preloadSummary: [
          `Battle ready · Stage ${stageId}`,
          `Slot ${session.slotId} · ${session.saveName}`,
          `Leader ${session.deck.leader.instance.name}`,
        ].join('\n'),
      }),
    );
  }

  await showTitle();
})().catch((error: unknown) => {
  console.error('PathfinderTCG bootstrap failed.', error);
});
