import type { BattleSide, BattleSlotId } from '../../game/battle/types';
import { createCardTileElement, type CardTile } from './card-tile';
import { listRowSlotIds, type BattleBoardMetrics, type BattleRowId } from './battlefield-layout';
import './battlefield.css';

export type BattleSlotModel = {
  slotId: BattleSlotId;
  card: CardTile | null;
  /** 빈 슬롯에 인접한 아군 지배력 합계다. 카드가 있으면 null이다. */
  dominance: number | null;
};

export type BattleSideModel = {
  deckCount: number;
  dropCount: number;
  exileCount: number;
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
  hand: CardTile[];
  status: string;
  canEndTurn: boolean;
};

export type BattlefieldViewOptions = {
  onEndTurn: () => void;
  onLeave: () => void;
};

export type BattlefieldView = {
  element: HTMLElement;
  render: (model: BattlefieldViewModel) => void;
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

  const enemyHalf = createHalf('enemy');
  const playerHalf = createHalf('player');
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
  leftRail.append(
    turnBanner,
    createRailLabel('스테이지'),
    stageValue,
    createRailLabel('라운드'),
    roundValue,
    createRailLabel('단계'),
    phaseValue,
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

  element.append(leftRail, board, rightRail, hand);

  function render(model: BattlefieldViewModel): void {
    applyMetrics(element, model.metrics);

    turnBanner.textContent = model.currentSide === 'player' ? '내 차례' : '적 차례';
    turnBanner.classList.toggle('is-enemy', model.currentSide === 'enemy');
    stageValue.textContent = model.stageName;
    roundValue.textContent = `${model.turnNumber}`;
    phaseValue.textContent = model.phaseLabel;
    enemyHandValue.textContent = `${model.enemy.handCount}장`;
    status.textContent = model.status;
    endTurnButton.disabled = !model.canEndTurn;

    enemyHalf.render(model.enemy, model.slots);
    playerHalf.render(model.player, model.slots);
    renderHand(model.hand);
  }

  function renderHand(tiles: CardTile[]): void {
    if (tiles.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'pf-battlefield__hand-empty';
      empty.textContent = '손패가 비었습니다.';
      handCards.replaceChildren(empty);
      return;
    }

    handCards.replaceChildren(...tiles.map((tile) => createCardTileElement(tile)));
  }

  return { element, render };
}

type BattleHalf = {
  root: HTMLElement;
  render: (side: BattleSideModel, slots: Record<BattleRowId, BattleSlotModel[]>) => void;
};

function createHalf(side: BattleSide): BattleHalf {
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
      const slot = createSlot(slotId, rowIndex + 1, columnIndex + 2);
      slotElements.set(slotId, slot);
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

function createSlot(slotId: BattleSlotId, gridRow: number, gridColumn: number): BattleSlot {
  const root = document.createElement('div');
  root.className = 'pf-battlefield__slot';
  root.dataset.slotId = slotId;
  root.style.gridRow = `${gridRow}`;
  root.style.gridColumn = `${gridColumn}`;

  function render(model: BattleSlotModel): void {
    root.classList.toggle('has-card', model.card !== null);

    if (model.card) {
      root.replaceChildren(createCardTileElement(model.card));
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
