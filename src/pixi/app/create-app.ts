import { Application, Container } from 'pixi.js';
import { resolveViewportLayout, type ViewportLayout } from './viewport';

export type ViewportSubscriber = (layout: ViewportLayout) => void;

export type CreatedPixiApp = {
  app: Application;
  stageRoot: Container;
  layout: ViewportLayout;
  subscribeViewport(subscriber: ViewportSubscriber): () => void;
  destroy(): void;
};

/**
 * Pixi 애플리케이션을 초기화하고 renderer resize 이후에 논리 viewport를 동기화한다.
 * 반환된 정리 함수는 resize 구독과 캔버스를 포함한 애플리케이션 자원을 해제한다.
 */
export async function createPixiApp(): Promise<CreatedPixiApp> {
  const app = new Application();

  await app.init({
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio,
    background: '#071018',
    preference: 'webgl',
  });

  const stageRoot = new Container({ isRenderGroup: true, label: 'stage-root' });
  const subscribers = new Set<ViewportSubscriber>();
  let layout = resolveViewportLayout({ width: app.screen.width, height: app.screen.height });

  app.stage.addChild(stageRoot);
  applyLayout(layout);

  const handleResize = (width: number, height: number): void => {
    layout = resolveViewportLayout({ width, height });
    applyLayout(layout);

    for (const subscriber of subscribers) {
      subscriber(layout);
    }
  };

  app.renderer.on('resize', handleResize);

  function applyLayout(nextLayout: ViewportLayout): void {
    stageRoot.scale.set(nextLayout.scale);
  }

  return {
    app,
    stageRoot,
    get layout() {
      return layout;
    },
    subscribeViewport(subscriber) {
      subscribers.add(subscriber);
      subscriber(layout);

      return () => {
        subscribers.delete(subscriber);
      };
    },
    destroy() {
      app.renderer.off('resize', handleResize);
      subscribers.clear();
      app.destroy(
        { removeView: true, releaseGlobalResources: true },
        { children: true, texture: true, textureSource: true },
      );
    },
  };
}
