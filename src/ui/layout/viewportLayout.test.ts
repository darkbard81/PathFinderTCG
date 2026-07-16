import { describe, expect, it } from 'vitest';

import { calculateViewportLayout } from './viewportLayout';

describe('calculateViewportLayout', () => {
  it('selects landscape when width is greater than or equal to height', () => {
    expect(calculateViewportLayout(1280, 720).orientation).toBe('landscape');
    expect(calculateViewportLayout(800, 800).orientation).toBe('landscape');
  });

  it('selects portrait when height is greater than width', () => {
    expect(calculateViewportLayout(720, 1280).orientation).toBe('portrait');
  });

  it('clamps padding and gaps at their minimum values', () => {
    const layout = calculateViewportLayout(240, 320);

    expect(layout.padding).toBe(16);
    expect(layout.gap).toBe(12);
  });

  it('clamps padding and gaps at their maximum values', () => {
    const layout = calculateViewportLayout(3000, 2400);

    expect(layout.padding).toBe(48);
    expect(layout.gap).toBe(32);
  });
});
