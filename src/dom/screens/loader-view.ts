import './loader.css';

/**
 * 진행 막대의 채움 종류다.
 * gradient는 금색에서 하늘색으로 흐르고, gold와 azure는 그 두 색의 단색이다.
 */
export type LoaderBarVariant = 'gradient' | 'gold' | 'azure';

export type LoaderViewOptions = {
  /** 생략하면 그라데이션이다. */
  barVariant?: LoaderBarVariant;
};

export type LoaderViewModel = {
  /** 0~1 진행률이다. 범위를 벗어난 값은 뷰가 잘라 쓴다. */
  progress: number;
  status: string;
};

/** 로딩 화면의 DOM 루트와 갱신 API다. */
export type LoaderView = {
  element: HTMLElement;
  render: (model: LoaderViewModel) => void;
};

/**
 * 로딩 화면의 DOM을 만든다.
 * 레이아웃과 배율은 CSS와 오버레이 루트가 담당하므로 좌표를 계산하지 않는다.
 */
export function createLoaderView(options: LoaderViewOptions = {}): LoaderView {
  const barVariant = options.barVariant ?? 'gradient';

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
  fill.className =
    barVariant === 'gradient'
      ? 'pf-loader__fill'
      : `pf-loader__fill pf-loader__fill--${barVariant}`;
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
    render: (model) => {
      const clamped = Math.min(1, Math.max(0, model.progress));
      const rounded = Math.round(clamped * 100);

      fill.style.setProperty('--pf-loader-fill-cut', `${100 - clamped * 100}%`);
      track.setAttribute('aria-valuenow', String(rounded));
      percent.textContent = `${rounded}%`;
      status.textContent = model.status;
    },
  };
}
