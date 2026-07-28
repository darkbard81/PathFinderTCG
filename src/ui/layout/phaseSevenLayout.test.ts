import { describe, expect, it } from 'vitest';

import { calculatePhaseSevenLayout } from './phaseSevenLayout.js';

describe('calculatePhaseSevenLayout', () => {
  it('allocates a side HUD and readable battle cards in landscape', () => {
    const layout = calculatePhaseSevenLayout(1280, 720);

    expect(layout.orientation).toBe('landscape');
    expect(layout.battleSidebarWidth).toBeGreaterThanOrEqual(290);
    expect(layout.battleCardWidth).toBeGreaterThanOrEqual(62);
    expect(layout.rootWidth + layout.padding * 2).toBe(1280);
    expect(layout.rootHeight + layout.padding * 2).toBe(720);
  });

  it('stacks the battle HUD and deck lists in portrait', () => {
    const layout = calculatePhaseSevenLayout(430, 932);

    expect(layout.orientation).toBe('portrait');
    expect(layout.battleSidebarWidth).toBe(layout.rootWidth);
    expect(layout.deckTableHeight * 2).toBeLessThan(layout.rootHeight);
    expect(layout.choicePanelWidth).toBeLessThanOrEqual(layout.rootWidth);
    expect(layout.choicePanelHeight).toBeLessThanOrEqual(layout.rootHeight);
  });

  it('keeps every metric positive on a narrow fallback viewport', () => {
    const layout = calculatePhaseSevenLayout(320, 568);

    for (const value of Object.values(layout)) {
      if (typeof value === 'number') {
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});
