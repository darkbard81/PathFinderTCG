import './lobby.css';

import battleIconUrl from '../../assets/ui/icons/lobby/battle.webp';
import cardIconUrl from '../../assets/ui/icons/lobby/card.webp';
import currencyIconUrl from '../../assets/ui/icons/lobby/currency.webp';
import deckIconUrl from '../../assets/ui/icons/lobby/deck.webp';
import friendsIconUrl from '../../assets/ui/icons/lobby/friends.webp';
import gemBlueBrightIconUrl from '../../assets/ui/icons/lobby/gem-blue-bright.webp';
import gemBlueIconUrl from '../../assets/ui/icons/lobby/gem-blue.webp';
import gemPurpleIconUrl from '../../assets/ui/icons/lobby/gem-purple.webp';
import giftIconUrl from '../../assets/ui/icons/lobby/gift.webp';
import mailIconUrl from '../../assets/ui/icons/lobby/mail.webp';
import menuIconUrl from '../../assets/ui/icons/lobby/menu.webp';
import noticeIconUrl from '../../assets/ui/icons/lobby/notice.webp';
import questIconUrl from '../../assets/ui/icons/lobby/quest.webp';
import rankIconUrl from '../../assets/ui/icons/lobby/rank.webp';
import settingsIconUrl from '../../assets/ui/icons/lobby/settings.webp';
import shieldIconUrl from '../../assets/ui/icons/lobby/shield.webp';
import goldIconUrl from '../../assets/ui/icons/resource/gold.webp';
import manaStoneIconUrl from '../../assets/ui/icons/resource/mana-stone.webp';
import summonTicketIconUrl from '../../assets/ui/icons/resource/summon-ticket.webp';
import type { ResourceKey, ResourceState } from '../../game/resources/resource-state';

const LOBBY_ICON_URLS = {
  battle: battleIconUrl,
  card: cardIconUrl,
  currency: currencyIconUrl,
  deck: deckIconUrl,
  friends: friendsIconUrl,
  'gem-blue': gemBlueIconUrl,
  'gem-blue-bright': gemBlueBrightIconUrl,
  'gem-purple': gemPurpleIconUrl,
  gift: giftIconUrl,
  mail: mailIconUrl,
  menu: menuIconUrl,
  notice: noticeIconUrl,
  quest: questIconUrl,
  rank: rankIconUrl,
  settings: settingsIconUrl,
  shield: shieldIconUrl,
} as const;

/** UI_Template 10번 아이콘 세트에서 현재 Lobby가 사용하는 아이콘 ID다. */
export type LobbyMenuIcon = keyof typeof LOBBY_ICON_URLS;

/** 좌측 레일에 세우는 메뉴 하나다. */
export type LobbyMenuItem = {
  id: string;
  label: string;
  caption: string;
  icon?: LobbyMenuIcon;
  disabled?: boolean;
  onSelect?: () => void;
};

export type LobbyViewOptions = {
  /**
   * 리더 standing 후보 URL이다. 앞에서부터 시도하고 받지 못하면 다음으로 넘어간다.
   *
   * 캔버스가 아니라 DOM에 둔다. 브라우저가 영상이든 애니메이션 webp든 알아서
   * 재생하므로 PixiJS의 텍스처 복사가 필요 없다. 대신 오버레이는 캔버스 전체
   * 위에 있어서, 인물 앞에 캔버스 연출을 둘 수는 없다.
   */
  standingSources: string[];
  /** 저장 슬롯 이름이다. 헤더 첫 줄에 쓴다. */
  saveName: string;
  /** 현재 덱 리더 이름이다. 헤더 둘째 줄에 쓴다. */
  leaderName: string;
  /** 보유 재화다. 우상단 리소스 바에 쓴다. */
  resources: ResourceState;
  menuItems: LobbyMenuItem[];
  /** Lobby를 잠시 떠날 때 복원할 standing 영상의 일시 재생 상태다. */
  standingPlayback?: LobbyStandingPlayback;
  /** standing 캐릭터 표시 여부다. 저장 데이터가 아닌 임시 UI 상태다. */
  standingVisible?: boolean;
  /** standing 캐릭터 표시 여부가 바뀔 때 호출한다. */
  onStandingVisibilityChange?: (visible: boolean) => void;
  onBack: () => void;
  onLogout: () => void;
};

