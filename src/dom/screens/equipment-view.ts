import { createCardDetailView, type CardDetail } from './card-detail';
import {
  createCardGrid,
  createCardGridPanel,
  createWorkbenchMain,
  createSummaryLabel,
  createSummaryValue,
  createWorkbenchButton,
  createWorkbenchTitle,
  type CardGridEntry,
  type CostFilter,
} from './card-workbench';

export type EquipmentViewModel = {
  targetName: string;
  /** 선택한 유닛의 슬롯 사용량이다. 대상이 없으면 null이다. */
  slotUsage: { used: number; capacity: number } | null;
  /** 대상으로 고를 수 있는 덱 유닛이다. */
  units: {
    subtitle: string;
    entries: CardGridEntry[];
    emptyMessage: string;
  };
  /** 선택한 유닛에 장착된 장비다. 누르면 해제한다. */
  equipped: {
    entries: CardGridEntry[];
    emptyMessage: string;
  };
  /** 보유 중인 장비 카드다. 누르면 선택한 유닛에 장착한다. */
  available: {
    subtitle: string;
    entries: CardGridEntry[];
    costFilters: CostFilter[];
    emptyMessage: string;
  };
  status: string;
  statusIsError: boolean;
  isDirty: boolean;
  busy: boolean;
};

export type EquipmentViewOptions = {
  /** 카드를 길게 누르거나 우클릭했을 때다. instanceId를 넘긴다. */
  onInspect: (instanceId: string) => void;
  onToggleAvailableCost: (cost: number) => void;
  onSave: () => void;
  onBack: () => void;
};

export type EquipmentView = {
  element: HTMLElement;
  /** 상세 패널 내용이다. null이면 안내만 남긴다. */
  showDetail: (detail: CardDetail | null) => void;
  render: (model: EquipmentViewModel) => void;
};

/**
 * 장비 화면 크롬을 만든다.
 * 가운데 패널에서 덱 유닛을 고르고, 오른쪽 패널 위에 장착 목록·아래에 보유 장비를 놓는다.
 */
export function createEquipmentView(options: EquipmentViewOptions): EquipmentView {
  let busy = false;

  const element = document.createElement('section');
  element.className = 'pf-workbench';

  const sidebar = document.createElement('aside');
  sidebar.className = 'pf-workbench__sidebar';
  sidebar.dataset.interactive = 'true';

  const summary = document.createElement('div');
  summary.className = 'pf-workbench__summary';
  const targetValue = createSummaryValue();
  const slotValue = createSummaryValue(true);
  summary.append(createSummaryLabel('대상'), targetValue, createSummaryLabel('슬롯'), slotValue);

  const spacer = document.createElement('div');
  spacer.className = 'pf-workbench__spacer';

  const status = document.createElement('p');
  status.className = 'pf-workbench__status';

  const actions = document.createElement('div');
  actions.className = 'pf-workbench__actions';
  const saveButton = createWorkbenchButton('장비 저장', true);
  saveButton.addEventListener('click', () => options.onSave());
  const backButton = createWorkbenchButton('뒤로');
  backButton.addEventListener('click', () => options.onBack());
  actions.append(saveButton, backButton);

  sidebar.append(createWorkbenchTitle('장비'), summary, spacer, status, actions);

  const unitPanel = createCardGridPanel({
    title: '덱 유닛',
    busy: () => busy,
    onInspect: options.onInspect,
  });

  // 오른쪽 패널만 위아래로 나눈다. 위는 장착 목록(고정), 아래는 보유 장비(남는 높이).
  const equipmentPanel = document.createElement('div');
  equipmentPanel.className = 'pf-workbench__panel';

  const equippedSection = document.createElement('div');
  equippedSection.className = 'pf-workbench__section pf-workbench__section--fixed';
  const equippedTitle = document.createElement('h2');
  equippedTitle.className = 'pf-workbench__section-title';
  equippedTitle.textContent = '장착 중 (눌러서 해제)';
  const equippedGrid = createCardGrid(options.onInspect);
  equippedSection.append(equippedTitle, equippedGrid.root);

  const availableSection = document.createElement('div');
  availableSection.className = 'pf-workbench__section pf-workbench__section--grow';
  const availableHeader = document.createElement('div');
  availableHeader.className = 'pf-workbench__panel-header';
  const availableTitle = document.createElement('h2');
  availableTitle.className = 'pf-workbench__panel-title';
  availableTitle.textContent = '보유 장비';
  const availableSubtitle = document.createElement('span');
  availableSubtitle.className = 'pf-workbench__panel-subtitle';
  availableHeader.append(availableTitle, availableSubtitle);
  const availableFilters = document.createElement('div');
  availableFilters.className = 'pf-workbench__filters';
  const availableGrid = createCardGrid(options.onInspect);
  availableSection.append(availableHeader, availableFilters, availableGrid.root);

  equipmentPanel.append(equippedSection, availableSection);
  const detail = createCardDetailView({
    emptyMessage: '카드를 길게 누르거나 우클릭하면 상세를 봅니다.',
  });
  detail.root.classList.add('pf-card-detail--docked');
  element.append(
    sidebar,
    createWorkbenchMain(detail.root, [unitPanel.root, equipmentPanel]),
    detail.overlay,
  );

  function render(model: EquipmentViewModel): void {
    busy = model.busy;

    targetValue.textContent = model.targetName;
    slotValue.textContent = model.slotUsage
      ? `${model.slotUsage.used} / ${model.slotUsage.capacity}`
      : '-';

    status.textContent = model.status;
    status.classList.toggle('is-error', model.statusIsError);

    saveButton.disabled = model.busy || !model.isDirty;
    saveButton.textContent = model.isDirty ? '장비 저장 *' : '장비 저장';
    backButton.disabled = model.busy;

    unitPanel.render({
      subtitle: model.units.subtitle,
      entries: model.units.entries,
      emptyMessage: model.units.emptyMessage,
    });

    equippedGrid.render(model.equipped.entries, model.equipped.emptyMessage);

    availableSubtitle.textContent = model.available.subtitle;
    availableFilters.replaceChildren(
      ...model.available.costFilters.map((filter) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pf-workbench__filter';
        button.classList.toggle('is-active', filter.active);
        button.disabled = model.busy;
        button.textContent = String(filter.cost);
        button.setAttribute('aria-pressed', String(filter.active));
        button.setAttribute('aria-label', `코스트 ${filter.cost} 필터`);
        button.addEventListener('click', () => options.onToggleAvailableCost(filter.cost));
        return button;
      }),
    );
    availableGrid.render(model.available.entries, model.available.emptyMessage);
  }

  return { element, showDetail: detail.render, render };
}
