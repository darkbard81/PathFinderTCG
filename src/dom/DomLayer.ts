import './dom-layer.css';
import './screens/button-9slice.css';
import './screens/button-plain.css';
import type { ViewportLayout } from '../pixi/app/viewport';
import { resolveOverlayStyle } from './overlay-style';
import { applyThemeCssVariables } from './theme-css';

/**
 * 캔버스 위에 겹치는 DOM UI 오버레이를 소유한다.
 * 화면별 DOM 루트를 붙이고 떼며, 논리 영역 배율을 오버레이에 반영한다.
 */
export class DomLayer {
  private readonly root: HTMLDivElement;
  private mounted: HTMLElement | null = null;

  public constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'pf-overlay';
    applyThemeCssVariables(this.root);
    parent.appendChild(this.root);
  }

  /** 화면 크롬을 오버레이에 붙인다. 이전 화면의 DOM은 먼저 제거한다. */
  public mount(element: HTMLElement | undefined): void {
    this.unmount();

    if (element) {
      this.root.appendChild(element);
      this.mounted = element;
    }
  }

  /** 현재 화면의 DOM을 제거한다. 남겨두면 다음 화면의 입력을 가로챈다. */
  public unmount(): void {
    this.mounted?.remove();
    this.mounted = null;
  }

  /** 논리 영역과 배율을 오버레이 루트에 반영한다. */
  public applyLayout(layout: ViewportLayout): void {
    const style = resolveOverlayStyle(layout);

    this.root.style.width = style.width;
    this.root.style.height = style.height;
    this.root.style.transform = style.transform;
  }

  public destroy(): void {
    this.unmount();
    this.root.remove();
  }
}
