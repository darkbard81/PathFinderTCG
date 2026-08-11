import { attachCardInspect } from './card-inspect';
import { createCardTileElement, type CardTile, type CardTileOptions } from './card-tile';
import './card-workbench.css';

/** 코스트 필터 배지 하나의 상태다. */
export type CostFilter = {
  cost: number;
  active: boolean;
};

/** 그리드에 놓을 카드 하나와 그 표시 상태다. */
export type CardGridEntry = CardTileOptions & {
  tile: CardTile;
};

/**
 * 길게 누르기·우클릭으로 상세를 열 때 호출한다.
 * 엔트리마다 콜백을 실어 나르지 않고 그리드가 타일의 instanceId를 넘긴다.
 */
export type CardInspectHandler = (instanceId: string) => void;

export type CardGridPanelModel = {
  /** 모드에 따라 제목이 바뀌는 패널만 넘긴다. 없으면 생성 시 제목을 유지한다. */
  title?: string;
  subtitle: string;
  entries: CardGridEntry[];
  emptyMessage: string;
  /** 비우면 필터 줄 자체가 사라진다. */
  costFilters?: CostFilter[];
};

export type CardGridPanel = {
  root: HTMLElement;
  render: (model: CardGridPanelModel) => void;
};

export type CardGridPanelOptions = {
  title: string;
  busy?: () => boolean;
  onToggleCost?: (cost: number) => void;
  onInspect?: CardInspectHandler;
};

/**
 * 헤더·코스트 필터·카드 그리드로 이루어진 패널을 만든다.
 * 덱 구성·장비·성장 화면이 같은 패널을 쓴다.
 */
export function createCardGridPanel(options: CardGridPanelOptions): CardGridPanel {
  const root = document.createElement('div');
  root.className = 'pf-workbench__panel';

  const header = document.createElement('div');
  header.className = 'pf-workbench__panel-header';

  const heading = document.createElement('h2');
  heading.className = 'pf-workbench__panel-title';
  heading.textContent = options.title;

  const subtitle = document.createElement('span');
  subtitle.className = 'pf-workbench__panel-subtitle';

  header.append(heading, subtitle);

  const filters = document.createElement('div');
  filters.className = 'pf-workbench__filters';

  const grid = createCardGrid(options.onInspect);

  root.append(header, filters, grid.root);

  function render(model: CardGridPanelModel): void {
    if (model.title !== undefined) {
      heading.textContent = model.title;
    }

    subtitle.textContent = model.subtitle;
    filters.replaceChildren(
      ...(model.costFilters ?? []).map((filter) =>
        createCostFilterButton(filter, options.busy?.() ?? false, options.onToggleCost),
      ),
    );
    grid.render(model.entries, model.emptyMessage);
  }

  return { root, render };
}

export type CardGrid = {
  root: HTMLElement;
  render: (entries: readonly CardGridEntry[], emptyMessage: string) => void;
};

/** 카드 타일을 감싸는 스크롤 그리드다. 패널 없이 단독으로도 쓴다. */
export function createCardGrid(onInspect?: CardInspectHandler): CardGrid {
  const root = document.createElement('div');
  root.className = 'pf-workbench__grid';
  // 카드가 넘치면 스크롤한다. 스크롤바 드래그를 받으려면 명시적 interactive가 필요하다.
  root.dataset.interactive = 'true';

  function render(entries: readonly CardGridEntry[], emptyMessage: string): void {
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'pf-workbench__empty';
      empty.textContent = emptyMessage;
      root.replaceChildren(empty);
      return;
    }

    root.replaceChildren(
      ...entries.map(({ tile, ...tileOptions }) => {
        const element = createCardTileElement(tile, tileOptions);
        if (onInspect) {
          attachCardInspect(element, () => onInspect(tile.instanceId));
        }

        return element;
      }),
    );
  }

  return { root, render };
}

function createCostFilterButton(
  filter: CostFilter,
  busy: boolean,
  onToggleCost?: (cost: number) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pf-workbench__filter';
  button.classList.toggle('is-active', filter.active);
  button.disabled = busy;
  button.textContent = String(filter.cost);
  button.setAttribute('aria-pressed', String(filter.active));
  button.setAttribute('aria-label', `코스트 ${filter.cost} 필터`);
  if (onToggleCost) {
    button.addEventListener('click', () => onToggleCost(filter.cost));
  }

  return button;
}

