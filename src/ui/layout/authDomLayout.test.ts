import { describe, expect, it } from 'vitest';

import { calculateAuthDomLayout } from './authDomLayout.js';

describe('calculateAuthDomLayout', () => {
  it('fills the desktop viewport while keeping it centered', () => {
    const layout = calculateAuthDomLayout(1280, 720);

    expect(layout).toMatchObject({
      width: 1280,
      height: 720,
      centerX: 640,
      centerY: 360,
      orientation: 'landscape',
      compact: false,
    });
  });

  it('fills a compact portrait mobile viewport', () => {
    const layout = calculateAuthDomLayout(390, 844);

    expect(layout).toMatchObject({
      width: 390,
      height: 844,
      centerX: 195,
      centerY: 422,
      orientation: 'portrait',
      compact: true,
    });
  });

  it('keeps valid bounds when the virtual keyboard reduces viewport height', () => {
    const layout = calculateAuthDomLayout(390, 420);

    expect(layout).toMatchObject({
      width: 390,
      height: 420,
      centerX: 195,
      centerY: 210,
      orientation: 'portrait',
      compact: true,
    });
  });
});
