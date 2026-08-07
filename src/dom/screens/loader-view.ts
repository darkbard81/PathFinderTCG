import './loader.css';

/** 로딩 화면의 DOM 루트와 갱신 함수다. 화면 로직은 이 핸들만 다룬다. */
export type LoaderView = {
  element: HTMLElement;
  setProgress: (ratio: number) => void;
  setStatus: (message: string) => void;
};

/**
 * 로딩 화면의 DOM을 만든다.
 * 레이아웃과 배율은 CSS와 오버레이 루트가 담당하므로 좌표를 계산하지 않는다.
 */
export function createLoaderView(): LoaderView {
  const element = document.createElement('section');
  element.className = 'pf-loader';

  const title = document.createElement('h1');
  title.className = 'pf-loader__title';
  title.textContent = 'Loading archive';

  const track = document.createElement('div');
  track.className = 'pf-loader__track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', '0');

  const fill = document.createElement('div');
  fill.className = 'pf-loader__fill';
  track.appendChild(fill);

  const status = document.createElement('p');
  status.className = 'pf-loader__status';
  status.setAttribute('role', 'status');
  status.textContent = 'Requesting assets.json';

  const percent = document.createElement('p');
  percent.className = 'pf-loader__percent';
  percent.textContent = '0%';

  element.append(title, track, status, percent);

  return {
    element,
    setProgress: (ratio) => {
      const clamped = Math.min(1, Math.max(0, ratio));
      const rounded = Math.round(clamped * 100);

      fill.style.width = `${clamped * 100}%`;
      track.setAttribute('aria-valuenow', String(rounded));
      percent.textContent = `${rounded}%`;
    },
    setStatus: (message) => {
      status.textContent = message;
    },
  };
}
