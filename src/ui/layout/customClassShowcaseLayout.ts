import { calculateViewportLayout, type ViewportOrientation } from './viewportLayout';

export interface CustomClassShowcaseLayout {
  readonly width: number;
  readonly height: number;
  readonly orientation: ViewportOrientation;
  readonly axis: 'x' | 'y';
  readonly padding: number;
  readonly gap: number;
  readonly usableWidth: number;
  readonly usableHeight: number;
  readonly navigationProportion: 1;
  readonly showcaseProportion: 2;
  readonly navigationExtent: number;
  readonly showcaseExtent: number;
  readonly crossExtent: number;
}

export function calculateCustomClassShowcaseLayout(
  width: number,
  height: number,
): CustomClassShowcaseLayout {
  const viewport = calculateViewportLayout(width, height);
  const usableWidth = Math.max(1, viewport.width - viewport.padding * 2);
  const usableHeight = Math.max(1, viewport.height - viewport.padding * 2);
  const axis = viewport.orientation === 'landscape' ? 'x' : 'y';
  const mainExtent = axis === 'x' ? usableWidth : usableHeight;
  const distributableExtent = Math.max(1, mainExtent - viewport.gap);
  const navigationExtent = distributableExtent / 3;

  return {
    width: viewport.width,
    height: viewport.height,
    orientation: viewport.orientation,
    axis,
    padding: viewport.padding,
    gap: viewport.gap,
    usableWidth,
    usableHeight,
    navigationProportion: 1,
    showcaseProportion: 2,
    navigationExtent,
    showcaseExtent: distributableExtent - navigationExtent,
    crossExtent: axis === 'x' ? usableHeight : usableWidth,
  };
}
