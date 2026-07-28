import type { ViewportOrientation } from './viewportLayout.js';

export interface PhaseSevenLayout {
  readonly width: number;
  readonly height: number;
  readonly orientation: ViewportOrientation;
  readonly padding: number;
  readonly gap: number;
  readonly rootWidth: number;
  readonly rootHeight: number;
  readonly panelInset: number;
  readonly titleFontSize: number;
  readonly sectionFontSize: number;
  readonly bodyFontSize: number;
  readonly detailFontSize: number;
  readonly headerHeight: number;
  readonly footerHeight: number;
  readonly screenContentHeight: number;
  readonly listHeight: number;
  readonly deckTableHeight: number;
  readonly battleSidebarWidth: number;
  readonly battleHudHeight: number;
  readonly battleCardWidth: number;
  readonly choicePanelWidth: number;
  readonly choicePanelHeight: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculatePhaseSevenLayout(width: number, height: number): PhaseSevenLayout {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const shortSide = Math.min(safeWidth, safeHeight);
  const orientation: ViewportOrientation = safeWidth >= safeHeight ? 'landscape' : 'portrait';
  const padding = Math.round(clamp(shortSide * 0.032, 12, 32));
  const gap = Math.round(clamp(shortSide * 0.018, 8, 18));
  const rootWidth = Math.max(1, safeWidth - padding * 2);
  const rootHeight = Math.max(1, safeHeight - padding * 2);
  const panelInset = Math.round(clamp(shortSide * 0.035, 14, 30));
  const titleFontSize = Math.round(clamp(shortSide * 0.052, 25, 42));
  const sectionFontSize = Math.round(clamp(shortSide * 0.033, 19, 28));
  const bodyFontSize = Math.round(clamp(shortSide * 0.024, 15, 20));
  const detailFontSize = Math.round(clamp(shortSide * 0.02, 13, 17));
  const headerHeight = Math.round(clamp(rootHeight * 0.11, 62, 92));
  const footerHeight = Math.round(clamp(rootHeight * 0.12, 66, 96));
  const screenContentHeight = Math.max(
    1,
    rootHeight - headerHeight - footerHeight - gap * 4 - panelInset * 2,
  );
  const listHeight = Math.round(
    clamp(
      screenContentHeight - (orientation === 'portrait' ? 3 * 58 + gap * 3 : 58 + gap),
      100,
      420,
    ),
  );
  const deckTableHeight =
    orientation === 'landscape'
      ? Math.round(clamp(screenContentHeight - 58 * 2 - gap * 3 - 90, 120, 360))
      : Math.round(clamp((screenContentHeight - 58 * 2 - gap * 4 - 180) / 2, 80, 230));
  const battleSidebarWidth =
    orientation === 'landscape' ? Math.round(clamp(rootWidth * 0.29, 290, 390)) : rootWidth;
  const battleHudHeight =
    orientation === 'portrait' ? Math.round(clamp(rootHeight * 0.41, 330, 400)) : rootHeight;
  const battleBoardWidth =
    orientation === 'landscape' ? Math.max(1, rootWidth - battleSidebarWidth - gap) : rootWidth;
  const battleBoardHeight =
    orientation === 'landscape' ? rootHeight : Math.max(1, rootHeight - battleHudHeight - gap);
  const battleCardWidth = Math.round(
    clamp(Math.min(battleBoardWidth / 4.4, battleBoardHeight / 7.5), 60, 128),
  );
  const choicePanelWidth = Math.round(clamp(rootWidth * 0.78, 280, 620));
  const choicePanelHeight = Math.round(clamp(rootHeight * 0.72, 320, 560));

  return Object.freeze({
    width: safeWidth,
    height: safeHeight,
    orientation,
    padding,
    gap,
    rootWidth,
    rootHeight,
    panelInset,
    titleFontSize,
    sectionFontSize,
    bodyFontSize,
    detailFontSize,
    headerHeight,
    footerHeight,
    screenContentHeight,
    listHeight,
    deckTableHeight,
    battleSidebarWidth,
    battleHudHeight,
    battleCardWidth,
    choicePanelWidth,
    choicePanelHeight,
  });
}
