import type { CardTile } from './card-tile';
import {
  createCardGridPanel,
  createSummaryLabel,
  createSummaryValue,
  createWorkbenchButton,
  createWorkbenchTitle,
  type CardGridEntry,
  type CostFilter,
} from './card-workbench';

/** UNIT 모드는 덱 유닛을, LEADER 모드는 리더 슬롯을 편집한다. */
export type DeckBuildMode = 'UNIT' | 'LEADER';

export type DeckBuildPanelModel = {
  title: string;
  subtitle: string;
  entries: CardGridEntry[];
  costFilters: CostFilter[];
  emptyMessage: string;
};

export type DeckBuildViewModel = {
  mode: DeckBuildMode;
  saveName: string;
  leaderName: string;
  deckCardCount: number;
  deck: DeckBuildPanelModel;
  collection: DeckBuildPanelModel;
  status: string;
  statusIsError: boolean;
  isDirty: boolean;
  busy: boolean;
};

export type DeckBuildViewOptions = {
  onSelectMode: (mode: DeckBuildMode) => void;
  onToggleDeckCost: (cost: number) => void;
  onToggleCollectionCost: (cost: number) => void;
  onSave: () => void;
  onBack: () => void;
};

export type DeckBuildView = {
  element: HTMLElement;
  render: (model: DeckBuildViewModel) => void;
};

const MODE_LABELS: Record<DeckBuildMode, string> = {
  UNIT: '유닛',
  LEADER: '리더',
};

/**
 * 덱 구성 크롬을 만든다. 사이드바(모드·요약·저장)와 덱/수집품 2패널 구성이다.
 * 배경은 캔버스가 담당하고, 카드 그리드와 필터는 전부 DOM이다.
 */
export function createDeckBuildView(options: DeckBuildViewOptions): DeckBuildView {
  let busy = false;

  const element = document.createElement('section');
  element.className = 'pf-workbench';

  const sidebar = document.createElement('aside');
  sidebar.className = 'pf-workbench__sidebar';
  sidebar.dataset.interactive = 'true';

  const modeTabs = document.createElement('div');
  modeTabs.className = 'pf-workbench__tabs';

  const modeButtons = new Map<DeckBuildMode, HTMLButtonElement>();
  for (const mode of ['UNIT', 'LEADER'] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pf-workbench__tab';
    button.textContent = MODE_LABELS[mode];
    button.addEventListener('click', () => options.onSelectMode(mode));
    modeButtons.set(mode, button);
    modeTabs.append(button);
  }

  const summary = document.createElement('div');
  summary.className = 'pf-workbench__summary';
  const saveNameValue = createSummaryValue();
  const countValue = createSummaryValue(true);
  const leaderValue = createSummaryValue();
  summary.append(
    createSummaryLabel('현재 덱'),
    saveNameValue,
    countValue,
    createSummaryLabel('리더'),
    leaderValue,
  );

  const spacer = document.createElement('div');
  spacer.className = 'pf-workbench__spacer';

  const status = document.createElement('p');
  status.className = 'pf-workbench__status';

  const actions = document.createElement('div');
  actions.className = 'pf-workbench__actions';
  const saveButton = createWorkbenchButton('덱 저장', true);
  saveButton.addEventListener('click', () => options.onSave());
  const backButton = createWorkbenchButton('뒤로');
  backButton.addEventListener('click', () => options.onBack());
  actions.append(saveButton, backButton);

  sidebar.append(createWorkbenchTitle('덱 관리'), modeTabs, summary, spacer, status, actions);

  const deckPanel = createCardGridPanel({
    title: '내 덱',
    busy: () => busy,
    onToggleCost: options.onToggleDeckCost,
  });
  const collectionPanel = createCardGridPanel({
    title: '수집품',
    busy: () => busy,
    onToggleCost: options.onToggleCollectionCost,
  });

  element.append(sidebar, deckPanel.root, collectionPanel.root);

  function render(model: DeckBuildViewModel): void {
    busy = model.busy;

    for (const [mode, button] of modeButtons) {
      button.classList.toggle('is-selected', model.mode === mode);
      button.disabled = model.busy;
    }

    saveNameValue.textContent = model.saveName;
    countValue.textContent = `${model.deckCardCount} 장`;
    leaderValue.textContent = model.leaderName;

    status.textContent = model.status;
    status.classList.toggle('is-error', model.statusIsError);

    saveButton.disabled = model.busy || !model.isDirty;
    saveButton.textContent = model.isDirty ? '덱 저장 *' : '덱 저장';
    backButton.disabled = model.busy;

    deckPanel.render(model.deck);
    collectionPanel.render(model.collection);
  }

  return { element, render };
}

/** 덱 구성 그리드에 놓을 카드 하나를 만든다. */
export function toDeckBuildEntry(
  tile: CardTile,
  selectable: boolean,
  onClick: () => void,
): CardGridEntry {
  return {
    tile,
    disabled: !selectable,
    // exactOptionalPropertyTypes 아래에서는 undefined 대입이 막힌다. 키 자체를 빼야 한다.
    ...(tile.level === null ? {} : { chip: `Lv.${tile.level}` }),
    onClick,
  };
}
