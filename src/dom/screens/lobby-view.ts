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
import type { LobbyStandingMediaType } from '../../game/lobby/lobby-state';
import type { ChannelVolume, SoundVolumeState, VolumeChannel } from '../../game/sound/volume';
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

/** 로비 꾸미기 다이얼로그의 배경 선택기에 보여 줄 보유 배경 하나다. */
export type LobbyBackgroundOption = {
  id: string;
  name: string;
};

/** 꾸미기 다이얼로그의 초기화 버튼이 슬라이더를 되돌릴 값이다. */
export type LobbyStandingDefaults = {
  standingPositionX: number;
  standingPositionY: number;
  standingScale: number;
};

/** 설정 다이얼로그가 그릴 볼륨 값과 사용자 입력 콜백이다. */
export type LobbyVolumeViewModel = {
  state: SoundVolumeState;
  onChange: (channel: VolumeChannel, patch: Partial<ChannelVolume>) => void;
};

/** DOM이 표시하고 입력으로 돌려주는 로비 standing 설정값이다. */
export type LobbyCustomizationModel = {
  selectedBackgroundId: string;
  standingVisible: boolean;
  standingMediaType: LobbyStandingMediaType;
  standingPositionX: number;
  standingPositionY: number;
  standingScale: number;
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
  saveNameMaxLength: number;
  /** 저장 슬롯 이름이다. 헤더 첫 줄에 쓴다. */
  saveName: string;
  /** 현재 덱 리더 이름이다. 헤더 둘째 줄에 쓴다. */
  leaderName: string;
  /** 보유 재화다. 우상단 리소스 바에 쓴다. */
  resources: ResourceState;
  menuItems: LobbyMenuItem[];
  backgroundOptions: LobbyBackgroundOption[];
  customization: LobbyCustomizationModel;
  standingPositionRange: { min: number; max: number };
  standingPositionYRange: { min: number; max: number };
  standingScaleRange: { min: number; max: number };
  standingDefaults: LobbyStandingDefaults;
  /** 설정 다이얼로그의 볼륨 값과 입력 콜백이다. 없으면 소리 구역을 만들지 않는다. */
  volume?: LobbyVolumeViewModel;
  /** Lobby를 잠시 떠날 때 복원할 standing 영상의 일시 재생 상태다. */
  standingPlayback?: LobbyStandingPlayback;
  onSaveName: (saveName: string) => void;
  onSaveCustomization: (customization: LobbyCustomizationModel) => void;
  onBack: () => void;
  onLogout: () => void;
};

