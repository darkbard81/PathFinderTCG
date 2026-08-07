import { MIN_VIEWPORT_HEIGHT, MIN_VIEWPORT_WIDTH, resolveViewportLayout } from './viewport';

describe('resolveViewportLayout', () => {
  it('최소 해상도에서는 배율과 논리 크기를 유지한다', () => {
    expect(resolveViewportLayout({ width: 1024, height: 768 })).toEqual({
      scale: 1,
      width: 1024,
      height: 768,
    });
  });

  it('최소 해상도보다 큰 뷰포트를 확대하지 않는다', () => {
    expect(resolveViewportLayout({ width: 1920, height: 1080 })).toEqual({
      scale: 1,
      width: 1920,
      height: 1080,
    });
  });

  it('작은 뷰포트를 너비 기준으로 균일 축소한다', () => {
    const layout = resolveViewportLayout({ width: 800, height: 600 });

    expect(layout.scale).toBe(800 / 1024);
    expect(layout.width).toBe(1024);
    expect(layout.height).toBe(768);
  });

  it('한 축만 부족해도 부족한 너비를 기준으로 축소한다', () => {
    const layout = resolveViewportLayout({ width: 800, height: 900 });

    expect(layout.scale).toBe(800 / 1024);
    expect(layout.width).toBe(1024);
    expect(layout.height).toBeGreaterThan(768);
  });

  it.each([
    { width: 0, height: 0 },
    { width: -1, height: -10 },
    { width: Number.NaN, height: Number.NaN },
    { width: Number.POSITIVE_INFINITY, height: Number.NEGATIVE_INFINITY },
  ])('비정상 입력 $width x $height을 최소 해상도로 방어한다', (viewport) => {
    expect(resolveViewportLayout(viewport)).toEqual({
      scale: 1,
      width: MIN_VIEWPORT_WIDTH,
      height: MIN_VIEWPORT_HEIGHT,
    });
  });

  it('경계값과 결정적 무작위 입력에서 최소 논리 크기 불변식을 유지한다', () => {
    const viewports = [
      { width: Number.MIN_VALUE, height: Number.MIN_VALUE },
      { width: 1023.999, height: 767.999 },
      { width: 1024.001, height: 768.001 },
    ];
    let state = 0x12345678;

    for (let index = 0; index < 100; index += 1) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      const width = (state / 0x1_0000_0000) * 4096;
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      const height = (state / 0x1_0000_0000) * 3072;
      viewports.push({ width, height });
    }

    for (const viewport of viewports) {
      const layout = resolveViewportLayout(viewport);

      expect(layout.width).toBeGreaterThanOrEqual(MIN_VIEWPORT_WIDTH);
      expect(layout.height).toBeGreaterThanOrEqual(MIN_VIEWPORT_HEIGHT);
      expect(layout.scale).toBeGreaterThan(0);
      expect(layout.scale).toBeLessThanOrEqual(1);
    }
  });
});
