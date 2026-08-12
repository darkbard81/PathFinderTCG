import type { SaveSlotId, SaveSlotSummary } from '../../game/save/types';
import './save-slot.css';

export type SaveSlotStatusTone = 'normal' | 'danger' | 'error';

export type SaveSlotViewOptions = {
  saveNameMaxLength: number;
  onBack: () => void;
  onLogout: () => void;
  onRetry: () => void;
  onToggleDelete: () => void;
  onSelectSlot: (slotId: SaveSlotId) => void;
  onCreateSlot: (slotId: SaveSlotId, saveName: string) => void;
};

export type SaveSlotViewModel = {
  slots: SaveSlotSummary[];
  deleteMode: boolean;
  busy: boolean;
  status: string;
  statusTone: SaveSlotStatusTone;
  retryVisible: boolean;
  deleteButtonVisible: boolean;
  createNameError: string;
};

/** 저장 슬롯 화면의 DOM 루트와 갱신 API다. */
export type SaveSlotView = {
  element: HTMLElement;
  render: (model: SaveSlotViewModel) => void;
  /** 빈 슬롯을 고른 사건에 맞춰 이름 입력 다이얼로그를 연다. */
  requestSaveName: (slotId: SaveSlotId, initialName: string) => void;
  /** 생성이 끝났거나 화면을 떠날 때 이름 입력 다이얼로그를 닫는다. */
  closeSaveNameDialog: () => void;
};

/**
 * 저장 슬롯 선택 화면의 DOM 크롬을 만든다.
 * 배경은 캔버스가 그리고, 여기에는 버튼·카드·상태 문구만 둔다.
 */
export function createSaveSlotView(options: SaveSlotViewOptions): SaveSlotView {
  const element = document.createElement('section');
  element.className = 'pf-save-slot';

  const top = document.createElement('header');
  top.className = 'pf-save-slot__top';

  const backButton = createChromeButton('Back');
  backButton.addEventListener('click', () => options.onBack());

  const titleGroup = document.createElement('div');
  titleGroup.className = 'pf-save-slot__title-group';

  const title = document.createElement('h1');
  title.className = 'pf-save-slot__title';
  title.textContent = 'START GAME';

  const subtitle = document.createElement('p');
  subtitle.className = 'pf-save-slot__subtitle';
  subtitle.textContent = 'Choose a save slot';

  titleGroup.append(title, subtitle);

  const logoutButton = createChromeButton('Logout');
  logoutButton.addEventListener('click', () => options.onLogout());

  top.append(backButton, titleGroup, logoutButton);

  const body = document.createElement('div');
  body.className = 'pf-save-slot__body';
  // 좁은 높이에서 본문만 스크롤. 스크롤바 드래그용 interactive 표시.
  body.dataset.interactive = 'true';

  const status = document.createElement('p');
  status.className = 'pf-save-slot__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'Loading save slots...';

  const slots = document.createElement('div');
  slots.className = 'pf-save-slot__slots';
  slots.setAttribute('role', 'list');

  const retryButton = createActionButton('Retry');
  retryButton.classList.add('pf-save-slot__retry');
  retryButton.hidden = true;
  retryButton.addEventListener('click', () => options.onRetry());

  body.append(status, slots, retryButton);

  const footer = document.createElement('footer');
  footer.className = 'pf-save-slot__footer';

  const deleteButton = createActionButton('Delete');
  deleteButton.classList.add('pf-save-slot__delete');
  deleteButton.addEventListener('click', () => options.onToggleDelete());
  footer.append(deleteButton);

  const nameDialog = createSaveNameDialog({
    maxLength: options.saveNameMaxLength,
    onSubmit: options.onCreateSlot,
  });

  element.append(top, body, footer, nameDialog.root);

  const interactiveButtons = [
    backButton,
    logoutButton,
    retryButton,
    deleteButton,
    ...nameDialog.buttons,
  ];

  return {
    element,
    render: (model) => {
      status.textContent = model.status;
      status.dataset.tone = model.statusTone;
      deleteButton.textContent = model.deleteMode ? 'Cancel Delete' : 'Delete';
      deleteButton.hidden = !model.deleteButtonVisible;
      retryButton.hidden = !model.retryVisible;
      nameDialog.setError(model.createNameError);

      // 카드를 먼저 다시 만들고 나서 잠근다. 순서가 바뀌면 새 카드가 잠기지 않는다.
      slots.replaceChildren(
        ...model.slots.map((slot) =>
          createSlotCard(slot, model.deleteMode, () => options.onSelectSlot(slot.slotId)),
        ),
      );

      for (const button of interactiveButtons) {
        button.disabled = model.busy;
      }
      nameDialog.input.disabled = model.busy;

      for (const card of slots.querySelectorAll<HTMLButtonElement>('button.pf-save-slot__card')) {
        card.disabled = model.busy;
      }
    },
    requestSaveName: nameDialog.open,
    closeSaveNameDialog: nameDialog.close,
  };
}

