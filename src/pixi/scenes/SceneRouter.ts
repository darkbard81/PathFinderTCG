import type { Container, Ticker } from 'pixi.js';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

type UpdateCallback = (ticker: Ticker) => void;

/**
 * 라우터가 화면 크롬을 붙이고 떼기 위해 필요한 최소 계약이다.
 * 실제 구현은 `src/dom/DomLayer.ts`이며, 테스트는 이 계약만 만족시키면 된다.
 */
export type SceneDomLayer = {
  mount(element: HTMLElement | undefined): void;
  unmount(): void;
};

/**
 * 하나의 활성 화면을 소유하며 비동기 화면 교체를 호출 순서대로 직렬화한다.
 */
export class SceneRouter {
  private currentScene: Scene | null = null;
  private currentUpdate: UpdateCallback | null = null;
  private layout: ViewportLayout;
  private transitionQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly root: Container,
    private readonly ticker: Ticker,
    initialLayout: ViewportLayout,
    private readonly domLayer?: SceneDomLayer,
  ) {
    this.layout = initialLayout;
  }

  /**
   * 기존 화면을 완전히 종료한 뒤 새 화면을 붙인다.
   * 동시에 호출된 전환은 앞선 전환의 성공 여부와 무관하게 호출 순서대로 실행된다.
   */
  public goto(scene: Scene): Promise<void> {
    const transition = this.transitionQueue.then(() => this.replaceScene(scene));
    this.transitionQueue = transition.catch(() => undefined);

    return transition;
  }

  /** 활성 화면에 새 논리 영역을 전달하고 다음 화면을 위해 마지막 값을 기억한다. */
  public resize(layout: ViewportLayout): void {
    this.layout = layout;
    this.currentScene?.resize(layout);
  }

  private async replaceScene(scene: Scene): Promise<void> {
    if (this.currentScene === scene) {
      return;
    }

    const previousScene = this.currentScene;
    const previousUpdate = this.currentUpdate;
    this.currentScene = null;
    this.currentUpdate = null;

    if (previousScene) {
      let exitError: unknown;

      try {
        await previousScene.exit?.();
      } catch (error) {
        exitError = error;
      }

      if (previousUpdate) {
        this.ticker.remove(previousUpdate);
      }
      this.domLayer?.unmount();
      this.root.removeChild(previousScene.view);
      previousScene.view.destroy({ children: true });

      if (exitError !== undefined) {
        throw exitError;
      }
    }

    this.root.addChild(scene.view);
    this.domLayer?.mount(scene.element);
    this.currentScene = scene;
    scene.resize(this.layout);
    await scene.enter?.();

    if (scene.update) {
      const update: UpdateCallback = (ticker) => scene.update?.(ticker);
      this.currentUpdate = update;
      this.ticker.add(update);
    }
  }
}
