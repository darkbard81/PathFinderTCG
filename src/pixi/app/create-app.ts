import { Application, Container } from 'pixi.js';
import { UI_THEME } from '../../theme';
import { resolveViewportLayout, type ViewportLayout, type ViewportSize } from './viewport';
import { observeViewport } from './viewport-observer';

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
 *
 * 캔버스 크기는 `window`가 아니라 `mount`에서 잰다. `mount`는 안전영역을 뺀
 * 상자라(`src/app.css`) 회전으로 안전영역이 바뀌면 잰 값도 같이 바뀐다.
 * Pixi의 `resizeTo`는 `window`의 `resize`만 듣는데 iOS 회전 직후 그 값이 아직
 * 예전 방향이라 잘못된 크기로 굳는다. 그래서 쓰지 않고 직접 관찰한다.
 */
export async function createPixiApp(mount: HTMLElement): Promise<CreatedPixiApp> {
  const app = new Application();
  const measure = (): ViewportSize => {
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    return width > 0 && height > 0
      ? { width, height }
      : { width: window.innerWidth, height: window.innerHeight };
  };
  const initialSize = measure();

  await app.init({
    width: initialSize.width,
    height: initialSize.height,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio,
    background: UI_THEME.colors.background.canvas,
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

  const unobserveViewport = observeViewport({
    host: window,
    measure,
    onChange: (size) => {
      app.renderer.resize(size.width, size.height);
    },
  });

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
      unobserveViewport();
      app.renderer.off('resize', handleResize);
      subscribers.clear();
      app.destroy(
        { removeView: true, releaseGlobalResources: true },
        { children: true, texture: true, textureSource: true },
      );
    },
  };
}
