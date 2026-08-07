import type { RuntimeCardInstance } from '../../game/save/session';
import './deck-build.css';

/** 원본과 동일: UNIT 모드는 덱 유닛을, LEADER 모드는 리더 슬롯을 편집한다. */
export type DeckBuildMode = 'UNIT' | 'LEADER';

/**
 * 카드 한 장의 표시용 값이다. 도메인 타입을 그대로 DOM에 넘기지 않는다.
 * 이름·종류·능력 텍스트는 카드 이미지에 이미 그려져 있어 여기서는 수치만 다룬다.
 */
export type DeckBuildCardTile = {
  instanceId: string;
  cardId: string;
  name: string;
  cost: number | null;
  dominance: number | null;
  attack: number | null;
  hp: number | null;
  artUrl: string;
  /** false면 클릭해도 이동하지 않는다. LEADER 모드의 현재 리더가 여기 해당한다. */
  selectable: boolean;
};

export type DeckBuildCostFilter = {
  cost: number;
  active: boolean;
};

export type DeckBuildPanelModel = {
  title: string;
  subtitle: string;
  cards: DeckBuildCardTile[];
  costFilters: DeckBuildCostFilter[];
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
  onDeckCardClick: (instanceId: string) => void;
  onCollectionCardClick: (instanceId: string) => void;
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
  const element = document.createElement('section');
  element.className = 'pf-deck-build';

  const sidebar = document.createElement('aside');
  sidebar.className = 'pf-deck-build__sidebar';
  sidebar.dataset.interactive = 'true';

  const title = document.createElement('h1');
  title.className = 'pf-deck-build__title';
  title.textContent = '덱 관리';

  const modeTabs = document.createElement('div');
  modeTabs.className = 'pf-deck-build__mode-tabs';

  const modeButtons = new Map<DeckBuildMode, HTMLButtonElement>();
  for (const mode of ['UNIT', 'LEADER'] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pf-deck-build__mode-tab';
    button.textContent = MODE_LABELS[mode];
    button.addEventListener('click', () => options.onSelectMode(mode));
    modeButtons.set(mode, button);
    modeTabs.append(button);
  }

  const summary = document.createElement('div');
  summary.className = 'pf-deck-build__summary';

  const saveNameLabel = document.createElement('div');
  saveNameLabel.className = 'pf-deck-build__summary-label';
  saveNameLabel.textContent = '현재 덱';

  const saveNameValue = document.createElement('div');
  saveNameValue.className = 'pf-deck-build__summary-value';

  const countValue = document.createElement('div');
  countValue.className = 'pf-deck-build__summary-count';

  const leaderLabel = document.createElement('div');
  leaderLabel.className = 'pf-deck-build__summary-label';
  leaderLabel.textContent = '리더';

  const leaderValue = document.createElement('div');
  leaderValue.className = 'pf-deck-build__summary-leader';

  summary.append(saveNameLabel, saveNameValue, countValue, leaderLabel, leaderValue);

  const spacer = document.createElement('div');
  spacer.className = 'pf-deck-build__spacer';

  const status = document.createElement('p');
  status.className = 'pf-deck-build__status';

  const actions = document.createElement('div');
  actions.className = 'pf-deck-build__actions';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'pf-deck-build__button pf-deck-build__button--primary';
  saveButton.textContent = '덱 저장';
  saveButton.addEventListener('click', () => options.onSave());

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'pf-deck-build__button';
  backButton.textContent = '뒤로';
  backButton.addEventListener('click', () => options.onBack());

  actions.append(saveButton, backButton);
  sidebar.append(title, modeTabs, summary, spacer, status, actions);

  const deckPanel = createPanel('deck', options.onToggleDeckCost, options.onDeckCardClick);
  const collectionPanel = createPanel(
    'collection',
    options.onToggleCollectionCost,
    options.onCollectionCardClick,
  );

  element.append(sidebar, deckPanel.root, collectionPanel.root);

  function render(model: DeckBuildViewModel): void {
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

    deckPanel.render(model.deck, model.busy);
    collectionPanel.render(model.collection, model.busy);
  }

  return { element, render };
}

type PanelHandle = {
  root: HTMLElement;
  render: (model: DeckBuildPanelModel, busy: boolean) => void;
};

/** 덱/수집품 패널은 헤더·코스트 필터·카드 그리드 구조가 같다. 한 곳에서 만든다. */
function createPanel(
  kind: string,
  onToggleCost: (cost: number) => void,
  onCardClick: (instanceId: string) => void,
): PanelHandle {
  const root = document.createElement('div');
  root.className = `pf-deck-build__panel pf-deck-build__panel--${kind}`;

  const header = document.createElement('div');
  header.className = 'pf-deck-build__panel-header';

  const heading = document.createElement('h2');
  heading.className = 'pf-deck-build__panel-title';

  const subtitle = document.createElement('span');
  subtitle.className = 'pf-deck-build__panel-subtitle';

  header.append(heading, subtitle);

  const filters = document.createElement('div');
  filters.className = 'pf-deck-build__filters';

  const grid = document.createElement('div');
  grid.className = 'pf-deck-build__grid';
  // 카드가 넘치면 스크롤한다. 스크롤바 드래그를 받으려면 명시적 interactive가 필요하다.
  grid.dataset.interactive = 'true';

  root.append(header, filters, grid);

  function render(model: DeckBuildPanelModel, busy: boolean): void {
    heading.textContent = model.title;
    subtitle.textContent = model.subtitle;

    filters.replaceChildren(
      ...model.costFilters.map((filter) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pf-deck-build__filter';
        button.classList.toggle('is-active', filter.active);
        button.disabled = busy;
        button.textContent = String(filter.cost);
        button.setAttribute('aria-pressed', String(filter.active));
        button.setAttribute('aria-label', `코스트 ${filter.cost} 필터`);
        button.addEventListener('click', () => onToggleCost(filter.cost));
        return button;
      }),
    );

    if (model.cards.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'pf-deck-build__empty';
      empty.textContent = model.emptyMessage;
      grid.replaceChildren(empty);
      return;
    }

    grid.replaceChildren(
      ...model.cards.map((card) => createCardTile(card, busy, () => onCardClick(card.instanceId))),
    );
  }

  return { root, render };
}