export type LobbyView = {
  element: HTMLElement;
  readStandingPlayback: () => LobbyStandingPlayback | null;
  setStandingVisible: (visible: boolean) => void;
  setStatus: (message: string) => void;
  setBusy: (busy: boolean) => void;
};

/** 저장 데이터에 포함하지 않는 Lobby standing 영상의 임시 재생 상태다. */
export type LobbyStandingPlayback = {
  source: string;
  currentTime: number;
};

/**
 * 로비 크롬을 만든다.
 *
 * 배경은 캔버스가 그리고, 리더 standing과 크롬은 여기서 만든다.
 * 가운데 열은 standing이 보이도록 비워 둔다.
 */
export function createLobbyView(options: LobbyViewOptions): LobbyView {
  const element = document.createElement('section');
  element.className = 'pf-lobby';
  let standingVisible = options.standingVisible ?? true;

  mountStanding(element, options.standingSources, options.standingPlayback, () => standingVisible);

  const header = document.createElement('header');
  header.className = 'pf-lobby__header';

  const saveName = document.createElement('p');
  saveName.className = 'pf-lobby__save-name';
  saveName.textContent = options.saveName;

  const leaderName = document.createElement('p');
  leaderName.className = 'pf-lobby__leader-name';
  leaderName.textContent = options.leaderName;

  header.append(saveName, leaderName);

  const menu = document.createElement('nav');
  menu.className = 'pf-lobby__menu';
  menu.setAttribute('aria-label', '로비 메뉴');

  const buttons = options.menuItems.map((item) => {
    const button = createMenuButton(item);
    menu.append(button);
    return button;
  });

  const account = document.createElement('div');
  account.className = 'pf-lobby__account';

  const standingToggle = createStandingToggleButton(standingVisible, (visible) => {
    standingVisible = visible;
    applyStandingVisibility(element, visible);
    options.onStandingVisibilityChange?.(visible);
  });
  account.append(standingToggle);

  // 우상단. 재화 오른쪽에 설정 버튼을 둔다.
  const topbar = document.createElement('div');
  topbar.className = 'pf-lobby__topbar';

  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  // 아이콘만 있는 작은 버튼이라 9슬라이스 틀 대신 평범한 버튼을 쓴다.
  settingsButton.className = 'pf-btn-plain pf-lobby__settings-button';
  settingsButton.setAttribute('aria-haspopup', 'dialog');
  settingsButton.setAttribute('aria-expanded', 'false');

  const settingsIcon = document.createElement('img');
  settingsIcon.className = 'pf-lobby__settings-icon';
  settingsIcon.src = LOBBY_ICON_URLS.settings;
  // 옆에 보이는 글자가 버튼 이름이 되므로 그림은 접근성 트리에서 뺀다.
  settingsIcon.alt = '';
  settingsIcon.setAttribute('aria-hidden', 'true');

  const settingsLabel = document.createElement('span');
  settingsLabel.className = 'pf-lobby__settings-label';
  settingsLabel.textContent = '설정';

  settingsButton.append(settingsIcon, settingsLabel);

  const settings = createSettingsDialog({
    onBack: options.onBack,
    onLogout: options.onLogout,
    onOpenChange: (open) => settingsButton.setAttribute('aria-expanded', String(open)),
  });

  settingsButton.addEventListener('click', () => settings.open());
  topbar.append(createResourceBar(options.resources), settingsButton);

  const status = document.createElement('p');
  status.className = 'pf-lobby__status';
  status.setAttribute('role', 'status');

  element.append(header, topbar, menu, account, status, settings.root);

  return {
    element,
    readStandingPlayback: () => {
      const standing = element.querySelector('.pf-lobby__standing');
      if (!(standing instanceof HTMLVideoElement) || !Number.isFinite(standing.currentTime)) {
        return null;
      }

      return {
        source: standing.dataset.source ?? standing.src,
        currentTime: Math.max(0, standing.currentTime),
      };
    },
    setStandingVisible: (visible) => {
      standingVisible = visible;
      applyStandingVisibility(element, visible);
    },
    setStatus: (message) => {
      status.textContent = message;
    },
    setBusy: (busy) => {
      for (const button of [...buttons, standingToggle, settingsButton, ...settings.buttons]) {
        button.disabled = busy;
      }
    },
  };
}

