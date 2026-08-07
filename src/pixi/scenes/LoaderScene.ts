// TODO: 4단계 UiFactory 도입 시 진행률 바와 텍스트를 Factory 경계로 옮긴다.
import { Container, Graphics, Text } from 'pixi.js';
import {
  formatPreloadSummary,
  preloadManifestAssets,
  type PreloadResult,
} from '../assets/asset-loader';
import { MIN_VIEWPORT_HEIGHT, MIN_VIEWPORT_WIDTH, type ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

export type LoaderSceneOptions = {
  assetBaseUrl: string;
  onComplete: (result: PreloadResult) => void;
};

const BAR_WIDTH_RATIO = 0.55;
const BAR_HEIGHT = 20;

/**
 * `assets.json`을 읽어 부팅 자산을 받는 동안 진행률과 상태를 표시하는 화면이다.
 * 일부 자산이 실패해도 흐름을 끊지 않고 집계 결과와 함께 다음 화면으로 넘긴다.
 */
export class LoaderScene implements Scene {
  public readonly view = new Container({ label: 'loader' });

  private readonly track = new Graphics({ label: 'progress-track' });
  private readonly fill = new Graphics({ label: 'progress-fill' });
  private readonly title = new Text({
    text: 'Loading archive',
    style: { fontFamily: 'monospace', fontSize: 40, fill: '#d7f7ff' },
    anchor: 0.5,
  });
  private readonly status = new Text({
    text: 'Requesting assets.json',
    style: { fontFamily: 'monospace', fontSize: 20, fill: '#8fb6c4', align: 'center' },
    anchor: 0.5,
  });
  private readonly percent = new Text({
    text: '0%',
    style: { fontFamily: 'monospace', fontSize: 24, fill: '#5de4ff' },
    anchor: 0.5,
  });

  private layout: ViewportLayout = {
    scale: 1,
    width: MIN_VIEWPORT_WIDTH,
    height: MIN_VIEWPORT_HEIGHT,
  };
  private ratio = 0;

  public constructor(private readonly options: LoaderSceneOptions) {
    this.view.addChild(this.track, this.fill, this.title, this.status, this.percent);
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
        onStatus: (message) => this.setStatus(message),
        onProgress: (ratio) => this.setProgress(ratio),
      });
      this.setProgress(1);
      this.setStatus(formatPreloadSummary(result));
    } catch (error) {
      this.setStatus(formatError(error));
    }

    this.options.onComplete(result);
  }

  /** 논리 영역 중앙을 기준으로 제목, 진행률 바, 상태 텍스트를 다시 배치한다. */
  public resize(layout: ViewportLayout): void {
    this.layout = layout;

    const centerX = layout.width / 2;
    const barWidth = layout.width * BAR_WIDTH_RATIO;
    const barLeft = centerX - barWidth / 2;
    const barTop = layout.height / 2;

    this.track
      .clear()
      .rect(barLeft, barTop, barWidth, BAR_HEIGHT)
      .fill({ color: '#12252e' })
      .stroke({ color: '#285866', width: 2, alignment: 1 });

    this.title.position.set(centerX, barTop - 96);
    this.status.position.set(centerX, barTop + BAR_HEIGHT + 40);
    this.percent.position.set(centerX, barTop + BAR_HEIGHT + 76);
    this.drawFill();
  }

  private setProgress(ratio: number): void {
    this.ratio = Math.min(1, Math.max(0, ratio));
    this.percent.text = `${Math.round(this.ratio * 100)}%`;
    this.drawFill();
  }

  private setStatus(message: string): void {
    this.status.text = message;
  }

  private drawFill(): void {
    const barWidth = this.layout.width * BAR_WIDTH_RATIO;
    const barLeft = this.layout.width / 2 - barWidth / 2;
    const barTop = this.layout.height / 2;

    this.fill.clear();

    if (this.ratio > 0) {
      this.fill.rect(barLeft, barTop, barWidth * this.ratio, BAR_HEIGHT).fill({ color: '#5de4ff' });
    }
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