/**
 * 카드 이미지를 통째로 깔고 수치만 얹는다.
 * 프레임·orb 도형·능력 텍스트·이름은 이미 이미지에 그려져 있고 수치만 비어 있다.
 */
function createCardTile(card: DeckBuildCardTile, busy: boolean, onClick: () => void): HTMLElement {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'pf-deck-build__card';
  tile.disabled = busy || !card.selectable;
  // 썸네일 크기에서는 이미지 속 이름을 읽을 수 없다. 접근성 이름과 툴팁으로 보완한다.
  tile.title = `${card.name} · 코스트 ${formatStat(card.cost)} · 지배력 ${formatStat(card.dominance)} · 공격 ${formatStat(card.attack)} · 체력 ${formatStat(card.hp)}`;
  tile.setAttribute('aria-label', tile.title);

  const image = document.createElement('img');
  image.className = 'pf-deck-build__card-image';
  image.src = card.artUrl;
  image.alt = '';
  image.loading = 'lazy';
  // 이미지가 없으면 배경 그라디언트만 남긴다. 수치는 그대로 읽을 수 있다.
  image.addEventListener('error', () => image.remove());

  tile.append(
    image,
    createOrbValue('cost', card.cost),
    createOrbValue('dominance', card.dominance),
    createOrbValue('attack', card.attack),
    createOrbValue('hp', card.hp),
  );
  tile.addEventListener('click', onClick);
  return tile;
}

/**
 * 카드 이미지에 그려진 orb 위에 수치 하나를 얹는다.
 * 값이 없으면 아무것도 그리지 않아 빈 orb가 그대로 보이게 둔다.
 */
function createOrbValue(kind: string, value: number | null): HTMLElement {
  const orb = document.createElement('span');
  orb.className = `pf-deck-build__orb pf-deck-build__orb--${kind}`;
  orb.textContent = value === null ? '' : String(value);
  return orb;
}

function formatStat(value: number | null): string {
  return value === null ? '-' : String(value);
}

/**
 * 런타임 카드 한 장을 표시용 타일 값으로 바꾼다.
 * 정의에 없는 스탯은 null로 두고, 배지에서 자리만 차지하게 한다.
 */
export function toDeckBuildCardTile(
  card: RuntimeCardInstance,
  assetBaseUrl: string,
  selectable: boolean,
): DeckBuildCardTile {
  const { definition, instance } = card;

  return {
    instanceId: instance.instanceId,
    cardId: definition.id,
    name: definition.name,
    cost: definition.cost ?? null,
    dominance: definition.dominance ?? null,
    attack: definition.attack ?? null,
    hp: definition.hp ?? null,
    artUrl: `${assetBaseUrl.replace(/\/+$/, '')}/cards/webp/${definition.id}.webp`,
    selectable,
  };
}

/**
 * 카드 목록에 실제로 존재하는 코스트만 필터 후보로 만든다.
 * 목업은 6개를 고정으로 두지만, 여기서는 데이터에 있는 값만 오름차순으로 보여준다.
 */
export function buildCostFilters(
  cards: readonly DeckBuildCardTile[],
  activeCosts: ReadonlySet<number>,
): DeckBuildCostFilter[] {
  const costs = new Set<number>();
  for (const card of cards) {
    if (card.cost !== null) {
      costs.add(card.cost);
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
export function filterCardsByCost(
  cards: readonly DeckBuildCardTile[],
  activeCosts: ReadonlySet<number>,
): DeckBuildCardTile[] {
  if (activeCosts.size === 0) {
    return [...cards];
  }

  return cards.filter((card) => card.cost !== null && activeCosts.has(card.cost));
}

/**
 * 카드 목록에 더 이상 없는 코스트를 활성 필터에서 뺀다.
 * 마지막 카드를 옮겨 필터 버튼이 사라지면 해제할 방법이 없어져 빈 패널에 갇힌다.
 */
export function pruneCostFilters(
  activeCosts: ReadonlySet<number>,
  cards: readonly DeckBuildCardTile[],
): Set<number> {
  const available = new Set<number>();
  for (const card of cards) {
    if (card.cost !== null) {
      available.add(card.cost);
    }
  }

  return new Set([...activeCosts].filter((cost) => available.has(cost)));
}

/** 필터 토글은 같은 값을 다시 누르면 해제한다. 새 Set을 만들어 반환한다. */
export function toggleCostFilter(activeCosts: ReadonlySet<number>, cost: number): Set<number> {
  const next = new Set(activeCosts);
  if (!next.delete(cost)) {
    next.add(cost);
  }

  return next;
}
