import { describe, expect, it } from 'vitest';

import { calculateThemeModLayout } from './themeModLayout.js';

describe('calculateThemeModLayout', () => {
  it('keeps card galleries large on the 1024x768 iPad Mini landscape baseline', () => {
    const layout = calculateThemeModLayout(1024, 768);

    expect(layout.orientation).toBe('landscape');
    expect(layout.deck.collectionColumns).toBe(3);
    expect(layout.deck.deckColumns).toBe(1);
    expect(layout.deck.collectionCardWidth).toBeGreaterThanOrEqual(180);
    expect(layout.deck.deckCardWidth).toBeGreaterThanOrEqual(200);
    expect(layout.battle.boardCardWidth).toBeGreaterThanOrEqual(90);
    expect(layout.battle.handCardWidth).toBeGreaterThanOrEqual(175);
    expect(layout.battle.handPeekTop).toBeGreaterThan(layout.battle.handHoverTop);
    expect(layout.rootWidth + layout.padding * 2).toBe(1024);
    expect(layout.rootHeight + layout.padding * 2).toBe(768);
  });

  it('stacks deck galleries and enlarges the battlefield in portrait', () => {
    const layout = calculateThemeModLayout(768, 1024);

    expect(layout.orientation).toBe('portrait');
    expect(layout.deck.collectionWidth).toBe(layout.rootWidth);
    expect(layout.deck.deckWidth).toBe(layout.rootWidth);
    expect(layout.deck.collectionHeight + layout.deck.deckHeight + layout.gap).toBe(
      layout.deck.contentHeight,
    );
    expect(layout.deck.collectionCardWidth).toBeGreaterThanOrEqual(200);
    expect(layout.battle.boardCardWidth).toBeGreaterThan(
      calculateThemeModLayout(1024, 768).battle.boardCardWidth,
    );
    expect(layout.battle.handExpandedY).toBeLessThan(layout.battle.handCollapsedY);
  });

  it('keeps every calculated metric positive on a narrow mobile viewport', () => {
    const layout = calculateThemeModLayout(390, 844);

    for (const value of [layout.padding, layout.gap, layout.rootWidth, layout.rootHeight]) {
      expect(value).toBeGreaterThan(0);
    }
    for (const value of Object.values(layout.deck)) {
      expect(value).toBeGreaterThan(0);
    }
    for (const value of Object.values(layout.battle)) {
      expect(value).toBeGreaterThan(0);
    }
  });
});