export type LobbyView = {
  element: HTMLElement;
  readStandingPlayback: () => LobbyStandingPlayback | null;
  setSaveName: (saveName: string) => void;
  setCustomization: (customization: LobbyCustomizationModel) => void;
  /** 로비 본판에 표시할 화면 전역 상태를 바꾼다. */
  setStatus: (message: string) => void;
  /** 일반 설정 다이얼로그 안의 상태를 바꾼다. */
  setSettingsStatus: (message: string) => void;
  /** 로비 꾸미기 다이얼로그 안의 상태를 바꾼다. */
  setCustomizationStatus: (message: string) => void;
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
  let customization = { ...options.customization };
  let previewCustomization = { ...customization };
  let standingPlayback = options.standingPlayback ? { ...options.standingPlayback } : undefined;

  applyStandingCustomization(element, customization);
  mountStanding(
    element,
    options.standingSources,
    standingPlayback,
    () => previewCustomization.standingVisible,
    previewCustomization.standingMediaType,
  );

  const previewLobbyCustomization = (nextCustomization: LobbyCustomizationModel): void => {
    const mediaTypeChanged =
      previewCustomization.standingMediaType !== nextCustomization.standingMediaType;
    previewCustomization = { ...nextCustomization };

    if (mediaTypeChanged) {
      standingPlayback = readMountedStandingPlayback(element) ?? standingPlayback;
      element.querySelector('.pf-lobby__standing')?.remove();
      mountStanding(
        element,
        options.standingSources,
        standingPlayback,
        () => previewCustomization.standingVisible,
        previewCustomization.standingMediaType,
      );
    }

    applyStandingCustomization(element, previewCustomization);
  };

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
    volume: options.volume,
    saveName: options.saveName,
    saveNameMaxLength: options.saveNameMaxLength,
    onSaveName: options.onSaveName,
    onBack: options.onBack,
    onLogout: options.onLogout,
    onOpenChange: (open) => settingsButton.setAttribute('aria-expanded', String(open)),
  });

  settingsButton.addEventListener('click', () => settings.open());
  topbar.append(createResourceBar(options.resources), settingsButton);

  const customizationButton = document.createElement('button');
  customizationButton.type = 'button';
  customizationButton.className = 'pf-btn9 pf-btn9--standard pf-lobby__customize-button';
  customizationButton.setAttribute('aria-haspopup', 'dialog');
  customizationButton.setAttribute('aria-expanded', 'false');

  const customizationIcon = document.createElement('img');
  customizationIcon.className = 'pf-lobby__customize-icon';
  customizationIcon.src = LOBBY_ICON_URLS.card;
  customizationIcon.alt = '';
  customizationIcon.setAttribute('aria-hidden', 'true');

  const customizationLabel = document.createElement('span');
  customizationLabel.textContent = '로비 꾸미기';
  customizationButton.append(customizationIcon, customizationLabel);

  const customizationDialog = createCustomizationDialog({
    backgroundOptions: options.backgroundOptions,
    customization,
    standingPositionRange: options.standingPositionRange,
    standingPositionYRange: options.standingPositionYRange,
    standingScaleRange: options.standingScaleRange,
    standingDefaults: options.standingDefaults,
    onSaveCustomization: options.onSaveCustomization,
    onPreviewCustomization: previewLobbyCustomization,
    onOpenChange: (open) => customizationButton.setAttribute('aria-expanded', String(open)),
  });
  customizationButton.addEventListener('click', () => customizationDialog.open());

  const status = document.createElement('p');
  status.className = 'pf-lobby__status';
  status.setAttribute('role', 'status');

  element.append(
    header,
    topbar,
    menu,
    customizationButton,
    status,
    settings.root,
    customizationDialog.root,
  );

  return {
    element,
    readStandingPlayback: () => readMountedStandingPlayback(element) ?? standingPlayback ?? null,
    setSaveName: (value) => {
      saveName.textContent = value;
      settings.setSaveName(value);
    },
    setCustomization: (value) => {
      customization = { ...value };
      previewLobbyCustomization(customization);
      customizationDialog.setCustomization(customization);
    },
    setStatus: (message) => {
      status.textContent = message;
    },
    setSettingsStatus: settings.setStatus,
    setCustomizationStatus: customizationDialog.setStatus,
    setBusy: (busy) => {
      for (const button of [...buttons, settingsButton, customizationButton]) {
        button.disabled = busy;
      }
      settings.setBusy(busy);
      customizationDialog.setBusy(busy);
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
  mediaType: LobbyStandingMediaType = 'auto',
): string[] {
  const allowWebm = supportsAlphaWebm(agent);
  return sources.filter((url) => {
    const video = isVideoSource(url);
    const matchesMediaType = mediaType === 'auto' || (mediaType === 'video' ? video : !video);
    return matchesMediaType && (allowWebm || !url.toLowerCase().includes('.webm'));
  });
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
  mediaType: LobbyStandingMediaType,
): void {
  const usable = filterUsableStandingSources(sources, readUserAgent(), mediaType);
  const [url, ...rest] = usable;
  if (!url) {
    return;
  }

  const element = createStandingElement(url);
  element.className = 'pf-lobby__standing';
  element.addEventListener('error', () => {
    if (element.parentElement !== parent) {
      return;
    }
    element.remove();
    mountStanding(parent, rest, playback, getStandingVisibility, mediaType);
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

function readMountedStandingPlayback(parent: HTMLElement): LobbyStandingPlayback | null {
  const standing = parent.querySelector('.pf-lobby__standing');
  if (!(standing instanceof HTMLVideoElement) || !Number.isFinite(standing.currentTime)) {
    return null;
  }

  return {
    source: standing.dataset.source ?? standing.src,
    currentTime: Math.max(0, standing.currentTime),
  };
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

/**
 * standing 배치를 CSS 커스텀 속성 값으로 옮긴다.
 *
 * 기본값은 설정이 저장 데이터로 올라오기 전 하드코딩과 같은 56% / 0% / 100%다.
 * 옛 저장 파일이 승격돼도 로비 그림이 그대로여야 하므로 이 대응은 테스트로 고정한다.
 */
export function buildStandingStyleVariables(
  customization: LobbyCustomizationModel,
): Record<string, string> {
  return {
    '--pf-lobby-standing-position-x': `${customization.standingPositionX}%`,
    '--pf-lobby-standing-position-y': `${customization.standingPositionY}%`,
    '--pf-lobby-standing-height': `${customization.standingScale}%`,
  };
}

function applyStandingCustomization(
  parent: HTMLElement,
  customization: LobbyCustomizationModel,
): void {
  for (const [name, value] of Object.entries(buildStandingStyleVariables(customization))) {
    parent.style.setProperty(name, value);
  }
  parent
    .querySelector<HTMLElement>('.pf-lobby__standing')
    ?.toggleAttribute('hidden', !customization.standingVisible);
}

/** 볼륨 슬라이더에 붙일 채널과 이름이다. 순서대로 보여준다. */
const VOLUME_CHANNEL_LABELS: readonly { channel: VolumeChannel; label: string }[] = [
  { channel: 'master', label: '전체' },
  { channel: 'bgm', label: '음악' },
  { channel: 'sfx', label: '효과음' },
  { channel: 'voice', label: '음성' },
];

/**
 * 채널 하나의 볼륨 줄이다. 슬라이더와 음소거가 한 쌍으로 움직인다.
 *
 * 음소거를 볼륨 0으로 대신하지 않으므로 둘을 따로 둔다. 음소거 중에도 슬라이더 값은
 * 남아 있어야 풀었을 때 원래 크기로 돌아간다.
 */
function createVolumeRow(
  label: string,
  onChange: (patch: Partial<ChannelVolume>) => void,
): {
  root: HTMLDivElement;
  setValue: (volume: ChannelVolume) => void;
} {
  const root = document.createElement('div');
  root.className = 'pf-lobby__volume-row';

  const heading = document.createElement('span');
  heading.className = 'pf-lobby__settings-range-heading';
  const name = document.createElement('span');
  name.textContent = label;
  const output = document.createElement('output');
  heading.append(name, output);

  const slider = document.createElement('input');
  slider.className = 'pf-lobby__settings-range';
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.setAttribute('aria-label', `${label} 볼륨`);

  const mute = document.createElement('input');
  mute.type = 'checkbox';
  mute.className = 'pf-lobby__volume-mute';
  mute.setAttribute('aria-label', `${label} 음소거`);

  root.append(heading, slider, mute);

  const refreshOutput = (): void => {
    output.value = mute.checked ? '음소거' : `${slider.value}%`;
  };

  slider.addEventListener('input', () => {
    refreshOutput();
    onChange({ level: Number(slider.value) });
  });
  mute.addEventListener('change', () => {
    refreshOutput();
    onChange({ muted: mute.checked });
  });

  return {
    root,
    setValue: (volume) => {
      slider.value = `${volume.level}`;
      mute.checked = volume.muted;
      refreshOutput();
    },
  };
}

/**
 * 로비 설정 다이얼로그다.
 *
 * 저장 슬롯으로 돌아가기와 로그아웃은 자주 쓰지 않는데 로비 아래를 계속 차지했다.
 * 우상단 설정 버튼 뒤로 넣어 본판에서 치운다.
 *
 * 닫기는 × 버튼과 Escape 둘 다 받는다. 배경 클릭은 뒤쪽 UI로 통과시키지 않되
 * 닫기 동작으로도 쓰지 않는다. 로그아웃이 걸린 패널은 명시적으로 닫아야 한다.
 */
function createSettingsDialog(options: {
  saveName: string;
  saveNameMaxLength: number;
  volume: LobbyVolumeViewModel | undefined;
  onSaveName: (saveName: string) => void;
  onBack: () => void;
  onLogout: () => void;
  onOpenChange: (open: boolean) => void;
}): {
  root: HTMLDivElement;
  open: () => void;
  setSaveName: (saveName: string) => void;
  setStatus: (message: string) => void;
  setBusy: (busy: boolean) => void;
} {
  const root = document.createElement('div');
  root.className = 'pf-lobby__settings';
  root.dataset.interactive = 'true';
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

  const nameForm = document.createElement('form');
  nameForm.className = 'pf-lobby__settings-section';
  const nameTitle = document.createElement('h3');
  nameTitle.className = 'pf-lobby__settings-section-title';
  nameTitle.textContent = '저장 슬롯 이름';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'pf-lobby__settings-field';
  nameLabel.textContent = `이름 (${options.saveNameMaxLength}자 이내)`;
  const nameInput = document.createElement('input');
  nameInput.className = 'pf-lobby__settings-input';
  nameInput.type = 'text';
  nameInput.required = true;
  nameInput.maxLength = options.saveNameMaxLength;
  nameInput.value = options.saveName;
  nameLabel.append(nameInput);
  const saveNameButton = createAccountButton('이름 저장', () => undefined);
  saveNameButton.type = 'submit';
  nameForm.append(nameTitle, nameLabel, saveNameButton);

  /*
   * 소리 구역이다. 소리를 켤 수 없는 환경이면 통째로 만들지 않는다.
   * 만지면 아무 일도 안 일어나는 슬라이더를 보여 주는 편이 더 헷갈린다.
   */
  const volumeModel = options.volume;
  const volumeRows: ReturnType<typeof createVolumeRow>[] = [];
  const volumeSection = document.createElement('section');
  if (volumeModel) {
    volumeSection.className = 'pf-lobby__settings-section';
    const volumeTitle = document.createElement('h3');
    volumeTitle.className = 'pf-lobby__settings-section-title';
    volumeTitle.textContent = '소리';
    volumeSection.append(volumeTitle);

    for (const { channel, label } of VOLUME_CHANNEL_LABELS) {
      const row = createVolumeRow(label, (patch) => volumeModel.onChange(channel, patch));
      volumeRows.push(row);
      volumeSection.append(row.root);
    }

    // 저장된 값으로 슬라이더를 맞춘다. 기기마다 다른 값이 들어 있다.
    VOLUME_CHANNEL_LABELS.forEach(({ channel }, index) => {
      volumeRows[index]?.setValue(volumeModel.state[channel]);
    });
  }

  const backButton = createAccountButton('뒤로', options.onBack);
  const logoutButton = createAccountButton('Logout', options.onLogout);
  const accountActions = document.createElement('div');
  accountActions.className = 'pf-lobby__settings-account-actions';
  accountActions.append(backButton, logoutButton);
  const settingsStatus = document.createElement('p');
  settingsStatus.className = 'pf-lobby__settings-status';
  settingsStatus.setAttribute('role', 'status');
  settingsStatus.setAttribute('aria-live', 'polite');
  body.append(nameForm, ...(volumeModel ? [volumeSection] : []), settingsStatus, accountActions);

  panel.append(header, body);
  root.append(panel);

  // 다이얼로그를 연 버튼을 기억해 두고 닫을 때 초점을 돌려준다.
  let opener: HTMLElement | null = null;
  /**
   * 저장에 성공한 마지막 이름이다.
   * 닫을 때 입력을 여기로 되돌린다. 남겨 두면 저장하지 않은 값이 다시 열었을 때
   * 저장된 이름처럼 보인다. 로비 꾸미기 다이얼로그도 같은 규칙으로 닫는다.
   */
  let committedSaveName = options.saveName;

  function close(): void {
    nameInput.value = committedSaveName;
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

  nameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    options.onSaveName(nameInput.value);
  });

  const controls: Array<HTMLInputElement | HTMLSelectElement | HTMLButtonElement> = [
    nameInput,
    closeButton,
    saveNameButton,
    backButton,
    logoutButton,
  ];

  return {
    root,
    open: () => {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root.hidden = false;
      options.onOpenChange(true);
      root.focus();
    },
    setSaveName: (saveName) => {
      committedSaveName = saveName;
      nameInput.value = saveName;
    },
    setStatus: (message) => {
      settingsStatus.textContent = message;
    },
    setBusy: (busy) => {
      /*
       * 볼륨 슬라이더는 잠그지 않는다. 저장 요청과 아무 상관이 없고, 소리가 거슬려
       * 줄이려는 순간에 잠기면 곤란하다. 잠그는 것은 저장에 얽힌 것들뿐이다.
       */
      for (const control of controls) {
        control.disabled = busy;
      }
    },
  };
}

/** 배경과 standing 표시·위치·크기를 조정하는 로비 전용 다이얼로그다. */
function createCustomizationDialog(options: {
  backgroundOptions: LobbyBackgroundOption[];
  customization: LobbyCustomizationModel;
  standingPositionRange: { min: number; max: number };
  standingPositionYRange: { min: number; max: number };
  standingScaleRange: { min: number; max: number };
  standingDefaults: LobbyStandingDefaults;
  onSaveCustomization: (customization: LobbyCustomizationModel) => void;
  onPreviewCustomization: (customization: LobbyCustomizationModel) => void;
  onOpenChange: (open: boolean) => void;
}): {
  root: HTMLDivElement;
  open: () => void;
  setCustomization: (customization: LobbyCustomizationModel) => void;
  setStatus: (message: string) => void;
  setBusy: (busy: boolean) => void;
} {
  const root = document.createElement('div');
  root.className = 'pf-lobby__customization';
  root.dataset.interactive = 'true';
  root.hidden = true;
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'pf-lobby-customization-title');

  const panel = document.createElement('section');
  panel.className = 'pf-lobby__customization-panel';

  const header = document.createElement('div');
  header.className = 'pf-lobby__customization-header';

  const title = document.createElement('h2');
  title.id = 'pf-lobby-customization-title';
  title.className = 'pf-lobby__customization-title';
  title.textContent = '로비 꾸미기';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'pf-btn-plain pf-lobby__customization-close';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', '닫기');
  header.append(title, closeButton);

  const body = document.createElement('div');
  body.className = 'pf-lobby__customization-body';

  const form = document.createElement('form');
  form.className = 'pf-lobby__settings-section';

  const backgroundLabel = document.createElement('label');
  backgroundLabel.className = 'pf-lobby__settings-field';
  backgroundLabel.textContent = '배경';
  const backgroundSelect = document.createElement('select');
  backgroundSelect.className = 'pf-lobby__settings-input';
  for (const background of options.backgroundOptions) {
    const option = document.createElement('option');
    option.value = background.id;
    option.textContent = background.name;
    backgroundSelect.append(option);
  }
  backgroundLabel.append(backgroundSelect);

  const mediaTypeLabel = document.createElement('label');
  mediaTypeLabel.className = 'pf-lobby__settings-field';
  mediaTypeLabel.textContent = '스탠딩 형식';
  const mediaTypeSelect = document.createElement('select');
  mediaTypeSelect.className = 'pf-lobby__settings-input';
  const mediaTypeOptions: readonly { value: LobbyStandingMediaType; label: string }[] = [
    { value: 'auto', label: '자동 (동영상 우선)' },
    { value: 'video', label: '동영상' },
    { value: 'image', label: '이미지' },
  ];
  for (const mediaType of mediaTypeOptions) {
    const option = document.createElement('option');
    option.value = mediaType.value;
    option.textContent = mediaType.label;
    mediaTypeSelect.append(option);
  }
  mediaTypeLabel.append(mediaTypeSelect);

  const visibleLabel = document.createElement('label');
  visibleLabel.className = 'pf-lobby__settings-check';
  const visibleInput = document.createElement('input');
  visibleInput.type = 'checkbox';
  const visibleText = document.createElement('span');
  visibleText.textContent = '리더 standing 표시';
  visibleLabel.append(visibleInput, visibleText);

  const positionXControl = createRangeControl('가로 위치', options.standingPositionRange, '%');
  const positionYControl = createRangeControl('세로 위치', options.standingPositionYRange, '%');
  const scaleControl = createRangeControl('크기', options.standingScaleRange, '%');

  /*
   * 슬라이더만 기본값으로 되돌린다. 저장하지는 않는다.
   * 눌러 보고 마음에 들지 않으면 그대로 닫아 되돌릴 수 있어야 하고,
   * 배경과 형식은 슬라이더로 어긋난 배치와 무관하므로 건드리지 않는다.
   */
  const resetButton = createAccountButton('위치·크기 초기화', () => {
    positionXControl.setValue(options.standingDefaults.standingPositionX);
    positionYControl.setValue(options.standingDefaults.standingPositionY);
    scaleControl.setValue(options.standingDefaults.standingScale);
    preview();
  });
  const saveButton = createAccountButton('로비 꾸미기 저장', () => undefined);
  saveButton.type = 'submit';
  const formActions = document.createElement('div');
  formActions.className = 'pf-lobby__settings-account-actions';
  formActions.append(resetButton, saveButton);
  form.append(
    backgroundLabel,
    mediaTypeLabel,
    visibleLabel,
    positionXControl.label,
    positionYControl.label,
    scaleControl.label,
    formActions,
  );

  const customizationStatus = document.createElement('p');
  customizationStatus.className = 'pf-lobby__settings-status';
  customizationStatus.setAttribute('role', 'status');
  customizationStatus.setAttribute('aria-live', 'polite');
  body.append(form, customizationStatus);
  panel.append(header, body);
  root.append(panel);

  let opener: HTMLElement | null = null;
  let currentCustomization = { ...options.customization };

  const readCustomization = (): LobbyCustomizationModel => ({
    selectedBackgroundId: backgroundSelect.value,
    standingVisible: visibleInput.checked,
    standingMediaType: readStandingMediaType(mediaTypeSelect.value),
    standingPositionX: Number(positionXControl.input.value),
    standingPositionY: Number(positionYControl.input.value),
    standingScale: Number(scaleControl.input.value),
  });

  const setCustomization = (customization: LobbyCustomizationModel): void => {
    currentCustomization = { ...customization };
    backgroundSelect.value = customization.selectedBackgroundId;
    visibleInput.checked = customization.standingVisible;
    mediaTypeSelect.value = customization.standingMediaType;
    positionXControl.setValue(customization.standingPositionX);
    positionYControl.setValue(customization.standingPositionY);
    scaleControl.setValue(customization.standingScale);
    options.onPreviewCustomization(currentCustomization);
  };

  const preview = (): void => {
    positionXControl.refreshOutput();
    positionYControl.refreshOutput();
    scaleControl.refreshOutput();
    options.onPreviewCustomization(readCustomization());
  };

  function close(): void {
    setCustomization(currentCustomization);
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
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    options.onSaveCustomization(readCustomization());
  });
  for (const control of [
    backgroundSelect,
    mediaTypeSelect,
    visibleInput,
    positionXControl.input,
    positionYControl.input,
    scaleControl.input,
  ]) {
    control.addEventListener('input', preview);
  }

  setCustomization(options.customization);

  const controls: Array<HTMLInputElement | HTMLSelectElement | HTMLButtonElement> = [
    backgroundSelect,
    mediaTypeSelect,
    visibleInput,
    positionXControl.input,
    positionYControl.input,
    scaleControl.input,
    closeButton,
    resetButton,
    saveButton,
  ];

  return {
    root,
    open: () => {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root.hidden = false;
      options.onOpenChange(true);
      root.focus();
    },
    setCustomization,
    setStatus: (message) => {
      customizationStatus.textContent = message;
    },
    setBusy: (busy) => {
      for (const control of controls) {
        control.disabled = busy;
      }
    },
  };
}

/**
 * select가 돌려준 문자열을 standing 미디어 형식으로 옮긴다.
 * 모르는 값은 저장 경계에서 거절당하기 전에 기본값으로 접는다.
 */
export function readStandingMediaType(value: string): LobbyStandingMediaType {
  if (value === 'video' || value === 'image') {
    return value;
  }
  return 'auto';
}

function createRangeControl(
  text: string,
  range: { min: number; max: number },
  suffix: string,
): {
  label: HTMLLabelElement;
  input: HTMLInputElement;
  setValue: (value: number) => void;
  refreshOutput: () => void;
} {
  const label = document.createElement('label');
  label.className = 'pf-lobby__settings-field';
  const heading = document.createElement('span');
  heading.className = 'pf-lobby__settings-range-heading';
  const name = document.createElement('span');
  name.textContent = text;
  const output = document.createElement('output');
  heading.append(name, output);

  const input = document.createElement('input');
  input.className = 'pf-lobby__settings-range';
  input.type = 'range';
  input.min = `${range.min}`;
  input.max = `${range.max}`;
  input.step = '1';
  label.append(heading, input);

  const refreshOutput = (): void => {
    output.value = `${input.value}${suffix}`;
  };

  return {
    label,
    input,
    setValue: (value) => {
      input.value = `${value}`;
      refreshOutput();
    },
    refreshOutput,
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
