import { isStageUnlocked } from '../../game/stage/stage-definitions';
import type {
  StageBattleResult,
  StageDefeatCondition,
  StageDefinition,
  StageProgressState,
  StageVictoryCondition,
} from '../../game/stage/types';
import './stage.css';

export type StageCardState = 'selected' | 'cleared' | 'unlocked' | 'locked';

export type StageViewModel = {
  stages: StageDefinition[];
  progress: StageProgressState;
  selectedStageId: string;
  lastBattleResult: StageBattleResult | null;
  status: string;
  statusIsError: boolean;
  busy: boolean;
};

export type StageViewOptions = {
  onSelectStage: (stageId: string) => void;
  onBack: () => void;
  onStartBattle: () => void;
  onDeck: () => void;
  onEquipment: () => void;
  onGrowth: () => void;
  onLogout: () => void;
};

/** Stage 선택 화면 DOM 루트와 갱신 API다. */
export type StageView = {
  element: HTMLElement;
  render: (model: StageViewModel) => void;
  setStatus: (message: string, isError?: boolean) => void;
  setBusy: (busy: boolean) => void;
};

/**
 * Stage 목록·상세·HUD 크롬을 만든다.
 * 배경은 캔버스가 그리고, 레이아웃은 CSS가 담당한다.
 */
export function createStageView(options: StageViewOptions): StageView {
  const element = document.createElement('section');
  element.className = 'pf-stage';

  const top = document.createElement('header');
  top.className = 'pf-stage__top';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'pf-stage__title-group';

  const title = document.createElement('h1');
  title.className = 'pf-stage__title';
  title.textContent = 'STAGE SELECT';

  const subtitle = document.createElement('p');
  subtitle.className = 'pf-stage__subtitle';
  subtitle.textContent = 'Choose a battle stage';

  titleGroup.append(title, subtitle);

  const logoutButton = createHudButton('Logout', 'logout');
  logoutButton.addEventListener('click', () => options.onLogout());
  top.append(titleGroup, logoutButton);

  const body = document.createElement('div');
  body.className = 'pf-stage__body';

  const listPanel = document.createElement('section');
  listPanel.className = 'pf-stage__list-panel';
  listPanel.setAttribute('aria-label', 'Stages');

  const listHeading = document.createElement('h2');
  listHeading.className = 'pf-stage__list-heading';
  listHeading.textContent = 'Stages';

  const list = document.createElement('div');
  list.className = 'pf-stage__list';
  list.setAttribute('role', 'listbox');
  // 오버레이 기본 pointer-events:none 에서 스크롤바 드래그를 살리려면 스크롤 영역이 interactive여야 한다.
  list.dataset.interactive = 'true';
  listPanel.append(listHeading, list);

  const detailPanel = document.createElement('section');
  detailPanel.className = 'pf-stage__detail-panel';
  detailPanel.setAttribute('aria-live', 'polite');

  const detailTitle = document.createElement('h2');
  detailTitle.className = 'pf-stage__detail-title';

  const detailRows = document.createElement('div');
  detailRows.className = 'pf-stage__detail-rows';
  detailPanel.append(detailTitle, detailRows);

  body.append(listPanel, detailPanel);

  const resultPanel = document.createElement('section');
  resultPanel.className = 'pf-stage__result';
  resultPanel.hidden = true;

  const resultTitle = document.createElement('h3');
  resultTitle.className = 'pf-stage__result-title';
  const resultMeta = document.createElement('p');
  resultMeta.className = 'pf-stage__result-meta';
  const resultBody = document.createElement('p');
  resultBody.className = 'pf-stage__result-body';
  resultPanel.append(resultTitle, resultMeta, resultBody);

  const status = document.createElement('p');
  status.className = 'pf-stage__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const hud = document.createElement('footer');
  hud.className = 'pf-stage__hud';

  const backButton = createHudButton('Back', 'back');
  backButton.addEventListener('click', () => options.onBack());

  const startButton = createHudButton('Start Battle', 'start');
  startButton.addEventListener('click', () => options.onStartBattle());

  const deckButton = createHudButton('구성', 'deck');
  deckButton.addEventListener('click', () => options.onDeck());

  const equipmentButton = createHudButton('장비', 'equipment');
  equipmentButton.addEventListener('click', () => options.onEquipment());

  const growthButton = createHudButton('성장', 'growth');
  growthButton.addEventListener('click', () => options.onGrowth());

  const forgeButton = createHudButton('연성', 'forge');
  forgeButton.disabled = true;

  hud.append(backButton, startButton, deckButton, equipmentButton, growthButton, forgeButton);
  element.append(top, body, resultPanel, status, hud);

  const actionButtons = [
    logoutButton,
    backButton,
    startButton,
    deckButton,
    equipmentButton,
    growthButton,
  ];

  let currentBusy = false;
  let startEnabled = false;

  const applyBusy = (): void => {
    for (const button of actionButtons) {
      if (button === startButton) {
        button.disabled = currentBusy || !startEnabled;
        continue;
      }
      button.disabled = currentBusy;
    }
    forgeButton.disabled = true;
    for (const card of list.querySelectorAll<HTMLButtonElement>('button.pf-stage__card')) {
      card.disabled = currentBusy;
    }
  };

  return {
    element,
    setStatus: (message, isError = false) => {
      status.textContent = message;
      status.dataset.error = String(isError);
    },
    setBusy: (busy) => {
      currentBusy = busy;
      applyBusy();
    },
    render: (model) => {
      currentBusy = model.busy;
      status.textContent = model.status;
      status.dataset.error = String(model.statusIsError);

      const selected =
        model.stages.find((stage) => stage.id === model.selectedStageId) ?? model.stages[0];
      if (!selected) {
        return;
      }

      startEnabled = isStageUnlocked(selected, model.progress);
      renderStageList(list, model, options.onSelectStage);
      detailTitle.textContent = selected.name;
      detailRows.replaceChildren(
        createDetailRow('Victory', formatVictoryCondition(selected.victoryCondition)),
        createDetailRow('Defeat', selected.defeatConditions.map(formatDefeatCondition).join('\n')),
      );

      if (model.lastBattleResult) {
        resultPanel.hidden = false;
        const result = model.lastBattleResult;
        const stageName =
          model.stages.find((stage) => stage.id === result.stageId)?.name ?? result.stageId;
        resultPanel.dataset.outcome = result.outcome;
        resultTitle.textContent =
          result.outcome === 'WIN' ? 'Recent Result: VICTORY' : 'Recent Result: DEFEAT';
        resultMeta.textContent = `${stageName} · ${formatBattleResultReason(result)}`;
        resultBody.textContent = `Rewards: ${formatBattleResultRewards(result)}\nGrowth: ${formatBattleResultGrowth(result)}`;
      } else {
        resultPanel.hidden = true;
        delete resultPanel.dataset.outcome;
      }

      applyBusy();
    },
  };
}

