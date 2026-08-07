// TODO: 5단계 실제 화면 이식 시 제거할 임시 viewport 확인 화면이다.
// 진단 전용이라 테마에 없는 색을 직접 쓴다. 이 파일에만 적용되는 예외이며,
// 이 색들을 위해 theme.ts에 토큰을 추가하지 않는다.
import { Container, Graphics, Text } from 'pixi.js';
import { createProbeView, type ProbeView } from '../../dom/screens/probe-view';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

export type ViewportProbeSceneOptions = {
  /** 로딩 화면이 전달한 자산 프리로드 요약이다. 없으면 표시하지 않는다. */
  preloadSummary?: string;
};

/**
 * 1단계의 반응형 논리 영역과 루트 배율을 눈으로 검증하는 임시 개발 화면이다.
 */
export class ViewportProbeScene implements Scene {
  public readonly view = new Container({ isRenderGroup: true, label: 'viewport-probe' });
  private readonly guides = new Graphics({ label: 'viewport-guides' });
  private readonly metrics = new Text({
    text: '',
    style: {
      fontFamily: 'monospace',
      fontSize: 24,
      fill: '#d7f7ff',
      align: 'center',
      stroke: { color: '#071018', width: 4 },
    },
    anchor: 0.5,
    label: 'viewport-metrics',
  });

  public readonly element: HTMLElement;

  private readonly probeView: ProbeView;

  public constructor(private readonly options: ViewportProbeSceneOptions = {}) {
    this.view.addChild(this.guides, this.metrics);
    this.probeView = createProbeView();
    this.element = this.probeView.element;
  }

  /** 전달받은 논리 사각형 전체를 사용해 경계, 중심선, 측정값을 다시 배치한다. */
  public resize(layout: ViewportLayout): void {
    const centerX = layout.width / 2;
    const centerY = layout.height / 2;

    this.guides
      .clear()
      .rect(0, 0, layout.width, layout.height)
      .stroke({ color: '#5de4ff', width: 2, alignment: 1 })
      .moveTo(centerX, 0)
      .lineTo(centerX, layout.height)
      .moveTo(0, centerY)
      .lineTo(layout.width, centerY)
      .stroke({ color: '#285866', width: 1 });

    this.metrics.text = [
      `viewport ${formatMetric(layout.width * layout.scale)} x ${formatMetric(layout.height * layout.scale)}`,
      `logical ${formatMetric(layout.width)} x ${formatMetric(layout.height)}`,
      `scale ${layout.scale.toFixed(4)}`,
      ...(this.options.preloadSummary ? [this.options.preloadSummary] : []),
    ].join('\n');
    this.probeView.setLabel(
      `DOM ${formatMetric(layout.width)} x ${formatMetric(layout.height)} @ ${layout.scale.toFixed(4)}`,
    );
    this.metrics.position.set(centerX, layout.height / 4);
  }
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