/** 사이드바 제목이다. */
export function createWorkbenchTitle(text: string): HTMLElement {
  const title = document.createElement('h1');
  title.className = 'pf-workbench__title';
  title.textContent = text;
  return title;
}

/** 사이드바의 라벨 한 줄이다. */
export function createSummaryLabel(text: string): HTMLElement {
  const label = document.createElement('div');
  label.className = 'pf-workbench__summary-label';
  label.textContent = text;
  return label;
}

/** 사이드바의 값 한 줄이다. `strong`은 크게 강조해서 보여준다. */
export function createSummaryValue(strong = false): HTMLElement {
  const value = document.createElement('div');
  value.className = strong ? 'pf-workbench__summary-strong' : 'pf-workbench__summary-value';
  return value;
}

export function createWorkbenchButton(label: string, primary = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = primary
    ? 'pf-btn9 pf-btn9--standard pf-workbench__button pf-workbench__button--primary'
    : 'pf-btn9 pf-btn9--standard pf-workbench__button';
  button.textContent = label;
  return button;
}

/**
 * 카드 목록에 실제로 존재하는 코스트만 필터 후보로 만든다.
 * 목업은 6개를 고정으로 두지만, 여기서는 데이터에 있는 값만 오름차순으로 보여준다.
 */
export function buildCostFilters(
  tiles: readonly CardTile[],
  activeCosts: ReadonlySet<number>,
): CostFilter[] {
  const costs = new Set<number>();
  for (const tile of tiles) {
    if (tile.cost !== null) {
      costs.add(tile.cost);
    }
  }

  return [...costs]
    .sort((left, right) => left - right)
    .map((cost) => ({ cost, active: activeCosts.has(cost) }));
}

/**
 * 선택된 코스트만 남긴다. 아무것도 선택하지 않았으면 전체를 보여준다.
 * 코스트가 없는 카드는 코스트 필터가 걸린 동안에는 숨긴다.
 */
export function filterTilesByCost<T extends { tile: CardTile }>(
  entries: readonly T[],
  activeCosts: ReadonlySet<number>,
): T[] {
  if (activeCosts.size === 0) {
    return [...entries];
  }

  return entries.filter((entry) => entry.tile.cost !== null && activeCosts.has(entry.tile.cost));
}

/** 필터 토글은 같은 값을 다시 누르면 해제한다. 새 Set을 만들어 반환한다. */
export function toggleCostFilter(activeCosts: ReadonlySet<number>, cost: number): Set<number> {
  const next = new Set(activeCosts);
  if (!next.delete(cost)) {
    next.add(cost);
  }

  return next;
}

/**
 * 카드 목록에 더 이상 없는 코스트를 활성 필터에서 뺀다.
 * 마지막 카드를 옮겨 필터 버튼이 사라지면 해제할 방법이 없어져 빈 패널에 갇힌다.
 */
export function pruneCostFilters(
  activeCosts: ReadonlySet<number>,
  tiles: readonly CardTile[],
): Set<number> {
  const available = new Set<number>();
  for (const tile of tiles) {
    if (tile.cost !== null) {
      available.add(tile.cost);
    }
  }

  return new Set([...activeCosts].filter((cost) => available.has(cost)));
}

/**
 * 사이드바 오른쪽 영역이다. 상세 패널이 위에 눕고 카드 패널들이 아래 남는 높이를 가져간다.
 * 상세를 세로 열로 세우면 그리드가 6열에서 4열로 줄어, 고르는 화면에서 손이 더 간다.
 */
export function createWorkbenchMain(
  detail: HTMLElement,
  panels: readonly HTMLElement[],
): HTMLElement {
  const main = document.createElement('div');
  main.className = 'pf-workbench__main';

  const row = document.createElement('div');
  row.className = 'pf-workbench__panels';
  row.append(...panels);

  main.append(detail, row);

  return main;
}
