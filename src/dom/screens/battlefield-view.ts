import type { BattleSide, BattleSlotId } from '../../game/battle/types';
import { attachBattleCardDrag, toLogicalPoint } from './battle-drag';
import { createCardTileElement, type CardTile } from './card-tile';
import { listRowSlotIds, type BattleBoardMetrics, type BattleRowId } from './battlefield-layout';
import './battlefield.css';

export type BattleSkillBadgeModel = {
  skillId: string;
  /** 배지에 찍는 짧은 표기다. 회복·피해·강화를 값과 함께 한 눈에 구분한다. */
  glyph: string;
  effect: 'HEAL' | 'DAMAGE' | 'BUFF_ATTACK';
  /** 툴팁이다. 능력 이름과 효과 설명을 함께 담는다. */
  label: string;
};

export type BattleSlotModel = {
  slotId: BattleSlotId;
  card: CardTile | null;
  /** 빈 슬롯에 인접한 아군 지배력 합계다. 카드가 있으면 null이다. */
  dominance: number | null;
  /** 내 카드에 이번 턴 할 수 있는 일이 하나라도 남았는지다. 적 카드와 빈 칸은 null이다. */
  ready: boolean | null;
  /** 이 카드로 지금 쓸 수 있는 활성 스킬이다. 배지 하나가 스킬 하나에 대응한다. */
  skills: BattleSkillBadgeModel[];
};

/**
 * 지금 끌고 있는 것이 무엇인지다.
 * 카드 몸통은 이동·공격을, 스킬 배지는 그 스킬 대상만 노린다.
 * 잡는 곳을 나눠서 같은 칸에 놓았을 때 공격인지 스킬인지 되묻지 않아도 되게 했다.
 */
export type BattleDragSource =
  | { kind: 'hand'; cardInstanceId: string }
  | { kind: 'card'; cardInstanceId: string }
  | { kind: 'skill'; cardInstanceId: string; skillId: string };

export type BattleSideModel = {
  deckCount: number;
  dropCount: number;
  exileCount: number;
};

export type BattleHandCardModel = {
  tile: CardTile;
  /** 지금 놓을 수 있는 칸이 하나라도 있는지다. 없으면 흐리게 그려 집기 전에 알 수 있게 한다. */
  playable: boolean;
};

export type BattlefieldViewModel = {
  metrics: BattleBoardMetrics;
  stageName: string;
  turnNumber: number;
  currentSide: BattleSide;
  phaseLabel: string;
  enemy: BattleSideModel & { handCount: number };
  player: BattleSideModel;
  slots: Record<BattleRowId, BattleSlotModel[]>;
  hand: BattleHandCardModel[];
  status: string;
  statusIsError: boolean;
  canEndTurn: boolean;
  /** 최근 줄이 마지막에 오는 순서다. 뷰가 아래로 스크롤해 최신 줄을 보여준다. */
  log: string[];
  blockPrompt: BattleBlockPromptModel | null;
  result: BattleResultModel | null;
};

/**
 * 적 공격을 막을지 고르는 물음이다.
 * 엔진이 방어 후보를 다 계산해 주므로 뷰는 고르기만 시킨다.
 */
export type BattleBlockPromptModel = {
  message: string;
  blockers: { instanceId: string; label: string }[];
};

export type BattleResultModel = {
  title: string;
  body: string;
  isWin: boolean;
};

export type BattlefieldViewOptions = {
  onEndTurn: () => void;
  onLeave: () => void;
  /** 막을 유닛을 고르거나, null로 막지 않기를 고른다. */
  onBlock: (blockerInstanceId: string | null) => void;
  /**
   * 무언가를 집었을 때 놓을 수 있는 칸을 물어본다.
   * 드래그 중에는 render를 부르지 않으므로 이 결과로 강조를 켠다.
   */
  resolveTargets: (source: BattleDragSource) => BattleSlotId[];
  onDrop: (source: BattleDragSource, slotId: BattleSlotId) => void;
};

export type BattlefieldView = {
  element: HTMLElement;
  render: (model: BattlefieldViewModel) => void;
  /** 연출 캔버스를 붙일 곳이다. 카드 위에 겹치고 입력은 통과시킨다. */
  effectsHost: HTMLElement;
  /** 칸 가운데의 논리 좌표다. 칸을 못 찾으면 null이다. */
  getSlotCenter: (slotId: BattleSlotId) => { x: number; y: number } | null;
};