const VIDEO_EXTENSIONS = ['.webm', '.mp4', '.mov'];

/**
 * Safari와 iOS는 WebM의 알파 채널을 지원하지 않는다.
 *
 * 재생 자체가 되는 판이라도 투명해야 할 자리가 검게 채워져, 인물 뒤에 검은
 * 사각형이 생긴다. canPlayType은 알파 여부까지 알려주지 않으므로 판정으로
 * 가릴 수 없다. iOS는 브라우저 이름과 무관하게 전부 WebKit이라 함께 본다.
 */
export type UserAgentInfo = {
  userAgent: string;
  maxTouchPoints: number;
};

export function supportsAlphaWebm(agent: UserAgentInfo): boolean {
  const { userAgent, maxTouchPoints } = agent;
  const isIos = /iP(hone|ad|od)/i.test(userAgent);
  // iPadOS 13부터 데스크톱 Safari로 위장한다. 터치 지원 여부로 갈라낸다.
  const isIpadOs = /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
  // 맥용 Chrome과 Edge의 UA에도 Safari가 들어 있어 함께 걸러야 한다.
  const isSafari =
    /Safari/i.test(userAgent) && !/Chrome|Chromium|Android|CriOS|FxiOS|Edg/i.test(userAgent);

  return !isIos && !isIpadOs && !isSafari;
}

/** 이 브라우저에서 쓸 수 있는 후보만 순서를 지켜 남긴다. */
export function filterUsableStandingSources(
  sources: readonly string[],
  agent: UserAgentInfo = readUserAgent(),
): string[] {
  const allowWebm = supportsAlphaWebm(agent);
  return sources.filter((url) => allowWebm || !url.toLowerCase().includes('.webm'));
}

/** 같은 standing 영상에만 저장된 재생 위치를 적용한다. */
export function resolveStandingPlaybackTime(
  source: string,
  playback: LobbyStandingPlayback | undefined,
): number {
  if (!playback || playback.source !== source || !Number.isFinite(playback.currentTime)) {
    return 0;
  }

  return Math.max(0, playback.currentTime);
}

function readUserAgent(): UserAgentInfo {
  if (typeof navigator === 'undefined') {
    return { userAgent: '', maxTouchPoints: 0 };
  }

  return { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints };
}

function isVideoSource(url: string): boolean {
  return VIDEO_EXTENSIONS.some((extension) => url.toLowerCase().includes(extension));
}

/**
 * 후보를 앞에서부터 하나씩 붙여 본다. 실패하면 그 요소를 떼고 다음으로 넘어가며,
 * 다 떨어지면 배경만 남는다. standing 원본이 아직 없는 리더가 있어서 필요하다.
 */
