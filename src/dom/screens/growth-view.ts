import { createCardDetailView, type CardDetail } from './card-detail';
import {
  createCardGridPanel,
  createWorkbenchMain,
  createSummaryLabel,
  createSummaryValue,
  createWorkbenchButton,
  createWorkbenchTitle,
  type CardGridEntry,
  type CostFilter,
} from './card-workbench';

export type GrowthViewModel = {
  targetName: string;
  targetLevel: number | null;
  targetExp: number | null;
  /** 선택한 재료가 줄 EXP 합계다. */
  pendingExp: number;
  selectedMaterialCount: number;
  target: {
    subtitle: string;
    entries: CardGridEntry[];
    emptyMessage: string;
  };
  materials: {
    subtitle: string;
    entries: CardGridEntry[];
    costFilters: CostFilter[];
    emptyMessage: string;
  };
  status: string;
  statusIsError: boolean;
  isDirty: boolean;
  canGrow: boolean;
  busy: boolean;
};

export type GrowthViewOptions = {
  /** 카드를 길게 누르거나 우클릭했을 때다. instanceId를 넘긴다. */
  onInspect: (instanceId: string) => void;
  onToggleMaterialCost: (cost: number) => void;
  onGrow: () => void;
  onClearMaterials: () => void;
  onSave: () => void;
  onBack: () => void;
};

export type GrowthView = {
  element: HTMLElement;
  /** 상세 패널 내용이다. null이면 안내만 남긴다. */
  showDetail: (detail: CardDetail | null) => void;
  render: (model: GrowthViewModel) => void;
};

/**
 * 성장 화면 크롬을 만든다.
 * 가운데에서 성장시킬 덱 카드를 고르고, 오른쪽에서 재료를 여러 장 골라 한 번에 흡수시킨다.
 */
export function createGrowthView(options: GrowthViewOptions): GrowthView {
  let busy = false;

  const element = document.createElement('section');
  element.className = 'pf-workbench';

  const sidebar = document.createElement('aside');
  sidebar.className = 'pf-workbench__sidebar';
  sidebar.dataset.interactive = 'true';

  const summary = document.createElement('div');
  summary.className = 'pf-workbench__summary';
  const targetValue = createSummaryValue();
  const levelValue = createSummaryValue(true);
  const expValue = createSummaryValue();
  const pendingValue = createSummaryValue();
  summary.append(
    createSummaryLabel('대상'),
    targetValue,
    createSummaryLabel('레벨'),
    levelValue,
    createSummaryLabel('누적 EXP'),
    expValue,
    createSummaryLabel('선택한 재료'),
    pendingValue,
  );

  const spacer = document.createElement('div');
  spacer.className = 'pf-workbench__spacer';

  const status = document.createElement('p');
  status.className = 'pf-workbench__status';

  const actions = document.createElement('div');
  actions.className = 'pf-workbench__actions';
  const growButton = createWorkbenchButton('성장', true);
  growButton.addEventListener('click', () => options.onGrow());
  const clearButton = createWorkbenchButton('선택 해제');
  clearButton.addEventListener('click', () => options.onClearMaterials());
  const saveButton = createWorkbenchButton('저장');
  saveButton.addEventListener('click', () => options.onSave());
  const backButton = createWorkbenchButton('뒤로');
  backButton.addEventListener('click', () => options.onBack());
  actions.append(growButton, clearButton, saveButton, backButton);

  sidebar.append(createWorkbenchTitle('성장'), summary, spacer, status, actions);

  const targetPanel = createCardGridPanel({
    title: '덱 카드',
    busy: () => busy,
    onInspect: options.onInspect,
  });
  const materialPanel = createCardGridPanel({
    onInspect: options.onInspect,
    title: '재료 (여러 장 선택)',
    busy: () => busy,
    onToggleCost: options.onToggleMaterialCost,
  });

  const detail = createCardDetailView({
    emptyMessage: '카드를 길게 누르거나 우클릭하면 상세를 봅니다.',
  });
  detail.root.classList.add('pf-card-detail--docked');
  element.append(
    sidebar,
    createWorkbenchMain(detail.root, [targetPanel.root, materialPanel.root]),
    detail.overlay,
  );

  function render(model: GrowthViewModel): void {
    busy = model.busy;

    targetValue.textContent = model.targetName;
    levelValue.textContent = model.targetLevel === null ? '-' : `Lv.${model.targetLevel}`;
    expValue.textContent = model.targetExp === null ? '-' : `${model.targetExp}`;
    pendingValue.textContent =
      model.selectedMaterialCount === 0
        ? '없음'
        : `${model.selectedMaterialCount}장 · +${model.pendingExp} EXP`;

    status.textContent = model.status;
    status.classList.toggle('is-error', model.statusIsError);

    growButton.disabled = model.busy || !model.canGrow;
    clearButton.disabled = model.busy || model.selectedMaterialCount === 0;
    saveButton.disabled = model.busy || !model.isDirty;
    saveButton.textContent = model.isDirty ? '저장 *' : '저장';
    backButton.disabled = model.busy;

    targetPanel.render({
      subtitle: model.target.subtitle,
      entries: model.target.entries,
      emptyMessage: model.target.emptyMessage,
    });

    materialPanel.render({
      subtitle: model.materials.subtitle,
      entries: model.materials.entries,
      emptyMessage: model.materials.emptyMessage,
      costFilters: model.materials.costFilters,
    });
  }

  return { element, showDetail: detail.render, render };
}
