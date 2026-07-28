import type { ViewportOrientation } from './viewportLayout.js';

export interface AuthDomLayout {
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly orientation: ViewportOrientation;
  readonly compact: boolean;
}

export function calculateAuthDomLayout(width: number, height: number): AuthDomLayout {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const orientation: ViewportOrientation = safeWidth >= safeHeight ? 'landscape' : 'portrait';

  return Object.freeze({
    width: safeWidth,
    height: safeHeight,
    centerX: safeWidth / 2,
    centerY: safeHeight / 2,
    orientation,
    compact: safeWidth < 620 || safeHeight < 680,
  });
}
