import { CARD_TEXT_TOOL_ACCOUNT_ID } from '../../tools/card-text/access';
import './main-menu.css';

/** 이 계정에만 카드 텍스트 도구 진입을 연다. 서버 게이트와 같은 상수를 쓴다. */
export { CARD_TEXT_TOOL_ACCOUNT_ID };

export type MainMenuLicenseLink = {
  label: string;
  purpose: string;
  /** 공개 URL이 없으면 빈 문자열. 링크 없이 라벨·용도만 표시한다. */
  url: string;
};

export type MainMenuViewOptions = {
  accountId: string | null;
  loadSummary: string;
  showCardTextTool: boolean;
  licenseLinks: readonly MainMenuLicenseLink[];
  licenseIntro: string;
  onStartGame: () => void;
  onCardTextTool: () => void;
  onLicense: () => void;
  onLogout: () => void;
  onCloseLicense: () => void;
};

export type MainMenuViewModel = {
  status: string;
  statusIsError: boolean;
  busy: boolean;
  licenseOpen: boolean;
};

/** 메인 메뉴 DOM 루트와 갱신 API다. */
export type MainMenuView = {
  element: HTMLElement;
  render: (model: MainMenuViewModel) => void;
};

/**
 * 메인 메뉴 크롬(제목, 버튼, 상태, 라이선스 다이얼로그)을 만든다.
 * 배경은 캔버스가 담당한다.
 */
export function createMainMenuView(options: MainMenuViewOptions): MainMenuView {
  const element = document.createElement('section');
  element.className = 'pf-main-menu';
  // 카드 텍스트 툴 등으로 세로가 넘칠 때 스크롤바 드래그용.
  element.dataset.interactive = 'true';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'pf-main-menu__title-group';

  const title = document.createElement('h1');
  title.className = 'pf-main-menu__title';
  title.textContent = 'ARCANE FRONTIER TCG';

  const subtitle = document.createElement('p');
  subtitle.className = 'pf-main-menu__subtitle';
  subtitle.textContent = 'main menu';

  titleGroup.append(title, subtitle);

  const actions = document.createElement('div');
  actions.className = 'pf-main-menu__actions';

  const startButton = createMenuButton('Start Game');
  startButton.addEventListener('click', () => options.onStartGame());
  actions.append(startButton);

  let cardTextButton: HTMLButtonElement | null = null;
  if (options.showCardTextTool) {
    cardTextButton = createMenuButton('Card Text Tool');
    cardTextButton.addEventListener('click', () => options.onCardTextTool());
    actions.append(cardTextButton);
  }

  const licenseButton = createMenuButton('License');
  licenseButton.addEventListener('click', () => options.onLicense());
  const logoutButton = createMenuButton('Logout');
  logoutButton.addEventListener('click', () => options.onLogout());
  actions.append(licenseButton, logoutButton);

  const statusGroup = document.createElement('div');
  statusGroup.className = 'pf-main-menu__status-group';

  const status = document.createElement('p');
  status.className = 'pf-main-menu__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = options.loadSummary;

  const helper = document.createElement('p');
  helper.className = 'pf-main-menu__helper';
  helper.textContent = `Signed in as ${options.accountId ?? 'unknown'}`;

  statusGroup.append(status, helper);

  const license = createLicenseDialog({
    intro: options.licenseIntro,
    links: options.licenseLinks,
    onClose: () => options.onCloseLicense(),
  });

  element.append(titleGroup, actions, statusGroup, license.root);

  const interactiveButtons = [
    startButton,
    ...(cardTextButton ? [cardTextButton] : []),
    licenseButton,
    logoutButton,
    license.closeButton,
  ];

  // 다이얼로그가 열리는 순간에만 포커스를 준다. 매 렌더마다 주면 포커스를 계속 빼앗는다.
  let licenseWasOpen = false;

  return {
    element,
    render: (model) => {
      status.textContent = model.status;
      status.dataset.error = String(model.statusIsError);

      for (const button of interactiveButtons) {
        button.disabled = model.busy;
      }

      license.root.hidden = !model.licenseOpen;
      if (model.licenseOpen && !licenseWasOpen) {
        license.root.focus();
      }
      licenseWasOpen = model.licenseOpen;
    },
  };
}

/**
 * 메인 메뉴 라이선스 목록이다.
 * 엔진은 PixiJS, xAI 용도는 Grok Build/영상, Claude Code를 포함한다.
 */