function mountStanding(
  parent: HTMLElement,
  sources: readonly string[],
  playback: LobbyStandingPlayback | undefined,
  getStandingVisibility: () => boolean,
): void {
  const usable = filterUsableStandingSources(sources);
  const [url, ...rest] = usable;
  if (!url) {
    return;
  }

  const element = createStandingElement(url);
  element.className = 'pf-lobby__standing';
  element.addEventListener('error', () => {
    element.remove();
    mountStanding(parent, rest, playback, getStandingVisibility);
  });
  if (element instanceof HTMLVideoElement) {
    // video.src는 브라우저가 절대 URL로 정규화하므로 후보 URL을 별도로 보존한다.
    element.dataset.source = url;
    const restoreTime = resolveStandingPlaybackTime(url, playback);
    element.addEventListener(
      'loadedmetadata',
      () => {
        element.currentTime = restoreTime;
      },
      { once: true },
    );
  }
  parent.append(element);
  element.hidden = !getStandingVisibility();
}

/** 영상 확장자면 video로, 아니면 img로 만든다. 둘 다 브라우저가 알아서 재생한다. */
function createStandingElement(url: string): HTMLImageElement | HTMLVideoElement {
  if (!isVideoSource(url)) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.draggable = false;
    return image;
  }

  const video = document.createElement('video');
  video.autoplay = true;
  video.loop = true;
  // 음소거가 아니면 브라우저가 자동재생을 막는다. 속성과 프로퍼티를 함께 건다.
  video.muted = true;
  video.setAttribute('muted', '');
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.src = url;
  return video;
}

function createStandingToggleButton(
  initialVisible: boolean,
  onChange: (visible: boolean) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pf-btn-plain pf-lobby__standing-toggle';
  button.setAttribute('aria-label', '캐릭터 표시');

  const icon = document.createElement('img');
  icon.className = 'pf-lobby__standing-toggle-icon';
  icon.src = LOBBY_ICON_URLS.notice;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'pf-lobby__standing-toggle-label';

  const update = (visible: boolean): void => {
    button.setAttribute('aria-pressed', String(visible));
    label.textContent = visible ? '캐릭터 ON' : '캐릭터 OFF';
  };

  update(initialVisible);
  button.append(icon, label);
  button.addEventListener('click', () => {
    const visible = button.getAttribute('aria-pressed') !== 'true';
    update(visible);
    onChange(visible);
  });
  return button;
}

function applyStandingVisibility(parent: HTMLElement, visible: boolean): void {
  parent.querySelector<HTMLElement>('.pf-lobby__standing')?.toggleAttribute('hidden', !visible);
}

/**
 * 로비 설정 다이얼로그다.
 *
 * 저장 슬롯으로 돌아가기와 로그아웃은 자주 쓰지 않는데 로비 아래를 계속 차지했다.
 * 우상단 설정 버튼 뒤로 넣어 본판에서 치운다.
 *
 * 닫기는 × 버튼과 Escape 둘 다 받는다. 배경을 눌러 닫는 길은 두지 않았다.
 * 오버레이 루트가 pointer-events:none 이라 배경이 클릭을 받으려면 따로 열어야 하는데,
 * 로그아웃이 걸린 패널이라 실수로 닫히는 쪽보다 명시적으로 닫는 쪽이 낫다.
 */
function createSettingsDialog(options: {
  onBack: () => void;
  onLogout: () => void;
  onOpenChange: (open: boolean) => void;
}): {
  root: HTMLDivElement;
  buttons: HTMLButtonElement[];
  open: () => void;
} {
  const root = document.createElement('div');
  root.className = 'pf-lobby__settings';
  root.hidden = true;
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'pf-lobby-settings-title');

  const panel = document.createElement('section');
  panel.className = 'pf-lobby__settings-panel';

  const header = document.createElement('div');
  header.className = 'pf-lobby__settings-header';

  const title = document.createElement('h2');
  title.id = 'pf-lobby-settings-title';
  title.className = 'pf-lobby__settings-title';
  title.textContent = '설정';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'pf-btn-plain pf-lobby__settings-close';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', '닫기');

  header.append(title, closeButton);

  const body = document.createElement('div');
  body.className = 'pf-lobby__settings-body';

  const backButton = createAccountButton('뒤로', options.onBack);
  const logoutButton = createAccountButton('Logout', options.onLogout);
  body.append(backButton, logoutButton);

  panel.append(header, body);
  root.append(panel);

  // 다이얼로그를 연 버튼을 기억해 두고 닫을 때 초점을 돌려준다.
  let opener: HTMLElement | null = null;

  function close(): void {
    root.hidden = true;
    options.onOpenChange(false);
    opener?.focus();
    opener = null;
  }

  closeButton.addEventListener('click', close);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  });

  return {
    root,
    buttons: [closeButton, backButton, logoutButton],
    open: () => {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root.hidden = false;
      options.onOpenChange(true);
      root.focus();
    },
  };
}

