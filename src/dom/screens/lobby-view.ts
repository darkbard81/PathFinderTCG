import './lobby.css';

/** 좌측 레일에 세우는 메뉴 하나다. */
export type LobbyMenuItem = {
  id: string;
  label: string;
  caption: string;
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
  menuItems: LobbyMenuItem[];
  onBack: () => void;
  onLogout: () => void;
};

export type LobbyView = {
  element: HTMLElement;
  setStatus: (message: string) => void;
  setBusy: (busy: boolean) => void;
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

  mountStanding(element, options.standingSources);

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

  const backButton = createAccountButton('뒤로', options.onBack);
  const logoutButton = createAccountButton('Logout', options.onLogout);
  account.append(backButton, logoutButton);

  const status = document.createElement('p');
  status.className = 'pf-lobby__status';
  status.setAttribute('role', 'status');

  element.append(header, menu, account, status);

  return {
    element,
    setStatus: (message) => {
      status.textContent = message;
    },
    setBusy: (busy) => {
      for (const button of [...buttons, backButton, logoutButton]) {
        button.disabled = busy;
      }
    },
  };
}

const VIDEO_EXTENSIONS = ['.webm', '.mp4'];

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
function mountStanding(parent: HTMLElement, sources: readonly string[]): void {
  const usable = filterUsableStandingSources(sources);
  const [url, ...rest] = usable;
  if (!url) {
    return;
  }

  const element = createStandingElement(url);
  element.className = 'pf-lobby__standing';
  element.addEventListener('error', () => {
    element.remove();
    mountStanding(parent, rest);
  });
  parent.append(element);
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
  video.src = url;
  video.autoplay = true;
  video.loop = true;
  // 음소거가 아니면 브라우저가 자동재생을 막는다. 속성과 프로퍼티를 함께 건다.
  video.muted = true;
  video.setAttribute('muted', '');
  video.playsInline = true;
  video.disablePictureInPicture = true;
  return video;
}

/** 좌측 레일 메뉴 버튼이다. 큰 글자와 작은 영문 캡션을 함께 둔다. */
function createMenuButton(item: LobbyMenuItem): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pf-btn9 pf-btn9--menu pf-lobby__menu-button';
  button.dataset.kind = item.id;
  button.disabled = item.disabled ?? false;

  const label = document.createElement('span');
  label.className = 'pf-lobby__menu-label';
  label.textContent = item.label;

  const caption = document.createElement('span');
  caption.className = 'pf-lobby__menu-caption';
  caption.textContent = item.caption;

  button.append(label, caption);

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
