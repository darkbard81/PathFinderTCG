export const MIN_VIEWPORT_WIDTH = 1024;
export const MIN_VIEWPORT_HEIGHT = 768;

export type ViewportSize = {
  width: number;
  height: number;
};

export type ViewportLayout = {
  scale: number;
  width: number;
  height: number;
};

/**
 * 실제 뷰포트를 최소 1024x768 논리 영역으로 변환한다.
 * 유효하지 않은 축은 해당 최소값으로 대체해 0 나누기와 비정상 배율을 막는다.
 */
export function resolveViewportLayout(viewport: ViewportSize): ViewportLayout {
  const viewportWidth = sanitizeDimension(viewport.width, MIN_VIEWPORT_WIDTH);
  const viewportHeight = sanitizeDimension(viewport.height, MIN_VIEWPORT_HEIGHT);
  const scale = Math.min(
    1,
    viewportWidth / MIN_VIEWPORT_WIDTH,
    viewportHeight / MIN_VIEWPORT_HEIGHT,
  );

  return {
    scale,
    width: viewportWidth / scale,
    height: viewportHeight / scale,
  };
}

function sanitizeDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 && value / fallback > 0 ? value : fallback;
}
