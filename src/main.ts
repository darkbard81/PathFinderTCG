import { createPixiApp } from './pixi/app/create-app';
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

  const pixi = await createPixiApp();
  const router = new SceneRouter(pixi.stageRoot, pixi.app.ticker, pixi.layout);

  mount.replaceChildren(pixi.app.canvas);
  pixi.subscribeViewport((layout) => router.resize(layout));
  await router.goto(new ViewportProbeScene());
})().catch((error: unknown) => {
  console.error('PathfinderTCG bootstrap failed.', error);
});
