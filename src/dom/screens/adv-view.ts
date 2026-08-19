import type { StageAdvStandingDefinition } from '../../game/stage/types';
import './adv.css';

export type AdvViewState = 'loading' | 'ready' | 'error';

export type AdvStandingModel = {
  imageUrl: string;
  position: StageAdvStandingDefinition['position'];
};

export type AdvViewModel = {
  state: AdvViewState;
  standings: AdvStandingModel[];
  speaker: string | null;
  text: string;
  faceImageUrl: string | null;
  progressText: string;
  errorMessage: string;
  completed: boolean;
};

export type AdvViewOptions = {
  onNext: () => void;
  onSkip: () => void;
  onRetry: () => void;
};

/** ADV의 스탠딩·대화창·입력 버튼을 그리는 Passive DOM View다. */
export type AdvView = {
  element: HTMLElement;
  render: (model: AdvViewModel) => void;
};

/** 키보드로 대사를 넘길 때 쓰는 키다. Space는 `event.key`가 빈칸 하나다. */
const ADVANCE_KEYS = new Set([' ', 'Enter']);

/** ADV 화면 DOM 루트와 단방향 render API를 만든다. */
export function createAdvView(options: AdvViewOptions): AdvView {
  const element = document.createElement('section');
  element.className = 'pf-adv';
  element.addEventListener('click', options.onNext);
  // 화면 아무 데나 눌러 넘기는 길은 포인터 전용이다. 키보드에는 건너뛰기만 남아
  // 읽지 않고 통째로 넘기는 것이 유일한 진행 수단이 된다.
  element.setAttribute('tabindex', '0');
  element.setAttribute('aria-keyshortcuts', 'Enter Space');
  element.addEventListener('keydown', (event) => {
    // 액션 버튼 위에서 누른 Enter/Space는 그 버튼의 click으로 끝나야 한다.
    if (event.target !== element || !ADVANCE_KEYS.has(event.key)) {
      return;
    }

    event.preventDefault();
    options.onNext();
  });

  const standings = document.createElement('div');
  standings.className = 'pf-adv__standings';
  standings.setAttribute('aria-hidden', 'true');

  const interfaceLayer = document.createElement('div');
  interfaceLayer.className = 'pf-adv__interface';

  const dialog = document.createElement('section');
  dialog.className = 'pf-adv__dialog';
  dialog.setAttribute('aria-live', 'polite');

  const face = document.createElement('img');
  face.className = 'pf-adv__face';
  face.alt = '';
  face.draggable = false;

  const copy = document.createElement('div');
  copy.className = 'pf-adv__copy';

  const speaker = document.createElement('h1');
  speaker.className = 'pf-adv__speaker';

  const text = document.createElement('p');
  text.className = 'pf-adv__text';

  const progress = document.createElement('p');
  progress.className = 'pf-adv__progress';
  copy.append(speaker, text, progress);

  const actions = document.createElement('div');
  actions.className = 'pf-adv__actions';

  const skipButton = createButton('건너뛰기', 'skip');
  skipButton.addEventListener('click', (event) => {
    event.stopPropagation();
    options.onSkip();
  });

  const retryButton = createButton('다시 시도', 'retry');
  retryButton.addEventListener('click', (event) => {
    event.stopPropagation();
    options.onRetry();
  });

  let renderedStandings = new Map<AdvStandingModel['position'], StandingElement>();
  let standingsSignature = '';

  actions.append(skipButton, retryButton);
  dialog.append(face, copy);
  interfaceLayer.append(actions, dialog);
  element.append(standings, interfaceLayer);

  return {
    element,
    render: (model) => {
      const nextStandingsSignature = JSON.stringify(model.standings);
      if (standingsSignature !== nextStandingsSignature) {
        renderedStandings = reconcileStandings(standings, renderedStandings, model.standings);
        standingsSignature = nextStandingsSignature;
      }

      const ready = model.state === 'ready';
      const error = model.state === 'error';
      const speakerVisible = ready && model.speaker !== null;
      speaker.classList.toggle('is-hidden', !speakerVisible);
      speaker.setAttribute('aria-hidden', String(!speakerVisible));
      speaker.textContent = model.speaker ?? '';
      text.textContent = ready
        ? model.text
        : error
          ? model.errorMessage
          : 'ADV 자산을 불러오는 중입니다...';
      progress.textContent = ready ? model.progressText : '';

      const faceVisible = ready && model.faceImageUrl !== null;
      face.classList.toggle('is-hidden', !faceVisible);
      face.setAttribute('aria-hidden', String(!faceVisible));
      if (model.faceImageUrl === null) {
        if (face.dataset.source !== undefined) {
          face.removeAttribute('src');
          delete face.dataset.source;
        }
      } else if (face.dataset.source !== model.faceImageUrl) {
        face.src = model.faceImageUrl;
        face.dataset.source = model.faceImageUrl;
      }
      face.alt = ready && model.speaker ? `${model.speaker} 표정` : '';

      retryButton.hidden = !error;
      skipButton.disabled = model.completed;
      retryButton.disabled = model.completed;
      element.dataset.state = model.completed ? 'completed' : model.state;
    },
  };
}

type StandingElement = {
  image: HTMLImageElement;
  imageUrl: string;
};

function reconcileStandings(
  container: HTMLElement,
  current: ReadonlyMap<AdvStandingModel['position'], StandingElement>,
  models: readonly AdvStandingModel[],
): Map<AdvStandingModel['position'], StandingElement> {
  const next = new Map<AdvStandingModel['position'], StandingElement>();

  const nextPositions = new Set(models.map((model) => model.position));
  for (const [position, standing] of current) {
    if (!nextPositions.has(position)) {
      container.removeChild(standing.image);
    }
  }

  for (const model of models) {
    const existing = current.get(model.position);
    const image = existing?.image ?? createStandingImage();
    if (existing?.imageUrl !== model.imageUrl) {
      image.src = model.imageUrl;
    }
    image.dataset.position = model.position;
    if (!existing) {
      container.append(image);
    }
    next.set(model.position, { image, imageUrl: model.imageUrl });
  }

  return next;
}

function createStandingImage(): HTMLImageElement {
  const image = document.createElement('img');
  image.className = 'pf-adv__standing';
  image.alt = '';
  image.draggable = false;
  return image;
}

function createButton(label: string, kind: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pf-btn-plain pf-adv__button';
  button.dataset.kind = kind;
  button.textContent = label;
  return button;
}
