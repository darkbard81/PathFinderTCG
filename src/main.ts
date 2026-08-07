import { DomLayer } from './dom/DomLayer';
import { loadThemeFont } from './dom/theme-font';
import { joinAssetUrl } from './game/assets/manifest';
import type { GameSession } from './game/save/session';
import { createPixiApp } from './pixi/app/create-app';
import { ASSET_BASE_URL } from './pixi/app/runtime-config';
import { LoaderScene } from './pixi/scenes/LoaderScene';
import { MainMenuScene } from './pixi/scenes/MainMenuScene';
import { SaveSlotScene } from './pixi/scenes/SaveSlotScene';
import { SceneRouter } from './pixi/scenes/SceneRouter';
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
          void showMainMenu(result.loadedCount, result.failedCount);
        },
      }),
    );
  }

  function showMainMenu(loadedCount: number, failedCount: number): Promise<void> {
    return router.goto(
      new MainMenuScene({
        services,
        backgroundImageUrl,
        loadedCount,
        failedCount,
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
        // 원본과 같이 Back은 MainMenu로 돌아가며, 재진입 시 로딩 요약은 0으로 둔다.
        onBack: () => {
          void showMainMenu(0, 0);
        },
        onLoggedOut: (message) => {
          void showTitle(message);
        },
        onSessionReady: (session) => {
          void showSessionPending(session);
        },
      }),
    );
  }

  // Stage 화면 이식 전 임시 착지점. 세션이 준비됐다는 것만 확인한다.
  function showSessionPending(session: GameSession): Promise<void> {
    return router.goto(
      new ViewportProbeScene({
        preloadSummary: [
          `Save ready · Slot ${session.slotId} · ${session.saveName}`,
          `Leader ${session.deck.leader.instance.name}`,
        ].join('\n'),
      }),
    );
  }

  await showTitle();
})().catch((error: unknown) => {
  console.error('PathfinderTCG bootstrap failed.', error);
});
