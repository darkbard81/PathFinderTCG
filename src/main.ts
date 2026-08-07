import { DomLayer } from './dom/DomLayer';
import { createPixiApp } from './pixi/app/create-app';
import { ASSET_BASE_URL } from './pixi/app/runtime-config';
import { formatPreloadSummary } from './pixi/assets/asset-loader';
import { loadThemeFont } from './pixi/assets/theme-font';
import { LoaderScene } from './pixi/scenes/LoaderScene';
import { SceneRouter } from './pixi/scenes/SceneRouter';
import { ViewportProbeScene } from './pixi/scenes/ViewportProbeScene';

void (async (): Promise<void> => {
  const mount = document.querySelector<HTMLDivElement>('#app');

  if (!mount) {
    throw new Error('#app element not found');
  }

  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  document.body.style.background = '#071018';
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
  // 로딩 화면부터 테마 글꼴로 보이도록 첫 화면 전에 받는다. 실패해도 폴백으로 진행한다.
  await loadThemeFont(ASSET_BASE_URL);

  await router.goto(
    new LoaderScene({
      assetBaseUrl: ASSET_BASE_URL,
      onComplete: (result) => {
        void router.goto(new ViewportProbeScene({ preloadSummary: formatPreloadSummary(result) }));
      },
    }),
  );
})().catch((error: unknown) => {
  console.error('PathfinderTCG bootstrap failed.', error);
});
