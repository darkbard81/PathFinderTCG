import './probe.css';

/** DOM 오버레이가 캔버스와 같은 좌표계에 있는지 눈으로 확인하기 위한 임시 마커다. */
export type ProbeView = {
  element: HTMLElement;
  setLabel: (text: string) => void;
};

/**
 * 논리 영역 경계와 중심선을 DOM으로 그린다.
 * 캔버스가 그린 같은 도형과 겹쳐 보이면 배율 동기화가 맞다는 뜻이다.
 */
export function createProbeView(): ProbeView {
  const element = document.createElement('div');
  element.className = 'pf-probe';

  const label = document.createElement('p');
  label.className = 'pf-probe__label';
  label.textContent = 'DOM';
  element.appendChild(label);

  return {
    element,
    setLabel: (text) => {
      label.textContent = text;
    },
  };
}
