import type { ViewportLayout } from '../pixi/app/viewport';

/** DOM 오버레이 루트에 적용할 인라인 스타일 값이다. */
export type OverlayStyle = {
  width: string;
  height: string;
  zoom: string;
};

/**
 * 논리 영역과 배율을 오버레이 루트의 스타일로 변환한다.
 * 오버레이는 논리 크기를 그대로 쓰고 배율만 transform으로 적용해 캔버스와 같은 좌표계를 유지한다.
 */
export function resolveOverlayStyle(layout: ViewportLayout): OverlayStyle {
  return {
    width: `${layout.width}px`,
    height: `${layout.height}px`,
    zoom: `${layout.scale}`,
  };
}
