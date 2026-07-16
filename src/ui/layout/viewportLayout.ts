export type ViewportOrientation = 'landscape' | 'portrait';

export interface ViewportLayout {
  readonly width: number;
  readonly height: number;
  readonly shortSide: number;
  readonly orientation: ViewportOrientation;
  readonly padding: number;
  readonly gap: number;
  readonly eyebrowFontSize: number;
  readonly titleFontSize: number;
  readonly sectionFontSize: number;
  readonly bodyFontSize: number;
  readonly contentTextWidth: number;
  readonly actionTextWidth: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateViewportLayout(width: number, height: number): ViewportLayout {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const shortSide = Math.min(safeWidth, safeHeight);
  const orientation: ViewportOrientation = safeWidth >= safeHeight ? 'landscape' : 'portrait';
  const padding = Math.round(clamp(shortSide * 0.04, 16, 48));
  const gap = Math.round(clamp(shortSide * 0.025, 12, 32));
  const usableWidth = Math.max(1, safeWidth - padding * 2);
  const panelWidth =
    orientation === 'landscape' ? Math.max(240, (usableWidth - gap) * 0.55) : usableWidth;
  const actionPanelWidth =
    orientation === 'landscape' ? Math.max(220, usableWidth - gap - panelWidth) : usableWidth;

  return {
    width: safeWidth,
    height: safeHeight,
    shortSide,
    orientation,
    padding,
    gap,
    eyebrowFontSize: Math.round(clamp(shortSide * 0.022, 13, 18)),
    titleFontSize: Math.round(clamp(shortSide * 0.066, 34, 64)),
    sectionFontSize: Math.round(clamp(shortSide * 0.04, 24, 38)),
    bodyFontSize: Math.round(clamp(shortSide * 0.028, 17, 25)),
    contentTextWidth: Math.max(180, Math.round(panelWidth - padding * 1.5)),
    actionTextWidth: Math.max(170, Math.round(actionPanelWidth - padding * 1.5)),
  };
}
