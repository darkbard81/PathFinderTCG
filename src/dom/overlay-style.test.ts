import { resolveViewportLayout } from '../pixi/app/viewport';
import { resolveOverlayStyle } from './overlay-style';

describe('resolveOverlayStyle', () => {
  it('배율이 1이면 transform을 걸지 않는다', () => {
    expect(resolveOverlayStyle({ scale: 1, width: 1920, height: 1080 })).toEqual({
      width: '1920px',
      height: '1080px',
      transform: 'none',
    });
  });

  it('축소 구간에서는 논리 크기를 유지하고 배율만 transform으로 넘긴다', () => {
    expect(resolveOverlayStyle({ scale: 0.5, width: 1024, height: 768 })).toEqual({
      width: '1024px',
      height: '768px',
      transform: 'scale(0.5)',
    });
  });

  it('오버레이 크기에 배율을 곱하면 실제 뷰포트 크기가 된다', () => {
    const viewport = { width: 800, height: 600 };
    const layout = resolveViewportLayout(viewport);
    const style = resolveOverlayStyle(layout);

    expect(Number.parseFloat(style.width) * layout.scale).toBeCloseTo(viewport.width, 6);
    expect(Number.parseFloat(style.height) * layout.scale).toBeCloseTo(viewport.height, 6);
  });
});
