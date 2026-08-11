import { describe, expect, it } from 'vitest';
import { resolveDetailPlacement } from './card-detail-placement';

const PANEL = { width: 360, height: 420 };
const SCREEN = { width: 1024, height: 768 };

describe('card detail placement', () => {
  it('puts the panel to the right of the card when there is room', () => {
    const placement = resolveDetailPlacement(
      { left: 100, top: 200, width: 104, height: 156 },
      PANEL,
      SCREEN,
    );

    expect(placement.left).toBe(212);
    expect(placement.top).toBe(200);
  });

  it('flips to the left when the right side would overflow', () => {
    // 카드가 오른쪽 끝에 있다. 오른쪽에 놓으면 800 + 360 이 화면을 넘는다.
    const placement = resolveDetailPlacement(
      { left: 800, top: 100, width: 104, height: 156 },
      PANEL,
      SCREEN,
    );

    expect(placement.left).toBe(432);
  });

  it('keeps the panel on screen when neither side fits', () => {
    const narrow = { width: 420, height: 768 };
    const placement = resolveDetailPlacement(
      { left: 150, top: 100, width: 104, height: 156 },
      PANEL,
      narrow,
    );

    expect(placement.left).toBeGreaterThanOrEqual(8);
    expect(placement.left + PANEL.width).toBeLessThanOrEqual(narrow.width - 8);
  });

  it('pulls the panel up when the card sits near the bottom', () => {
    const placement = resolveDetailPlacement(
      { left: 100, top: 700, width: 104, height: 156 },
      PANEL,
      SCREEN,
    );

    expect(placement.top).toBe(768 - 420 - 8);
    expect(placement.top + PANEL.height).toBeLessThanOrEqual(768 - 8);
  });

  it('aligns to the top edge when the card sits above it', () => {
    const placement = resolveDetailPlacement(
      { left: 100, top: 0, width: 104, height: 156 },
      PANEL,
      SCREEN,
    );

    expect(placement.top).toBe(8);
  });

  it('falls back to the near edge when the panel is larger than the screen', () => {
    // 논리 영역은 최소 1024x768이라 실제로는 안 나오지만, 값이 뒤집히지 않는지는 지켜야 한다.
    const placement = resolveDetailPlacement(
      { left: 10, top: 10, width: 104, height: 156 },
      { width: 900, height: 900 },
      { width: 400, height: 400 },
    );

    expect(placement.left).toBe(8);
    expect(placement.top).toBe(8);
  });
});
