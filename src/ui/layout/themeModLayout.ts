import type { ViewportOrientation } from './viewportLayout.js';

export interface ThemeModDeckLayout {
  readonly headerHeight: number;
  readonly footerHeight: number;
  readonly contentHeight: number;
  readonly collectionWidth: number;
  readonly collectionHeight: number;
  readonly collectionColumns: number;
  readonly collectionCardWidth: number;
  readonly deckWidth: number;
  readonly deckHeight: number;
  readonly deckColumns: number;
  readonly deckCardWidth: number;
}

export interface ThemeModBattleLayout {
  readonly commandBarHeight: number;
  readonly boardWidth: number;
  readonly boardHeight: number;
  readonly boardCenterY: number;
  readonly boardCardWidth: number;
  readonly handWidth: number;
  readonly handHeight: number;
  readonly handPeekHeight: number;
  readonly handCardWidth: number;
  readonly handExpandedY: number;
  readonly handCollapsedY: number;
  readonly handHoverTop: number;
  readonly handPeekTop: number;
  readonly previewCardWidth: number;
}

export interface ThemeModLayout {
  readonly width: number;
  readonly height: number;
  readonly orientation: ViewportOrientation;
  readonly padding: number;
  readonly gap: number;
  readonly rootWidth: number;
  readonly rootHeight: number;
  readonly deck: ThemeModDeckLayout;
  readonly battle: ThemeModBattleLayout;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function cardWidthForColumns(width: number, columns: number, gap: number): number {
  const horizontalInset = 24;
  const scrollbarAllowance = 34;
  return Math.max(
    1,
    Math.floor(
      (width - horizontalInset - scrollbarAllowance - gap * Math.max(0, columns - 1)) / columns,
    ),
  );
}

/**
 * ThemeMod의 덱 구성과 전투 화면이 공유하는 iPad 우선 반응형 수치를 계산한다.
 */
export function calculateThemeModLayout(width: number, height: number): ThemeModLayout {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const shortSide = Math.min(safeWidth, safeHeight);
  const orientation: ViewportOrientation = safeWidth >= safeHeight ? 'landscape' : 'portrait';
  const padding = Math.round(clamp(shortSide * 0.018, 10, 20));
  const gap = Math.round(clamp(shortSide * 0.014, 8, 14));
  const rootWidth = Math.max(1, safeWidth - padding * 2);
  const rootHeight = Math.max(1, safeHeight - padding * 2);

  const deckHeaderHeight = Math.round(clamp(rootHeight * 0.095, 64, 78));
  const deckFooterHeight = Math.round(clamp(rootHeight * 0.078, 54, 64));
  const deckContentHeight = Math.max(1, rootHeight - deckHeaderHeight - deckFooterHeight - gap * 2);
  const collectionWidth =
    orientation === 'landscape'
      ? Math.max(1, rootWidth - Math.round(clamp(rootWidth * 0.34, 310, 370)) - gap)
      : rootWidth;
  const deckWidth =
    orientation === 'landscape' ? Math.max(1, rootWidth - collectionWidth - gap) : rootWidth;
  const collectionHeight =
    orientation === 'landscape'
      ? deckContentHeight
      : Math.max(1, Math.round(deckContentHeight * 0.61));
  const deckHeight =
    orientation === 'landscape'
      ? deckContentHeight
      : Math.max(1, deckContentHeight - collectionHeight - gap);
  const collectionColumns = collectionWidth >= 570 ? 3 : collectionWidth >= 390 ? 2 : 1;
  const deckColumns =
    orientation === 'landscape'
      ? deckWidth >= 430
        ? 2
        : 1
      : deckWidth >= 610
        ? 3
        : deckWidth >= 390
          ? 2
          : 1;
  const collectionCardWidth = Math.round(
    clamp(cardWidthForColumns(collectionWidth, collectionColumns, gap), 160, 230),
  );
  const deckCardWidth = Math.round(
    clamp(cardWidthForColumns(deckWidth, deckColumns, gap), 160, 230),
  );

  const commandBarHeight =
    rootWidth < 700
      ? Math.round(clamp(rootHeight * 0.13, 96, 112))
      : Math.round(clamp(rootHeight * 0.082, 60, 68));
  const boardHeight = Math.max(1, rootHeight - commandBarHeight - gap);
  const boardWidth = rootWidth;
  const boardVerticalChrome = Math.round(clamp(boardHeight * 0.14, 76, 106));
  const boardCardWidth = Math.round(clamp((boardHeight - boardVerticalChrome) / 6, 76, 150));
  const handHeight = Math.round(
    orientation === 'landscape'
      ? clamp(rootHeight * 0.44, 270, 340)
      : clamp(rootHeight * 0.38, 320, 390),
  );
  const handPeekHeight = Math.round(clamp(rootHeight * 0.062, 44, 58));
  const handCardWidth = Math.round(clamp((handHeight - 54) / 1.5, 150, 230));
  const handExpandedY = safeHeight - padding - handHeight / 2;
  const handCollapsedY = safeHeight - padding - handPeekHeight + handHeight / 2;
  const handHoverTop = safeHeight - padding - handHeight;
  const handPeekTop = safeHeight - padding - handPeekHeight;
  const previewCardWidth = Math.round(
    orientation === 'landscape'
      ? clamp(rootWidth * 0.245, 220, 280)
      : clamp(rootWidth * 0.38, 230, 300),
  );

  return Object.freeze({
    width: safeWidth,
    height: safeHeight,
    orientation,
    padding,
    gap,
    rootWidth,
    rootHeight,
    deck: Object.freeze({
      headerHeight: deckHeaderHeight,
      footerHeight: deckFooterHeight,
      contentHeight: deckContentHeight,
      collectionWidth,
      collectionHeight,
      collectionColumns,
      collectionCardWidth,
      deckWidth,
      deckHeight,
      deckColumns,
      deckCardWidth,
    }),
    battle: Object.freeze({
      commandBarHeight,
      boardWidth,
      boardHeight,
      boardCenterY: padding + commandBarHeight + gap + boardHeight / 2,
      boardCardWidth,
      handWidth: rootWidth,
      handHeight,
      handPeekHeight,
      handCardWidth,
      handExpandedY,
      handCollapsedY,
      handHoverTop,
      handPeekTop,
      previewCardWidth,
    }),
  });
}
