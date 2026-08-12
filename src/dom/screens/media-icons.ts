/**
 * 재생 조작 아이콘이다.
 *
 * 로비 아이콘 세트(`assets/ui/icons/lobby`)에는 재생·정지 그림이 없다. 자산을 새로 굽는
 * 대신 인라인 SVG로 그린다. 도형 몇 개라 파일로 둘 이유가 없고, `currentColor`를 쓰므로
 * 버튼 상태에 따라 색이 함께 움직인다.
 */

export type MediaIconName = 'play' | 'stop' | 'shuffle' | 'note' | 'previous' | 'next';

/** 24×24 좌표계에 그린 경로다. 크기는 CSS가 정한다. */
const MEDIA_ICON_PATHS: Record<MediaIconName, string> = {
  // 오른쪽을 보는 삼각형.
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" />',
  // 정사각형. 모서리를 살짝 굴려 삼각형과 무게를 맞춘다.
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />',
  /*
   * 서로 엇갈리는 두 화살표.
   * 선으로 그린다. 채운 도형으로 만들면 같은 크기에서 재생·정지보다 훨씬 무거워 보인다.
   */
  shuffle: [
    '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
    '<path d="M3 7h3.5l3 5m0 0 3 5H16" />',
    '<path d="M3 17h3.5l3-5" />',
    '<path d="M13 7h3" />',
    '<path d="m14.5 5 2 2-2 2" />',
    '<path d="m14.5 15 2 2-2 2" />',
    '</g>',
  ].join(''),
  // 재생 삼각형에 막대를 붙인다. 막대가 있는 쪽이 건너뛰어 닿는 끝이다.
  previous: [
    '<path d="M18 5.5v13L9 12z" fill="currentColor" />',
    '<rect x="6" y="5.5" width="2.2" height="13" rx="0.8" fill="currentColor" />',
  ].join(''),
  next: [
    '<path d="M6 5.5v13l9-6.5z" fill="currentColor" />',
    '<rect x="15.8" y="5.5" width="2.2" height="13" rx="0.8" fill="currentColor" />',
  ].join(''),
  // 8분음표. 지금 울리는 곡을 목록에서 짚어 주는 표시다.
  note: [
    '<g fill="currentColor">',
    '<ellipse cx="8.5" cy="17" rx="3.6" ry="2.9" />',
    '<rect x="11" y="4.5" width="1.8" height="12.5" rx="0.6" />',
    '<path d="M12.8 4.5c2.3.7 4.1 2.1 4.5 4.3.2 1-.1 2-.9 2.8.2-1.7-.6-3.1-2-4-.5-.4-1.1-.6-1.6-.8z" />',
    '</g>',
  ].join(''),
};

/**
 * 아이콘 SVG를 만든다.
 *
 * `aria-hidden`으로 감춘다. 뜻은 감싸는 버튼의 `aria-label`이 전한다. 아이콘까지
 * 읽히면 같은 말을 두 번 듣는다.
 */
export function createMediaIcon(name: MediaIconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('pf-media-icon');
  svg.innerHTML = MEDIA_ICON_PATHS[name];
  return svg;
}