/**
 * 우상단 리소스 바에 그릴 재화다.
 * documents/Lobby_UI_Target.png 우상단 패널의 순서를 그대로 따른다.
 */
const RESOURCE_ITEMS: readonly { key: ResourceKey; label: string; iconUrl: string }[] = [
  { key: 'gold', label: '골드', iconUrl: goldIconUrl },
  { key: 'manaStone', label: '마나석', iconUrl: manaStoneIconUrl },
  { key: 'summonTicket', label: '소환 티켓', iconUrl: summonTicketIconUrl },
];

/**
 * 우상단 리소스 바를 만든다.
 *
 * 아이콘만으로는 무슨 재화인지 읽어줄 수 없어서 항목마다 이름과 수량을 aria-label로 묶는다.
 * 그림은 그래서 alt를 비우고 접근성 트리에서 뺀다.
 */
function createResourceBar(resources: ResourceState): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'pf-lobby__resources';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', '보유 재화');

  for (const item of RESOURCE_ITEMS) {
    const entry = document.createElement('div');
    entry.className = 'pf-lobby__resource';
    entry.dataset.resource = item.key;

    const icon = document.createElement('img');
    icon.className = 'pf-lobby__resource-icon';
    icon.src = item.iconUrl;
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');

    const amount = document.createElement('span');
    amount.className = 'pf-lobby__resource-amount';
    amount.textContent = formatResourceAmount(resources[item.key]);

    entry.setAttribute('aria-label', `${item.label} ${amount.textContent}`);
    entry.append(icon, amount);
    bar.append(entry);
  }

  return bar;
}

/**
 * 재화를 세 자리마다 끊어 적는다.
 *
 * `toLocaleString`은 실행 환경의 ICU 데이터에 따라 구분자가 달라져 화면과 테스트가 갈린다.
 * 자리 구분은 표기 규칙이지 지역화 대상이 아니라서 직접 끊는다.
 */
export function formatResourceAmount(amount: number): string {
  return `${amount}`.replace(/\B(?=(\d{3})+$)/g, ',');
}

/** 좌측 레일 메뉴 버튼이다. 큰 글자와 작은 영문 캡션을 함께 둔다. */
function createMenuButton(item: LobbyMenuItem): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pf-btn9 pf-btn9--menu pf-lobby__menu-button';
  button.dataset.kind = item.id;
  button.disabled = item.disabled ?? false;

  const icon = document.createElement('img');
  icon.className = 'pf-lobby__menu-icon';
  if (item.icon) {
    icon.src = LOBBY_ICON_URLS[item.icon];
  }
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'pf-lobby__menu-label';
  label.textContent = item.label;

  const caption = document.createElement('span');
  caption.className = 'pf-lobby__menu-caption';
  caption.textContent = item.caption;

  button.append(icon, label, caption);

  const { onSelect } = item;
  if (onSelect) {
    button.addEventListener('click', () => onSelect());
  }

  return button;
}

function createAccountButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pf-btn9 pf-btn9--standard pf-lobby__account-button';
  button.textContent = label;
  button.addEventListener('click', () => onClick());
  return button;
}