export function createDefaultLicenseLinks(): MainMenuLicenseLink[] {
  return [
    {
      label: 'ORC License',
      purpose: '게임룰 / PF2e Remaster 기반 규칙',
      url: 'https://downloads.paizo.com/ORC_License_FINAL.pdf',
    },
    {
      label: 'OpenAI Terms',
      purpose: 'Codex 소스코딩 / OpenAI 이미지 생성',
      url: 'https://openai.com/policies/row-terms-of-use/',
    },
    {
      // Claude Code 전용 라이선스 문서는 없고 Anthropic 약관에 종속된다.
      label: 'Claude Code Terms',
      purpose: 'Claude Code 소스코딩',
      url: 'https://code.claude.com/docs/en/legal-and-compliance',
    },
    {
      label: 'Suno Terms',
      purpose: 'BGM / 사운드 에셋',
      url: 'https://suno.com/terms-of-service',
    },
    {
      // Grok Build 전용 공개 라이선스 페이지는 없고 xAI Consumer ToS를 가리킨다.
      label: 'xAI Terms',
      purpose: 'Grok Build / 영상 에셋',
      url: 'https://x.ai/legal/terms-of-service',
    },
    {
      label: 'PixiJS License',
      purpose: '게임 엔진',
      url: 'https://github.com/pixijs/pixijs/blob/dev/LICENSE',
    },
    {
      label: 'Node.js License',
      purpose: '런타임 / 서버 / 빌드 포함 요소',
      url: 'https://github.com/nodejs/node/blob/main/LICENSE',
    },
  ];
}

export const LICENSE_INTRO_TEXT =
  '이 프로그램은 생성형 AI를 사용하여 만들어졌습니다. 상업적 이용을 목적으로 하지 않으며, 관련 라이선스와 서비스 약관을 지키기 위해 노력했습니다.';

/** 로딩 결과 숫자를 상태 문구로 만든다. */
export function formatMainMenuLoadSummary(loadedCount: number, failedCount: number): string {
  if (failedCount > 0) {
    return `Loaded ${loadedCount} assets, skipped ${failedCount}`;
  }

  return `Loaded ${loadedCount} assets`;
}

function createMenuButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pf-btn9 pf-btn9--menu pf-main-menu__button';
  button.textContent = label;
  return button;
}

function createLicenseDialog(options: {
  intro: string;
  links: readonly MainMenuLicenseLink[];
  onClose: () => void;
}): { root: HTMLDivElement; closeButton: HTMLButtonElement } {
  const root = document.createElement('div');
  root.className = 'pf-main-menu__license';
  root.hidden = true;
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'pf-main-menu-license-title');

  const panel = document.createElement('section');
  panel.className = 'pf-main-menu__license-panel';

  const header = document.createElement('div');
  header.className = 'pf-main-menu__license-header';

  const title = document.createElement('h2');
  title.id = 'pf-main-menu-license-title';
  title.className = 'pf-main-menu__license-title';
  title.textContent = 'License';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'pf-btn-plain pf-main-menu__license-close';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.addEventListener('click', () => options.onClose());

  header.append(title, closeButton);

  // 헤더는 고정하고 본문만 스크롤한다. 닫기 버튼이 목록 아래로 밀려나지 않게 한다.
  const body = document.createElement('div');
  body.className = 'pf-main-menu__license-body';
  body.dataset.interactive = 'true';

  const intro = document.createElement('p');
  intro.className = 'pf-main-menu__license-intro';
  intro.textContent = options.intro;

  const list = document.createElement('ul');
  list.className = 'pf-main-menu__license-list';

  for (const licenseLink of options.links) {
    const item = document.createElement('li');
    const hasUrl = licenseLink.url.trim().length > 0;
    const entry = hasUrl ? document.createElement('a') : document.createElement('div');
    entry.className = 'pf-main-menu__license-link';

    if (entry instanceof HTMLAnchorElement) {
      entry.href = licenseLink.url;
      entry.target = '_blank';
      entry.rel = 'noopener noreferrer';
    }

    const linkTitle = document.createElement('strong');
    linkTitle.className = 'pf-main-menu__license-link-title';
    linkTitle.textContent = licenseLink.label;

    const linkPurpose = document.createElement('span');
    linkPurpose.className = 'pf-main-menu__license-link-purpose';
    linkPurpose.textContent = licenseLink.purpose;

    entry.append(linkTitle, linkPurpose);

    if (hasUrl) {
      const linkUrl = document.createElement('span');
      linkUrl.className = 'pf-main-menu__license-link-url';
      linkUrl.textContent = licenseLink.url;
      entry.append(linkUrl);
    }

    item.append(entry);
    list.append(item);
  }

  body.append(intro, list);
  panel.append(header, body);
  root.append(panel);
  return { root, closeButton };
}
