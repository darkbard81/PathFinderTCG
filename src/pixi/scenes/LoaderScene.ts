import { Container } from 'pixi.js';
import {
  createLoaderView,
  type LoaderView,
  type LoaderViewModel,
} from '../../dom/screens/loader-view';
import {
  formatPreloadSummary,
  preloadManifestAssets,
  type PreloadResult,
} from '../assets/asset-loader';
import type { Scene } from './scene';

export type LoaderSceneOptions = {
  assetBaseUrl: string;
  onComplete: (result: PreloadResult) => void;
  view?: LoaderView;
};

/**
 * `assets.json`을 읽어 부팅 자산을 받는 동안 진행률과 상태를 표시하는 화면이다.
 * 표현은 DOM 오버레이가 담당하므로 캔버스 노드는 비어 있다.
 */
export class LoaderScene implements Scene {
  public readonly view = new Container({ label: 'loader' });
  public readonly element: HTMLElement;

  private readonly loaderView: LoaderView;
  private progress = 0;
  private status = 'Requesting assets.json';

  public constructor(private readonly options: LoaderSceneOptions) {
    this.loaderView = options.view ?? createLoaderView();
    this.element = this.loaderView.element;
    this.renderView();
  }

  /** manifest 로딩을 시작하고, 실패하더라도 집계 결과를 만들어 흐름을 이어간다. */
  public async enter(): Promise<void> {
    let result: PreloadResult = {
      totalCount: 0,
      loadedCount: 0,
      failedCount: 0,
      failedAliases: [],
    };

    try {
      result = await preloadManifestAssets(this.options.assetBaseUrl, {
        onStatus: (message) => this.renderView({ status: message }),
        onProgress: (ratio) => this.renderView({ progress: ratio }),
      });
      this.renderView({ progress: 1, status: formatPreloadSummary(result) });
    } catch (error) {
      this.renderView({ status: formatError(error) });
    }

    this.options.onComplete(result);
  }

  /** 배치는 CSS와 오버레이 루트가 담당하므로 좌표 계산이 필요 없다. */
  public resize(): void {
    // 의도적으로 비어 있다.
  }

  private renderView(patch: Partial<LoaderViewModel> = {}): void {
    this.progress = patch.progress ?? this.progress;
    this.status = patch.status ?? this.status;
    this.loaderView.render({ progress: this.progress, status: this.status });
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
