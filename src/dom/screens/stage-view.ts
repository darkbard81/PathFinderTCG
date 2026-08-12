import { canChooseStageBgm } from '../../game/stage/stage-bgm';
import type {
  StageBattleResult,
  StageDefeatCondition,
  StageDefinition,
  StageVictoryCondition,
} from '../../game/stage/types';
import './stage.css';

export type StageCardState = 'selected' | 'cleared' | 'unlocked' | 'locked';

/**
 * 목록에 그릴 Stage 하나다.
 * 잠금·클리어 판정은 도메인 규칙이므로 뷰가 계산하지 않고 이미 정해진 값을 받는다.
 */
export type StageEntryModel = {
  definition: StageDefinition;
  unlocked: boolean;
  cleared: boolean;
};

/** 전투 BGM 드롭다운에 올릴 곡 하나다. */
export type StageBgmOption = {
  id: string;
  title: string;
};

export type StageViewModel = {
  stages: StageEntryModel[];
  selectedStageId: string;
  lastBattleResult: StageBattleResult | null;
  status: string;
  statusIsError: boolean;
  busy: boolean;
  /** 고를 수 있는 곡이다. 비면 BGM 구역을 감춘다. */
  bgmOptions: StageBgmOption[];
  /**
   * 지금 고른 곡 id다. 스테이지 기본값이 적용된 결과여서 화면은 그대로 보여 주기만 한다.
   * null이면 이 스테이지에 전투 곡이 없다는 뜻이고, 들어올 때 흐르던 곡이 이어진다.
   */
  selectedBgmId: string | null;
};

export type StageViewOptions = {
  onSelectStage: (stageId: string) => void;
  onBack: () => void;
  onStartBattle: () => void;
  /** 깬 스테이지에서 곡을 바꿨을 때 부른다. */
  onSelectBgm: (stageId: string, trackId: string) => void;
};

/** Stage 선택 화면 DOM 루트와 갱신 API다. */
export type StageView = {
  element: HTMLElement;
  render: (model: StageViewModel) => void;
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

  top.append(titleGroup);

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

  const detailScroll = document.createElement('div');
  detailScroll.className = 'pf-stage__detail-scroll';
  // 상세 패널 스크롤바 드래그용.
  detailScroll.dataset.interactive = 'true';

  const detailTitle = document.createElement('h2');
  detailTitle.className = 'pf-stage__detail-title';

  const detailRows = document.createElement('div');
  detailRows.className = 'pf-stage__detail-rows';

  /*
   * 전투 BGM 선택. 승리·패배 조건 아래에 따로 구역을 둔다.
   *
   * 조건은 스테이지가 정해 둔 규칙이고 이쪽은 사용자가 고르는 값이라 성격이 다르다.
   * 같은 줄 목록에 이어 붙이면 조건도 고칠 수 있는 것처럼 보인다.
   *
   * 깬 스테이지에서만 고를 수 있다. 아직 안 깬 스테이지는 데이터가 정한 곡을
   * 잠근 채로 보여 준다. 무엇이 나올지는 미리 알려 주되 바꾸지는 못하게 한다.
   */
  const bgmSection = document.createElement('div');
  bgmSection.className = 'pf-stage__bgm';
  bgmSection.dataset.interactive = 'true';

  const bgmLabel = document.createElement('label');
  bgmLabel.className = 'pf-stage__bgm-label';
  bgmLabel.textContent = '전투 BGM';

  const bgmSelect = document.createElement('select');
  bgmSelect.className = 'pf-stage__bgm-select';
  bgmLabel.append(bgmSelect);

  const bgmHint = document.createElement('p');
  bgmHint.className = 'pf-stage__bgm-hint';

  bgmSection.append(bgmLabel, bgmHint);
  detailScroll.append(detailTitle, detailRows, bgmSection);
  detailPanel.append(detailScroll);

  body.append(listPanel, detailPanel);

  const resultPanel = document.createElement('section');
  resultPanel.className = 'pf-stage__result';
  resultPanel.hidden = true;
  resultPanel.dataset.interactive = 'true';

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

  hud.append(backButton, startButton);
  element.append(top, body, resultPanel, status, hud);

  const actionButtons = [backButton, startButton];

  let currentBusy = false;
  let startEnabled = false;

  bgmSelect.addEventListener('change', () => {
    options.onSelectBgm(bgmSelect.dataset.stageId ?? '', bgmSelect.value);
  });

  /**
   * 전투 BGM 구역을 그린다.
   *
   * 깬 스테이지만 고를 수 있다. 그 밖에는 잠그되 어떤 곡이 나올지는 보여 준다.
   * 저장에 남은 곡이 자산에서 사라졌으면 목록에 없으므로, 그때는 잠긴 것처럼 다룬다.
   */
  function renderBgmSection(selected: StageEntryModel, model: StageViewModel): void {
    if (model.bgmOptions.length === 0) {
      bgmSection.hidden = true;
      return;
    }

    bgmSection.hidden = false;
    bgmSelect.dataset.stageId = selected.definition.id;
    bgmSelect.replaceChildren(
      ...model.bgmOptions.map((option) => {
        const element = document.createElement('option');
        element.value = option.id;
        element.textContent = option.title;
        return element;
      }),
    );

    const hasTrack = model.selectedBgmId !== null;
    if (hasTrack) {
      bgmSelect.value = model.selectedBgmId ?? '';
    }

    bgmSelect.disabled = currentBusy || !canChooseStageBgm(selected.cleared, model.selectedBgmId);
    bgmHint.textContent = !hasTrack
      ? '이 스테이지는 전투 곡이 정해져 있지 않습니다. 흐르던 곡이 이어집니다.'
      : selected.cleared
        ? '깬 스테이지라 곡을 바꿀 수 있습니다.'
        : '스테이지를 깨면 곡을 바꿀 수 있습니다.';
  }

  const applyBusy = (): void => {
    for (const button of actionButtons) {
      if (button === startButton) {
        button.disabled = currentBusy || !startEnabled;
        continue;
      }
      button.disabled = currentBusy;
    }
    for (const card of list.querySelectorAll<HTMLButtonElement>('button.pf-stage__card')) {
      card.disabled = currentBusy;
    }
  };

  return {
    element,
    render: (model) => {
      currentBusy = model.busy;
      status.textContent = model.status;
      status.dataset.error = String(model.statusIsError);

      const selected =
        model.stages.find((entry) => entry.definition.id === model.selectedStageId) ??
        model.stages[0];
      if (!selected) {
        return;
      }

      startEnabled = selected.unlocked;
      renderStageList(list, model, options.onSelectStage);
      detailTitle.textContent = selected.definition.name;
      detailRows.replaceChildren(
        createDetailRow('Victory', formatVictoryCondition(selected.definition.victoryCondition)),
        createDetailRow(
          'Defeat',
          selected.definition.defeatConditions.map(formatDefeatCondition).join('\n'),
        ),
      );

      renderBgmSection(selected, model);

      if (model.lastBattleResult) {
        resultPanel.hidden = false;
        const result = model.lastBattleResult;
        const stageName =
          model.stages.find((entry) => entry.definition.id === result.stageId)?.definition.name ??
          result.stageId;
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

  for (const { definition: stage, unlocked, cleared } of model.stages) {
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
  button.className = 'pf-btn9 pf-btn9--standard pf-stage__hud-button';
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