function renderStageList(
  list: HTMLElement,
  model: StageViewModel,
  onSelectStage: (stageId: string) => void,
): void {
  list.replaceChildren();

  for (const stage of model.stages) {
    const unlocked = isStageUnlocked(stage, model.progress);
    const cleared = model.progress.clearedStageIds.includes(stage.id);
    const selected = stage.id === model.selectedStageId;

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pf-stage__card';
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', String(selected));
    card.dataset.state = selected
      ? 'selected'
      : cleared
        ? 'cleared'
        : unlocked
          ? 'unlocked'
          : 'locked';
    card.disabled = model.busy;

    const order = document.createElement('span');
    order.className = 'pf-stage__card-order';
    order.textContent = `Stage ${stage.order}`;

    const name = document.createElement('span');
    name.className = 'pf-stage__card-name';
    name.textContent = stage.name;

    const state = document.createElement('span');
    state.className = 'pf-stage__card-state';
    state.textContent = cleared ? 'CLEARED' : unlocked ? 'Unlocked' : 'Locked';

    card.append(order, name, state);
    card.addEventListener('click', () => onSelectStage(stage.id));
    list.append(card);
  }
}

function createDetailRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'pf-stage__detail-row';

  const labelEl = document.createElement('p');
  labelEl.className = 'pf-stage__detail-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('p');
  valueEl.className = 'pf-stage__detail-value';
  valueEl.textContent = value;

  row.append(labelEl, valueEl);
  return row;
}

function createHudButton(label: string, kind: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pf-stage__hud-button';
  button.dataset.kind = kind;
  button.textContent = label;
  return button;
}

/** 승리 조건을 상세 패널용 문구로 만든다. */
export function formatVictoryCondition(condition: StageVictoryCondition): string {
  if (condition.type === 'DEFEAT_ENEMY_LEADER') {
    return 'Defeat the enemy leader.';
  }

  return `Survive ${condition.turns} turns.`;
}

/** 패배 조건을 상세 패널용 문구로 만든다. */
export function formatDefeatCondition(condition: StageDefeatCondition): string {
  if (condition.type === 'PLAYER_LEADER_DEFEATED') {
    return 'Player leader defeated.';
  }
  if (condition.type === 'TURN_LIMIT') {
    return `Turn limit: ${condition.turns}.`;
  }

  return 'Deck out.';
}

/** 최근 전투 결과 사유를 한 줄로 만든다. */
export function formatBattleResultReason(result: StageBattleResult): string {
  if (result.reason === 'ENEMY_LEADER_DEFEATED') {
    return 'Enemy leader defeated';
  }

  return 'Player leader defeated';
}

/** 보상 카드 이름을 나열한다. */
export function formatBattleResultRewards(result: StageBattleResult): string {
  if (result.rewardCardNames.length === 0) {
    return 'No rewards';
  }

  return result.rewardCardNames.join(', ');
}

/** 성장 EXP 요약을 만든다. */
export function formatBattleResultGrowth(result: StageBattleResult): string {
  if (result.growth.cardInstanceIds.length === 0 || result.growth.expPerCard <= 0) {
    return 'No growth EXP';
  }

  return `+${result.growth.expPerCard} EXP to ${result.growth.cardInstanceIds.length} cards`;
}
