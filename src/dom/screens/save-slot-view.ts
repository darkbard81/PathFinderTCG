import type { SaveSlotId, SaveSlotSummary } from '../../game/save/types';
import './save-slot.css';

export type SaveSlotStatusTone = 'normal' | 'danger' | 'error';

export type SaveSlotViewOptions = {
  onBack: () => void;
  onLogout: () => void;
  onRetry: () => void;
  onToggleDelete: () => void;
  onSelectSlot: (slotId: SaveSlotId) => void;
};

export type SaveSlotViewModel = {
  slots: SaveSlotSummary[];
  deleteMode: boolean;
  busy: boolean;
  status: string;
  statusTone: SaveSlotStatusTone;
  retryVisible: boolean;
  deleteButtonVisible: boolean;
};

/** 저장 슬롯 화면의 DOM 루트와 갱신 API다. */
export type SaveSlotView = {
  element: HTMLElement;
  render: (model: SaveSlotViewModel) => void;
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

  element.append(top, body, footer);

  const interactiveButtons = [backButton, logoutButton, retryButton, deleteButton];

  return {
    element,
    render: (model) => {
      status.textContent = model.status;
      status.dataset.tone = model.statusTone;
      deleteButton.textContent = model.deleteMode ? 'Cancel Delete' : 'Delete';
      deleteButton.hidden = !model.deleteButtonVisible;
      retryButton.hidden = !model.retryVisible;

      // 카드를 먼저 다시 만들고 나서 잠근다. 순서가 바뀌면 새 카드가 잠기지 않는다.
      slots.replaceChildren(
        ...model.slots.map((slot) =>
          createSlotCard(slot, model.deleteMode, () => options.onSelectSlot(slot.slotId)),
        ),
      );

      for (const button of interactiveButtons) {
        button.disabled = model.busy;
      }

      for (const card of slots.querySelectorAll<HTMLButtonElement>('button.pf-save-slot__card')) {
        card.disabled = model.busy;
      }
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