function createSaveNameDialog(options: {
  maxLength: number;
  onSubmit: (slotId: SaveSlotId, saveName: string) => void;
}): {
  root: HTMLDivElement;
  input: HTMLInputElement;
  buttons: HTMLButtonElement[];
  open: (slotId: SaveSlotId, initialName: string) => void;
  close: () => void;
  setError: (message: string) => void;
} {
  const root = document.createElement('div');
  root.className = 'pf-save-slot__name-dialog';
  // 모달 바깥 클릭이 뒤쪽 슬롯·내비게이션 버튼으로 통과하지 않게 backdrop이 입력을 받는다.
  root.dataset.interactive = 'true';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'pf-save-slot-name-title');

  const form = document.createElement('form');
  form.className = 'pf-save-slot__name-panel';

  const title = document.createElement('h2');
  title.id = 'pf-save-slot-name-title';
  title.className = 'pf-save-slot__name-title';
  title.textContent = '저장 이름';

  const label = document.createElement('label');
  label.className = 'pf-save-slot__name-label';
  label.textContent = `이름 (${options.maxLength}자 이내)`;

  const input = document.createElement('input');
  input.className = 'pf-save-slot__name-input';
  input.type = 'text';
  input.required = true;
  input.maxLength = options.maxLength;
  input.autocomplete = 'off';
  label.append(input);

  const error = document.createElement('p');
  error.className = 'pf-save-slot__name-error';
  error.setAttribute('role', 'alert');

  const actions = document.createElement('div');
  actions.className = 'pf-save-slot__name-actions';
  const cancelButton = createActionButton('취소');
  const submitButton = createActionButton('생성');
  submitButton.type = 'submit';
  actions.append(cancelButton, submitButton);

  form.append(title, label, error, actions);
  root.append(form);

  let slotId: SaveSlotId = 1;
  // 다이얼로그를 연 슬롯 카드를 기억해 두고 닫을 때 초점을 돌려준다.
  let opener: HTMLElement | null = null;
  const close = (): void => {
    root.hidden = true;
    error.textContent = '';
    opener?.focus();
    opener = null;
  };

  cancelButton.addEventListener('click', close);
  /*
   * 생성 요청이 도는 동안에는 취소 버튼도 잠기므로 Escape를 유일한 탈출구로 남긴다.
   * 요청이 늦게 끝나도 결과는 화면 아래 상태 문구로 남으니 닫아도 잃는 정보가 없다.
   */
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    options.onSubmit(slotId, input.value);
  });

  return {
    root,
    input,
    buttons: [cancelButton, submitButton],
    open: (nextSlotId, initialName) => {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      slotId = nextSlotId;
      input.value = initialName;
      error.textContent = '';
      root.hidden = false;
      input.focus();
      input.select();
    },
    close,
    setError: (message) => {
      error.textContent = message;
    },
  };
}

function createChromeButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pf-btn9 pf-btn9--standard pf-save-slot__chrome-button';
  button.textContent = label;
  return button;
}

function createActionButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pf-btn9 pf-btn9--standard pf-save-slot__action-button';
  button.textContent = label;
  return button;
}

function createSlotCard(
  slot: SaveSlotSummary,
  deleteMode: boolean,
  onSelect: () => void,
): HTMLButtonElement {
  const isDeleteTarget = deleteMode && !slot.isEmpty;
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'pf-save-slot__card';
  card.setAttribute('role', 'listitem');
  card.dataset.slotId = String(slot.slotId);

  if (isDeleteTarget) {
    card.classList.add('pf-save-slot__card--delete');
  } else if (slot.isEmpty) {
    card.classList.add('pf-save-slot__card--empty');
  } else {
    card.classList.add('pf-save-slot__card--ready');
  }

  const slotLabel = document.createElement('p');
  slotLabel.className = 'pf-save-slot__slot-label';
  slotLabel.textContent = `Slot ${slot.slotId}`;

  const title = document.createElement('p');
  title.className = 'pf-save-slot__card-title';
  title.textContent = slot.isEmpty ? 'Empty Slot' : (slot.saveName ?? `Slot ${slot.slotId}`);

  const subtitle = document.createElement('p');
  subtitle.className = 'pf-save-slot__card-subtitle';
  subtitle.textContent = slot.isEmpty ? 'Create New Save' : formatSaveSlotSubtitle(slot);

  const footer = document.createElement('p');
  footer.className = 'pf-save-slot__card-footer';
  footer.textContent = deleteMode
    ? slot.isEmpty
      ? 'Already empty'
      : 'Click to delete'
    : slot.isEmpty
      ? 'Click to create'
      : 'Click to load';

  card.append(slotLabel, title, subtitle, footer);
  card.addEventListener('click', onSelect);
  return card;
}

/**
 * 점유된 슬롯 카드에 보여줄 한 줄 요약을 만든다.
 * 날짜·덱 장수·리더 이름 중 있는 항목만 연결한다.
 */
export function formatSaveSlotSubtitle(slot: SaveSlotSummary): string {
  if (slot.isEmpty) {
    return 'Create New Save';
  }

  const lines: string[] = [];

  if (slot.updatedAt) {
    lines.push(`Updated ${formatSaveSlotDate(slot.updatedAt)}`);
  }

  if (slot.deckCardCount !== null) {
    lines.push(`${slot.deckCardCount} cards`);
  }

  if (slot.leaderName) {
    lines.push(`Leader: ${slot.leaderName}`);
  }

  return lines.length > 0 ? lines.join(' · ') : 'Ready to load';
}

/** 저장 시각을 한국어 짧은 형식으로 보여 준다. 파싱 실패 시 원문을 그대로 쓴다. */
export function formatSaveSlotDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
