import { describe, expect, it } from 'vitest';

import { calculateCustomClassShowcaseLayout } from './customClassShowcaseLayout';

describe('calculateCustomClassShowcaseLayout', () => {
  it('uses a horizontal 1:2 layout in landscape', () => {
    const layout = calculateCustomClassShowcaseLayout(1280, 720);

    expect(layout.axis).toBe('x');
    expect(layout.navigationProportion).toBe(1);
    expect(layout.showcaseProportion).toBe(2);
    expect(layout.showcaseExtent).toBeCloseTo(layout.navigationExtent * 2);
  });

  it('uses a vertical 1:2 layout in portrait', () => {
    const layout = calculateCustomClassShowcaseLayout(720, 1280);

    expect(layout.axis).toBe('y');
    expect(layout.navigationProportion).toBe(1);
    expect(layout.showcaseProportion).toBe(2);
    expect(layout.showcaseExtent).toBeCloseTo(layout.navigationExtent * 2);
  });
});