/** 각 진영 절반에서 위 행과 아래 행이 어느 슬롯 줄을 쓰는지다. 전위끼리 구분선을 사이에 두고 마주 본다. */
const HALF_ROWS: Record<BattleSide, readonly [BattleRowId, BattleRowId]> = {
  enemy: ['enemyBack', 'enemyFront'],
  player: ['playerFront', 'playerBack'],
};

/** 덱 더미 두께로 쓸 겹침 장수다. 맨 위 장에만 남은 수를 적는다. */
const DECK_STACK_OFFSETS = [16, 12, 8, 4, 0];

/**
 * 전장 화면 크롬을 만든다.
 * 보드는 위에서 아래로 적 후위·적 전위·구분선·내 전위·내 후위 순서로 쌓고,
 * 좌우 레일에 턴 정보와 조작 버튼을, 아래에는 엿보기 손패 서랍을 둔다.
 */
export function createBattlefieldView(options: BattlefieldViewOptions): BattlefieldView {
  const element = document.createElement('section');
  element.className = 'pf-battlefield';

  const board = document.createElement('div');
  board.className = 'pf-battlefield__board';

  // 칸 엘리먼트는 한 번만 만들고 계속 쓴다. 드래그는 이 맵으로 커서 아래 칸을 찾는다.
  const deps: BattleBoardDeps = {
    drag: { root: element, slots: new Map() },
    resolveTargets: options.resolveTargets,
    onDrop: options.onDrop,
  };

  const enemyHalf = createHalf('enemy', deps);
  const playerHalf = createHalf('player', deps);
  const divider = document.createElement('div');
  divider.className = 'pf-battlefield__divider';
  board.append(enemyHalf.root, divider, playerHalf.root);

  const leftRail = document.createElement('aside');
  leftRail.className = 'pf-battlefield__rail pf-battlefield__rail--left';
  leftRail.dataset.interactive = 'true';
  const turnBanner = document.createElement('div');
  turnBanner.className = 'pf-battlefield__turn-banner';
  const stageValue = createRailValue();
  const roundValue = createRailValue();
  const phaseValue = createRailValue();
  const log = document.createElement('ol');
  log.className = 'pf-battlefield__log';
  log.dataset.interactive = 'true';
  leftRail.append(
    turnBanner,
    createRailLabel('스테이지'),
    stageValue,
    createRailLabel('라운드'),
    roundValue,
    createRailLabel('단계'),
    phaseValue,
    createRailLabel('기록'),
    log,
  );

  const rightRail = document.createElement('aside');
  rightRail.className = 'pf-battlefield__rail pf-battlefield__rail--right';
  rightRail.dataset.interactive = 'true';
  const enemyHandValue = createRailValue();
  const status = document.createElement('p');
  status.className = 'pf-battlefield__status';
  const spacer = document.createElement('div');
  spacer.className = 'pf-battlefield__rail-spacer';
  const endTurnButton = createButton('턴 종료');
  endTurnButton.addEventListener('click', () => options.onEndTurn());
  const leaveButton = createButton('나가기');
  leaveButton.addEventListener('click', () => options.onLeave());
  rightRail.append(
    createRailLabel('적 손패'),
    enemyHandValue,
    status,
    spacer,
    endTurnButton,
    leaveButton,
  );

  const hand = document.createElement('div');
  hand.className = 'pf-battlefield__hand';
  hand.dataset.interactive = 'true';
  const handCards = document.createElement('div');
  handCards.className = 'pf-battlefield__hand-cards';
  hand.append(handCards);

  // 연출 캔버스는 카드 위, 모달 아래에 둔다. 결과 창이 연출에 가려지면 안 된다.
  const effectsHost = document.createElement('div');
  effectsHost.className = 'pf-battlefield__effects';

  const dialog = document.createElement('div');
  dialog.className = 'pf-battlefield__dialog';
  const dialogPanel = document.createElement('div');
  dialogPanel.className = 'pf-battlefield__dialog-panel';
  dialog.append(dialogPanel);

  element.append(leftRail, board, rightRail, hand, effectsHost, dialog);

  function render(model: BattlefieldViewModel): void {
    applyMetrics(element, model.metrics);

    turnBanner.textContent = model.currentSide === 'player' ? '내 차례' : '적 차례';
    turnBanner.classList.toggle('is-enemy', model.currentSide === 'enemy');
    stageValue.textContent = model.stageName;
    roundValue.textContent = `${model.turnNumber}`;
    phaseValue.textContent = model.phaseLabel;
    enemyHandValue.textContent = `${model.enemy.handCount}장`;
    status.textContent = model.status;
    status.classList.toggle('is-error', model.statusIsError);
    endTurnButton.disabled = !model.canEndTurn;

    enemyHalf.render(model.enemy, model.slots);
    playerHalf.render(model.player, model.slots);
    renderHand(model.hand);
    renderLog(model.log);
    renderDialog(model);
  }

  function renderLog(lines: string[]): void {
    log.replaceChildren(
      ...lines.map((line) => {
        const item = document.createElement('li');
        item.textContent = line;
        return item;
      }),
    );
    // 최신 줄이 아래에 쌓인다. 매번 끝으로 붙여야 방금 일어난 일이 보인다.
    log.scrollTop = log.scrollHeight;
  }

  function renderDialog(model: BattlefieldViewModel): void {
    // 결과가 먼저다. 승패가 났으면 방어 선택은 의미가 없다.
    if (model.result) {
      dialog.classList.add('is-open');
      dialogPanel.classList.toggle('is-win', model.result.isWin);
      const leave = createButton('스테이지로 돌아가기');
      leave.addEventListener('click', () => options.onLeave());
      dialogPanel.replaceChildren(
        createDialogTitle(model.result.title),
        createDialogBody(model.result.body),
        leave,
      );
      return;
    }

    if (!model.blockPrompt) {
      dialog.classList.remove('is-open');
      dialogPanel.replaceChildren();
      return;
    }

    dialog.classList.add('is-open');
    dialogPanel.classList.remove('is-win');
    const decline = createButton('막지 않는다');
    decline.addEventListener('click', () => options.onBlock(null));
    dialogPanel.replaceChildren(
      createDialogTitle('방어 선택'),
      createDialogBody(model.blockPrompt.message),
      ...model.blockPrompt.blockers.map((blocker) => {
        const button = createButton(blocker.label);
        button.addEventListener('click', () => options.onBlock(blocker.instanceId));
        return button;
      }),
      decline,
    );
  }

  function renderHand(cards: BattleHandCardModel[]): void {
    if (cards.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'pf-battlefield__hand-empty';
      empty.textContent = '손패가 비었습니다.';
      handCards.replaceChildren(empty);
      return;
    }

    handCards.replaceChildren(...cards.map((card) => createHandCardElement(card)));
  }

  function createHandCardElement(card: BattleHandCardModel): HTMLElement {
    const element = createCardTileElement(card.tile, {
      note: card.playable ? '끌어서 전장에 놓기' : '놓을 수 있는 칸이 없습니다',
    });
    element.classList.add('pf-battlefield__hand-card');
    element.classList.toggle('is-unplayable', !card.playable);

    const source: BattleDragSource = { kind: 'hand', cardInstanceId: card.tile.instanceId };
    attachBattleCardDrag(element, deps.drag, {
      begin: () => (card.playable ? deps.resolveTargets(source) : []),
      drop: (slotId) => deps.onDrop(source, slotId),
    });

    return element;
  }

  /** 칸 가운데를 논리 좌표로 돌려준다. 연출 캔버스가 오버레이와 같은 좌표계를 쓰게 한다. */
  function getSlotCenter(slotId: BattleSlotId): { x: number; y: number } | null {
    const slot = deps.drag.slots.get(slotId);
    if (!slot) {
      return null;
    }

    const rect = slot.getBoundingClientRect();

    return toLogicalPoint(
      element.getBoundingClientRect(),
      element.offsetWidth,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
  }

  return { element, render, effectsHost, getSlotCenter };
}

type BattleBoardDeps = {
  /** 칸 맵은 칸을 만들면서 채운다. attachBattleCardDrag는 이 맵을 읽기만 한다. */
  drag: { root: HTMLElement; slots: Map<BattleSlotId, HTMLElement> };
  resolveTargets: (source: BattleDragSource) => BattleSlotId[];
  onDrop: (source: BattleDragSource, slotId: BattleSlotId) => void;
};

type BattleHalf = {
  root: HTMLElement;
  render: (side: BattleSideModel, slots: Record<BattleRowId, BattleSlotModel[]>) => void;
};

function createHalf(side: BattleSide, deps: BattleBoardDeps): BattleHalf {
  const root = document.createElement('div');
  root.className = `pf-battlefield__half pf-battlefield__half--${side}`;

  const piles = document.createElement('div');
  piles.className = 'pf-battlefield__piles';
  const exile = createPile('추방');
  const drop = createPile('묘지');
  piles.append(exile.root, drop.root);

  const deck = document.createElement('div');
  deck.className = 'pf-battlefield__deck';
  const deckCount = document.createElement('span');
  deckCount.className = 'pf-battlefield__pile-count';
  const deckLabel = document.createElement('span');
  deckLabel.className = 'pf-battlefield__pile-label';
  deckLabel.textContent = '덱';
  for (const [index, offset] of DECK_STACK_OFFSETS.entries()) {
    const card = document.createElement('div');
    card.className = 'pf-battlefield__deck-card';
    card.style.top = `${offset}px`;
    card.style.zIndex = `${index + 1}`;
    // 맨 위 장에만 남은 장수를 적는다. 아래 장들은 두께만 만든다.
    if (offset === 0) {
      card.append(deckLabel, deckCount);
    }
    deck.append(card);
  }

  // 격자 배치는 자동 흐름에 맡기지 않는다. 더미 열이 두 행을 걸쳐 자리를 밀어내기 때문이다.
  const [topRow, bottomRow] = HALF_ROWS[side];
  const slotElements = new Map<BattleSlotId, BattleSlot>();
  root.append(piles, deck);
  for (const [rowIndex, row] of [topRow, bottomRow].entries()) {
    for (const [columnIndex, slotId] of listRowSlotIds(row).entries()) {
      const slot = createSlot(slotId, rowIndex + 1, columnIndex + 2, deps);
      slotElements.set(slotId, slot);
      deps.drag.slots.set(slotId, slot.root);
      root.append(slot.root);
    }
  }

  function render(model: BattleSideModel, slots: Record<BattleRowId, BattleSlotModel[]>): void {
    exile.setCount(model.exileCount);
    drop.setCount(model.dropCount);
    deckCount.textContent = `${model.deckCount}`;

    for (const row of [topRow, bottomRow]) {
      for (const slotModel of slots[row]) {
        slotElements.get(slotModel.slotId)?.render(slotModel);
      }
    }
  }

  return { root, render };
}

type BattleSlot = {
  root: HTMLElement;
  render: (model: BattleSlotModel) => void;
};

function createSlot(
  slotId: BattleSlotId,
  gridRow: number,
  gridColumn: number,
  deps: BattleBoardDeps,
): BattleSlot {
  const root = document.createElement('div');
  root.className = 'pf-battlefield__slot';
  root.dataset.slotId = slotId;
  root.style.gridRow = `${gridRow}`;
  root.style.gridColumn = `${gridColumn}`;

  function render(model: BattleSlotModel): void {
    root.classList.toggle('has-card', model.card !== null);
    root.classList.toggle('is-ready', model.ready === true);
    root.classList.toggle('is-spent', model.ready === false);

    if (model.card) {
      root.replaceChildren(createBoardCardElement(model.card, model), ...createSkillBadges(model));
      return;
    }

    if (model.dominance === null || model.dominance <= 0) {
      root.replaceChildren();
      return;
    }

    const dominance = document.createElement('span');
    dominance.className = 'pf-battlefield__dominance';
    dominance.textContent = `${model.dominance}`;
    dominance.title = `인접 지배력 ${model.dominance} · 코스트 ${model.dominance} 이하 카드를 놓을 수 있습니다.`;
    root.replaceChildren(dominance);
  }

  function createBoardCardElement(tile: CardTile, model: BattleSlotModel): HTMLElement {
    const element = createCardTileElement(tile, {
      ...(model.ready === true ? { note: '끌어서 이동하거나 적을 공격' } : {}),
    });
    element.classList.add('pf-battlefield__board-card');

    // 적 카드에는 드래그를 붙이지 않는다. 내 카드는 붙이되, 갈 곳이 없으면 begin이 빈 배열을 내
    // 드래그가 시작되지 않는다. 이동·공격을 다 쓰고 스킬만 남은 카드가 여기에 해당한다.
    if (model.ready !== null) {
      const source: BattleDragSource = { kind: 'card', cardInstanceId: tile.instanceId };
      attachBattleCardDrag(element, deps.drag, {
        begin: () => deps.resolveTargets(source),
        drop: (targetSlotId) => deps.onDrop(source, targetSlotId),
      });
    }

    return element;
  }

  function createSkillBadges(model: BattleSlotModel): HTMLElement[] {
    if (!model.card) {
      return [];
    }

    const cardInstanceId = model.card.instanceId;
    return model.skills.map((skill) => {
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = `pf-battlefield__skill pf-battlefield__skill--${skill.effect.toLowerCase()}`;
      badge.textContent = skill.glyph;
      badge.title = skill.label;
      badge.setAttribute('aria-label', skill.label);

      const source: BattleDragSource = { kind: 'skill', cardInstanceId, skillId: skill.skillId };
      attachBattleCardDrag(badge, deps.drag, {
        begin: () => deps.resolveTargets(source),
        drop: (targetSlotId) => deps.onDrop(source, targetSlotId),
      });

      return badge;
    });
  }

  return { root, render };
}

type BattlePile = {
  root: HTMLElement;
  setCount: (count: number) => void;
};

function createPile(label: string): BattlePile {
  const root = document.createElement('div');
  root.className = 'pf-battlefield__pile';

  const labelElement = document.createElement('span');
  labelElement.className = 'pf-battlefield__pile-label';
  labelElement.textContent = label;

  const countElement = document.createElement('span');
  countElement.className = 'pf-battlefield__pile-count';
  root.append(labelElement, countElement);

  return {
    root,
    setCount: (count) => {
      countElement.textContent = `${count}`;
    },
  };
}

/** 뷰포트마다 달라지는 치수를 루트 변수로 넣는다. 카드 타일 폭도 여기서 전장 크기로 덮어쓴다. */
function applyMetrics(element: HTMLElement, metrics: BattleBoardMetrics): void {
  element.style.setProperty('--pf-battle-card-width', `${metrics.cardWidth}px`);
  element.style.setProperty('--pf-battle-card-height', `${metrics.cardHeight}px`);
  element.style.setProperty('--pf-battle-gap', `${metrics.gap}px`);
  element.style.setProperty('--pf-battle-divider-height', `${metrics.dividerHeight}px`);
  element.style.setProperty('--pf-battle-padding-y', `${metrics.paddingY}px`);
  element.style.setProperty('--pf-battle-rail-width', `${metrics.railWidth}px`);
  element.style.setProperty('--pf-battle-rail-margin', `${metrics.railMargin}px`);
  element.style.setProperty('--pf-battle-hand-peek', `${metrics.handPeekHeight}px`);
  element.style.setProperty('--pf-battle-board-width', `${metrics.boardWidth}px`);
  element.style.setProperty('--pf-card-tile-width', `${metrics.cardWidth}px`);
}

function createRailLabel(text: string): HTMLElement {
  const label = document.createElement('span');
  label.className = 'pf-battlefield__rail-label';
  label.textContent = text;
  return label;
}

function createRailValue(): HTMLElement {
  const value = document.createElement('p');
  value.className = 'pf-battlefield__rail-value';
  return value;
}

function createButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pf-battlefield__button';
  button.textContent = label;
  return button;
}

function createDialogTitle(text: string): HTMLElement {
  const title = document.createElement('h2');
  title.className = 'pf-battlefield__dialog-title';
  title.textContent = text;
  return title;
}

function createDialogBody(text: string): HTMLElement {
  const body = document.createElement('p');
  body.className = 'pf-battlefield__dialog-body';
  body.textContent = text;
  return body;
}
