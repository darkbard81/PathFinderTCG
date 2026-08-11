export const DEFAULT_FONT_FAMILY = 'Pretendard GOV';

export type UiColorToken = Readonly<{
  canvas: number;
  css: `#${string}`;
}>;

export type UiTextStyleToken = Readonly<{
  fontSize: string;
  color: UiColorToken;
  fontStyle?: string;
  stroke?: UiColorToken;
  strokeThickness?: number;
  shadow?: Readonly<{
    x: number;
    y: number;
    color: UiColorToken;
    blur: number;
    shadowStroke: boolean;
    shadowFill: boolean;
  }>;
}>;

export type UiSurfaceStyleToken = Readonly<{
  fill: UiColorToken;
  fillAlpha: number;
  stroke?: UiColorToken;
  strokeAlpha?: number;
  strokeWidth?: number;
}>;

function color(canvas: number): UiColorToken {
  return {
    canvas,
    css: `#${canvas.toString(16).padStart(6, '0')}`,
  };
}

/**
 * `documents/Pathfinder TCG UI System (standalone).html`이 정한 색 토큰이다.
 * 이름과 값은 그 문서를 그대로 옮겼다. 화면에서 쓰는 이름은 아래 colors가 정하고,
 * 여기에는 디자인 시스템이 부른 이름만 둔다.
 */
const palette = {
  bg: 0x0a0e1c,
  bg2: 0x111a30,
  bg3: 0x070a16,
  panel: 0x141d35,
  panel2: 0x1b2748,
  ink: 0xeef1f8,
  inkDim: 0xa2aac6,
  inkFaint: 0x5c6485,
  accent: 0xd9a53f,
  accentHover: 0xe8bb5e,
  accentPress: 0xb8842a,
  accent2: 0x3f8ed6,
  accent2Hover: 0x5fa4e0,
  accent2Press: 0x2f6fae,
  gilt: 0xe6b84a,
  giltDim: 0x6b6a8f,
  arcane: 0x6a83e0,
  arcaneHover: 0x8298ea,
  regal: 0xa877d9,
  /* PF2e가 희귀도 Uncommon에 쓰는 주황이다. 어두운 바탕에서 읽히도록 원래 값보다 밝다. */
  traitOrange: 0xd98131,
  /* 크기 특성용 초록이다. 희귀도의 파랑·보라와 겹치지 않게 고른다. */
  traitGreen: 0x5aa86a,
  regalHover: 0xbd94e6,
  danger: 0xb6362c,
  dangerHover: 0xcf4536,
  dangerPress: 0x8f281f,
  /** 위험 패널의 제목 색이다. 어두운 바탕에서 danger를 글자로 쓰면 읽히지 않는다. */
  dangerInk: 0xe8a49c,
} as const;

/**
 * 화면이 부르는 의미 이름이다.
 *
 * 디자인 시스템은 표면 하나에 상태별 색을 따로 주지 않고, 선택은 gilt 테두리와
 * 글로우로, 비활성은 투명도로 나타낸다. 그래서 hover·selected·disabled 채움은
 * 여기서 panel2를 ink 쪽으로 섞어 만든다. 섞는 비율은 8%, 14%, 20% 순이다.
 */
const colors = {
  /*
   * 특성 칩 색이다. PF2e는 크기와 희귀도를 색으로 구분한다.
   * 원작은 밝은 양피지 위 채운 태그라 값이 어둡다. 여기는 어두운 남색 패널이라
   * 같은 계열을 밝은 쪽으로 옮겨 테두리와 글자로 쓴다. Common은 원작대로 색을 주지 않는다.
   */
  traitSize: color(palette.traitGreen),
  traitRarityUncommon: color(palette.traitOrange),
  traitRarityRare: color(palette.arcane),
  traitRarityUnique: color(palette.regal),

  black: color(0x000000),
  background: color(palette.bg),
  backgroundDark: color(palette.bg3),
  ink: color(palette.bg3),
  inkSoft: color(palette.bg2),
  surface: color(palette.panel),
  surfaceSoft: color(palette.bg2),
  surfaceRow: color(palette.panel2),
  surfaceHover: color(0x2c3756),
  surfaceSelected: color(0x394361),
  surfaceDisabled: color(0x0f1628),
  primary: color(palette.ink),
  primarySoft: color(0xe5e8f2),
  primaryWarm: color(palette.gilt),
  secondary: color(palette.inkDim),
  secondarySoft: color(palette.inkDim),
  muted: color(palette.inkDim),
  mutedSoft: color(palette.inkFaint),
  disabledText: color(palette.inkFaint),
  disabledDetail: color(0x4c5370),
  disabledAccent: color(palette.inkFaint),
  readyAccent: color(palette.accent2Hover),
  readyFooter: color(palette.inkDim),
  popupPlace: color(palette.accent2Hover),
  popupMove: color(palette.arcaneHover),
  popupAttack: color(palette.dangerInk),
  popupSkill: color(palette.gilt),
  popupBlock: color(palette.regalHover),
  stageDetail: color(palette.inkDim),
  stageLockedDetail: color(0x3f4660),
  accent: color(palette.gilt),
  accentSoft: color(0xceb375),
  danger: color(palette.dangerInk),
  dangerBorder: color(palette.dangerHover),
  white: color(0xffffff),
} as const;

const text = {
  heroTitle: {
    fontSize: '78px',
    color: color(palette.ink),
    fontStyle: '700',
    stroke: color(palette.bg3),
    strokeThickness: 8,
    shadow: {
      x: 0,
      y: 4,
      color: colors.black,
      blur: 12,
      shadowStroke: false,
      shadowFill: true,
    },
  },
  menuTitle: {
    fontSize: '58px',
    color: colors.primarySoft,
    fontStyle: '700',
    stroke: color(palette.bg3),
    strokeThickness: 7,
  },
  screenTitle: {
    fontSize: '56px',
    color: colors.primarySoft,
    fontStyle: '700',
    stroke: color(palette.bg3),
    strokeThickness: 7,
  },
  loaderTitle: { fontSize: '54px', color: color(palette.ink) },
  loaderStatus: { fontSize: '18px', color: color(palette.inkDim) },
  loaderPercent: { fontSize: '20px', color: color(palette.ink) },
  detailTitle: { fontSize: '36px', color: colors.primary, fontStyle: '700' },
  panelTitle: { fontSize: '30px', color: colors.primary, fontStyle: '700' },
  titleTagline: { fontSize: '28px', color: color(palette.inkDim) },
  menuSubtitle: { fontSize: '26px', color: colors.secondary },
  prompt: { fontSize: '26px', color: color(palette.ink) },
  subtitle: { fontSize: '24px', color: colors.secondary },
  status: { fontSize: '22px', color: color(palette.ink) },
  statusLarge: { fontSize: '24px', color: color(palette.ink) },
  panelSubtitle: { fontSize: '18px', color: colors.accentSoft },
  helper: { fontSize: '16px', color: color(palette.inkDim) },
  menuStatus: { fontSize: '18px', color: color(palette.inkDim) },
  empty: { fontSize: '24px', color: colors.muted },
  buttonLabel: { fontSize: '28px', color: colors.primary },
  buttonLabelDisabled: { fontSize: '28px', color: color(palette.inkFaint) },
  disabledCaption: { fontSize: '14px', color: color(palette.inkFaint) },
  /*
   * 카드 정보 패널 전용 크기다.
   * 공용 토큰(panelTitle 30px, rowTitle 22px, bodySmall 18px)을 그대로 쓰면
   * 높이 230px짜리 패널에 비해 글자가 커서 읽을 것이 몇 줄 안 들어간다.
   * 공용 토큰을 줄이면 다른 화면이 함께 작아지므로 여기만 따로 잡는다.
   */
  cardDetailName: { fontSize: '22px', color: colors.primary, fontStyle: '700' },
  cardDetailMeta: { fontSize: '14px', color: colors.accentSoft },
  cardDetailStat: { fontSize: '17px', color: colors.primary },
  cardDetailTrait: { fontSize: '13px', color: colors.secondarySoft },
  cardDetailAbilityName: { fontSize: '16px', color: colors.primary },
  /*
   * 능력 분류 배지다. mutedSoft는 배지 배경 위에서 명암비가 2.56:1로 AA에 한참 못 미쳤다.
   * 12px 작은 글자라 더 안 읽힌다. accentSoft는 같은 배경에서 7.31:1이다.
   */
  cardDetailAbilityCategory: { fontSize: '12px', color: colors.accentSoft },
  cardDetailBody: { fontSize: '14px', color: colors.secondarySoft },
  cardDetailEmpty: { fontSize: '15px', color: colors.muted },

  rowTitle: { fontSize: '22px', color: colors.primary },
  rowMeta: { fontSize: '17px', color: colors.secondarySoft },
  rowId: { fontSize: '14px', color: colors.mutedSoft },
  rowIdSelected: { fontSize: '14px', color: colors.primaryWarm },
  tab: { fontSize: '22px', color: colors.secondarySoft },
  tabSelected: { fontSize: '22px', color: colors.primaryWarm },
  hudSummary: { fontSize: '22px', color: colors.accent },
  hudSummaryDirty: { fontSize: '22px', color: colors.primaryWarm },
  stageListTitle: { fontSize: '28px', color: color(palette.ink) },
  stageCardOrder: { fontSize: '14px', color: colors.secondarySoft },
  stageCardName: { fontSize: '23px', color: colors.primary },
  stageResultTitle: { fontSize: '26px', color: colors.primaryWarm },
  bodyLarge: { fontSize: '20px', color: color(palette.ink) },
  body: { fontSize: '19px', color: color(palette.ink) },
  bodySmall: { fontSize: '18px', color: colors.secondarySoft },
  caption: { fontSize: '15px', color: color(palette.inkDim) },
  slotLabel: { fontSize: '20px', color: colors.readyAccent },
  slotTitleEmpty: { fontSize: '28px', color: colors.disabledText },
  slotTitle: { fontSize: '26px', color: colors.primary },
  slotSubtitle: { fontSize: '16px', color: colors.secondarySoft },
  slotFooter: { fontSize: '15px', color: colors.readyFooter },
  battleLabel: { fontSize: '17px', color: color(palette.inkDim) },
  battleHudHeading: { fontSize: '16px', color: color(palette.inkDim) },
  battleHudValue: { fontSize: '20px', color: color(palette.gilt) },
  battleHudMeta: { fontSize: '15px', color: color(palette.inkDim) },
  battleCenteredLabel: { fontSize: '17px', color: color(palette.inkDim) },
  battleCardName: {
    fontSize: '15px',
    color: color(palette.inkDim),
    stroke: colors.ink,
    strokeThickness: 4,
  },
  battlePileCount: {
    fontSize: '17px',
    color: color(palette.ink),
    stroke: colors.ink,
    strokeThickness: 5,
  },
  battlePreviewName: {
    fontSize: '30px',
    color: colors.white,
    stroke: colors.black,
    strokeThickness: 5,
  },
  battleStatus: { fontSize: '18px', color: color(palette.inkDim) },
  battleResultTitle: {
    fontSize: '58px',
    color: colors.primaryWarm,
    fontStyle: '700',
    stroke: colors.ink,
    strokeThickness: 7,
  },
  battleResultBody: { fontSize: '24px', color: color(palette.ink) },
  battleCardOverlay: {
    fontSize: '18px',
    color: colors.white,
    stroke: colors.black,
    strokeThickness: 4,
  },
  battlePopup: {
    fontSize: '24px',
    color: colors.primaryWarm,
    stroke: colors.ink,
    strokeThickness: 5,
  },
} as const satisfies Record<string, UiTextStyleToken>;

const surfaces = {
  loaderBackground: { fill: color(palette.bg3), fillAlpha: 1 },
  loaderShade: { fill: colors.black, fillAlpha: 0.45 },
  progressTrack: { fill: color(palette.panel), fillAlpha: 0.95 },
  progressFill: { fill: color(palette.gilt), fillAlpha: 0.95 },
  titleBackdrop: { fill: colors.backgroundDark, fillAlpha: 0.22 },
  titleShade: { fill: colors.black, fillAlpha: 0.08 },
  menuBackdrop: { fill: colors.background, fillAlpha: 0.48 },
  menuShade: { fill: colors.black, fillAlpha: 0.12 },
  saveBackdrop: { fill: colors.background, fillAlpha: 0.56 },
  saveShade: { fill: colors.black, fillAlpha: 0.14 },
  stageBackdrop: { fill: colors.background, fillAlpha: 0.62 },
  screenDim: { fill: colors.background, fillAlpha: 0.66 },
  screenShade: { fill: colors.black, fillAlpha: 0.18 },
  panel: {
    fill: colors.surface,
    fillAlpha: 0.94,
    stroke: colors.accent,
    strokeAlpha: 0.64,
    strokeWidth: 2,
  },
  stageListPanel: {
    fill: color(palette.panel),
    fillAlpha: 0.92,
    stroke: color(palette.giltDim),
    strokeAlpha: 0.54,
    strokeWidth: 2,
  },
  stageCard: {
    fill: color(palette.panel2),
    fillAlpha: 0.95,
    stroke: colors.accent,
    strokeAlpha: 0.7,
    strokeWidth: 2,
  },
  stageCardSelected: {
    fill: color(palette.panel2),
    fillAlpha: 0.95,
    stroke: color(palette.gilt),
    strokeAlpha: 0.96,
    strokeWidth: 4,
  },
  stageCardLocked: {
    fill: colors.surfaceDisabled,
    fillAlpha: 0.95,
    stroke: color(palette.inkFaint),
    strokeAlpha: 0.7,
    strokeWidth: 2,
  },
  stageCardLockedHover: { fill: colors.surfaceDisabled, fillAlpha: 0.98 },
  detailRow: {
    fill: colors.surfaceRow,
    fillAlpha: 0.72,
    stroke: color(palette.giltDim),
    strokeAlpha: 0.42,
    strokeWidth: 1,
  },
  resultWin: {
    fill: colors.surface,
    fillAlpha: 0.94,
    stroke: color(palette.gilt),
    strokeAlpha: 0.82,
    strokeWidth: 2,
  },
  resultLoss: {
    fill: colors.surface,
    fillAlpha: 0.94,
    stroke: colors.dangerBorder,
    strokeAlpha: 0.82,
    strokeWidth: 2,
  },
  slotEmpty: {
    fill: colors.surfaceSoft,
    fillAlpha: 0.96,
    stroke: color(palette.inkFaint),
    strokeAlpha: 0.7,
    strokeWidth: 2,
  },
  slotReady: {
    fill: color(palette.panel2),
    fillAlpha: 0.96,
    stroke: colors.accent,
    strokeAlpha: 0.94,
    strokeWidth: 2,
  },
  slotEmptyHover: { fill: color(0x1e273c), fillAlpha: 0.99 },
  slotReadyHover: { fill: colors.surfaceHover, fillAlpha: 0.99 },
  slotDelete: {
    fill: color(0x3a1920),
    fillAlpha: 0.97,
    stroke: colors.dangerBorder,
    strokeAlpha: 0.94,
    strokeWidth: 2,
  },
  slotDeleteHover: { fill: color(0x572023), fillAlpha: 0.99 },
  row: {
    fill: colors.surfaceRow,
    fillAlpha: 0.92,
    stroke: color(palette.giltDim),
    strokeAlpha: 0.5,
    strokeWidth: 1,
  },
  rowSelected: {
    fill: colors.surfaceSelected,
    fillAlpha: 0.92,
    stroke: color(palette.gilt),
    strokeAlpha: 0.95,
    strokeWidth: 3,
  },
  rowAssigned: {
    fill: colors.surfaceRow,
    fillAlpha: 0.92,
    stroke: color(palette.accentPress),
    strokeAlpha: 0.75,
    strokeWidth: 1,
  },
  rowHover: { fill: colors.surfaceHover, fillAlpha: 0.98 },
  rowSelectedHover: { fill: color(0x454f6b), fillAlpha: 0.98 },
  tab: {
    fill: colors.surfaceSoft,
    fillAlpha: 0.96,
    stroke: color(palette.giltDim),
    strokeAlpha: 0.56,
    strokeWidth: 2,
  },
  tabSelected: {
    fill: colors.surfaceSelected,
    fillAlpha: 0.96,
    stroke: color(palette.gilt),
    strokeAlpha: 0.95,
    strokeWidth: 2,
  },
  button: {
    fill: color(palette.panel2),
    fillAlpha: 0.96,
    stroke: color(palette.gilt),
    strokeAlpha: 0.92,
    strokeWidth: 2,
  },
  buttonDisabled: {
    fill: colors.surfaceSoft,
    fillAlpha: 0.72,
    stroke: color(palette.inkFaint),
    strokeAlpha: 0.58,
    strokeWidth: 2,
  },
  scrollTrack: { fill: color(palette.bg3), fillAlpha: 0.72 },
  scrollThumb: { fill: colors.accent, fillAlpha: 0.78 },
  modal: {
    fill: color(palette.panel),
    fillAlpha: 0.98,
    stroke: colors.accent,
    strokeAlpha: 0.94,
    strokeWidth: 3,
  },
  battleHud: {
    fill: color(palette.panel),
    fillAlpha: 0.94,
    stroke: colors.accent,
    strokeAlpha: 0.72,
    strokeWidth: 2,
  },
  battleStatus: {
    fill: color(palette.panel),
    fillAlpha: 0.94,
    stroke: colors.accent,
    strokeAlpha: 0.72,
    strokeWidth: 2,
  },
  modalBackdrop: { fill: colors.black, fillAlpha: 0.52 },
  modalWin: {
    fill: color(palette.panel),
    fillAlpha: 0.98,
    stroke: color(palette.gilt),
    strokeAlpha: 0.94,
    strokeWidth: 3,
  },
  modalLoss: {
    fill: color(palette.panel),
    fillAlpha: 0.98,
    stroke: colors.dangerBorder,
    strokeAlpha: 0.94,
    strokeWidth: 3,
  },
  cardPreviewPlayer: { fill: color(palette.bg2), fillAlpha: 0.94 },
  cardPreviewEnemy: { fill: color(0x26213e), fillAlpha: 0.94 },
  cardFallbackPlayer: { fill: color(palette.panel2), fillAlpha: 0.98 },
  cardFallbackEnemy: { fill: color(0x3d3058), fillAlpha: 0.98 },
  cardDetailsPlayer: {
    fill: color(palette.panel),
    fillAlpha: 0.94,
    stroke: colors.accent,
    strokeAlpha: 0.62,
    strokeWidth: 2,
  },
  cardDetailsEnemy: {
    fill: color(palette.panel),
    fillAlpha: 0.94,
    stroke: color(palette.regal),
    strokeAlpha: 0.62,
    strokeWidth: 2,
  },
  cardFrame: {
    fill: colors.black,
    fillAlpha: 0,
    stroke: color(palette.gilt),
    strokeAlpha: 0.72,
    strokeWidth: 3,
  },
} as const satisfies Record<string, UiSurfaceStyleToken>;

/**
 * Canvas UI와 DOM UI가 함께 사용하는 의미 기반 테마 토큰이다.
 */
export const UI_THEME = {
  fontFamily: DEFAULT_FONT_FAMILY,
  colors,
  text,
  surfaces,
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  dom: {
    /**
     * 9슬라이스 버튼 스킨의 기하와 투명도다. 그림은 assets/ui/buttons에 있고
     * URL은 assetBaseUrl을 알아야 만들 수 있어 DomLayer가 따로 넣는다.
     *
     * slice는 그림 픽셀 단위라 코너 장식(36px)보다 커야 장식이 찌그러지지 않는다.
     * borderWidth는 화면에 그려질 두께라 slice보다 작아도 된다. 그만큼 줄여 그린다.
     */
    /**
     * 9슬라이스 틀이 맞지 않는 자리에 쓰는 평범한 버튼이다.
     * 작은 아이콘 버튼처럼 사각 프레임과 코너 장식이 과한 곳에 쓴다.
     */
    buttonPlain: {
      border: '1px solid rgba(230, 184, 74, 0.82)',
      radius: '6px',
    },
    button9: {
      /** 아홉 칸이 모두 같은 투명도다. 칸마다 다르게 주려면 그림을 두 겹 얹어야 한다. */
      opacity: '0.8',
      menuSlice: '44',
      menuBorderWidth: '22px',
      menuPadding: '14px 34px',
      menuMinHeight: '58px',
      standardSlice: '42',
      standardBorderWidth: '18px',
      standardPadding: '10px 26px',
      standardMinHeight: '44px',
    },
    /**
     * 진행 막대의 채움이다. 기본은 금색에서 하늘색으로 흐르는 그라데이션이고,
     * 그라데이션이 과한 자리를 위해 같은 두 색의 단색 변형을 따로 둔다.
     * surfaces.progressFill은 알파를 가진 한 색이라 그라데이션을 담을 수 없어 여기 둔다.
     */
    progressBar: {
      fillGradient: `linear-gradient(90deg, ${colors.accent.css} 0%, ${colors.readyAccent.css} 100%)`,
      fillGold: colors.accent.css,
      fillAzure: colors.readyAccent.css,
    },
    login: {
      panelBackground: 'rgba(10, 14, 28, 0.96)',
      panelBorder: '1px solid rgba(230, 184, 74, 0.68)',
      panelShadow: '0 22px 70px rgba(0, 0, 0, 0.5)',
      inputBackground: 'rgba(17, 26, 48, 0.94)',
      inputBorder: '1px solid rgba(238, 231, 210, 0.3)',
      focusRing: 'rgba(230, 184, 74, 0.22)',
    },
    licenseDialog: {
      overlayPadding: '28px',
      overlayBackground: 'rgba(0, 0, 0, 0.68)',
      panelPadding: '28px',
      panelBorder: '1px solid rgba(230, 184, 74, 0.52)',
      panelRadius: '8px',
      panelBackground: 'rgba(10, 14, 28, 0.98)',
      panelShadow: '0 22px 70px rgba(0, 0, 0, 0.5)',
      headerGap: '20px',
      headerMarginBottom: '18px',
      titleFontSize: '32px',
      closeButtonHeight: '40px',
      closeButtonPadding: '0 18px',
      closeButtonBorder: '1px solid rgba(230, 184, 74, 0.8)',
      closeButtonRadius: '6px',
      closeButtonFontSize: '18px',
      introMargin: '0 0 22px',
      introFontSize: '18px',
      introLineHeight: '1.65',
      listGap: '12px',
      linkPadding: '14px 16px',
      linkBorder: '1px solid rgba(238, 231, 210, 0.14)',
      linkRadius: '6px',
      linkBackground: 'rgba(27, 39, 72, 0.84)',
      linkFontSize: '17px',
      linkLineHeight: '1.4',
      linkTitleMarginBottom: '4px',
      linkTitleFontSize: '18px',
      linkPurposeMarginBottom: '6px',
      linkPurposeFontSize: '15px',
      linkUrlColor: '#a2aac6',
      linkUrlFontSize: '13px',
    },
    /**
     * 덱 구성·장비·성장 화면이 공유하는 3분할 레이아웃 토큰이다.
     * 목업의 사이드바·패널·필터 구조를 따르되 색은 이 프로젝트 팔레트를 쓴다.
     */
    cardWorkbench: {
      sidebarWidth: '196px',
      panelGap: '14px',
      panelBackground: 'rgba(20, 29, 53, 0.92)',
      panelBorder: '1px solid rgba(238, 231, 210, 0.3)',
      panelRadius: '8px',
      panelHeaderGap: '10px',
      panelShadow: '0 14px 40px rgba(0, 0, 0, 0.45)',
      sidebarBackground: 'rgba(7, 10, 22, 0.96)',
      tabPadding: '10px 12px',
      tabRadius: '5px',
      tabBackground: 'rgba(27, 39, 72, 0.72)',
      tabSelectedBackground: 'rgba(57, 67, 97, 0.95)',
      tabSelectedBorder: '1px solid rgba(230, 184, 74, 0.72)',
      filterSize: '26px',
      filterGap: '8px',
      filterFontSize: '11px',
      filterBackground: 'rgba(27, 39, 72, 0.8)',
      filterActiveBackground: '#e6b84a',
      filterActiveRing: '0 0 0 2px rgba(230, 184, 74, 0.85)',
      dividerBorder: '1px solid rgba(238, 231, 210, 0.14)',
    },
    /** 카드 이미지 타일 토큰이다. 세 화면이 같은 타일을 쓴다. */
    cardTile: {
      width: '104px',
      gap: '12px',
      radius: '6px',
      border: '1px solid rgba(238, 231, 210, 0.3)',
      hoverBorder: '1px solid rgba(230, 184, 74, 0.9)',
      shadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
      selectGlow: '0 0 0 2px rgba(230, 184, 74, 0.9), 0 0 18px rgba(224, 168, 63, 0.55)',
      fallbackBackground: 'radial-gradient(circle at 50% 35%, #242f52, #0c1024)',
      chipBackground: 'rgba(7, 10, 22, 0.86)',
      chipColor: '#e6b84a',
      chipFontScale: '0.105',
      chipPadding: '1px 5px',
      chipRadius: '3px',
      /**
       * 수치는 카드 네 모서리의 orb 자리에 얹는다.
       * 좌표는 cards/card_frame_meta.json의 orb center를 1024x1536 캔버스 비율로 환산한 값이다.
       */
      orbInsetX: '13.281%',
      orbInsetY: '8.854%',
      /**
       * 배지 크기다. 카드 이미지에 그려진 orb 홀더는 지름 234로 카드 너비의 22.9%이고,
       * 배지 아트는 자기 캔버스의 96% 남짓을 채운다. 24%면 그려진 홀더를 덮는다.
       */
      orbSize: '24%',
      orbFontScale: '0.115',
      orbColor: '#ffffff',
      orbTextShadow:
        '0 0 2px rgba(0, 0, 0, 0.95), 0 1px 2px rgba(0, 0, 0, 0.9), 1px 0 1px rgba(0, 0, 0, 0.75), -1px 0 1px rgba(0, 0, 0, 0.75)',
    },
    /**
     * 전장 화면 토큰이다. 카드 자체는 cardTile 토큰을 그대로 쓰고 보드 껍데기 색만 여기서 정한다.
     * 카드 크기·간격·레일 폭은 뷰포트마다 달라지므로 battlefield-layout이 인라인 변수로 덮어쓴다.
     */
    battlefield: {
      railBackground: 'rgba(7, 10, 22, 0.9)',
      railBorder: '1px solid rgba(238, 231, 210, 0.14)',
      railRadius: '8px',
      railPadding: '14px 14px',
      railGap: '10px',
      railLabelFontSize: '12px',
      railLabelColor: '#a2aac6',
      railValueFontSize: '22px',
      railValueColor: '#e6b84a',
      slotEmptyBorder: '1px dashed rgba(238, 231, 210, 0.3)',
      slotRadius: '6px',
      /*
       * 칸 강조는 카드 위에 덮는 오버레이가 그린다.
       * 카드 이미지가 칸을 꽉 채워서, 칸 자체의 배경과 테두리는 카드가 선 순간 다 가려진다.
       * 그래서 테두리는 inset 그림자로 안쪽에 그리고 바깥 번짐만 밖으로 낸다.
       */
      slotLegalRing: 'inset 0 0 0 2px rgba(95, 164, 224, 0.9)',
      slotLegalBackground: 'rgba(95, 164, 224, 0.16)',
      slotDropRing: 'inset 0 0 0 3px #e6b84a, 0 0 22px rgba(224, 168, 63, 0.6)',
      slotDropBackground: 'rgba(230, 184, 74, 0.26)',
      ghostShadow: '0 18px 42px rgba(0, 0, 0, 0.65)',
      skillSize: '22px',
      skillFontSize: '11px',
      skillColor: '#0a0e1c',
      skillBorder: '1px solid rgba(7, 10, 22, 0.55)',
      skillShadow: '0 2px 6px rgba(0, 0, 0, 0.6)',
      skillHealBackground: '#5fa4e0',
      skillDamageBackground: '#cf4536',
      skillBuffBackground: '#e6b84a',
      slotDominanceFontSize: '13px',
      slotDominanceColor: '#0a0e1c',
      slotDominanceBackground: 'rgba(230, 184, 74, 0.92)',
      pileBackground: 'rgba(20, 29, 53, 0.82)',
      pileBorder: '1px solid rgba(238, 231, 210, 0.14)',
      pileLabelFontSize: '10px',
      pileLabelColor: '#5c6485',
      pileCountFontSize: '18px',
      pileCountColor: '#a2aac6',
      deckStackBackground:
        'linear-gradient(155deg, rgba(27, 39, 72, 0.96), rgba(20, 29, 53, 0.96))',
      deckStackBorder: '1px solid rgba(107, 106, 143, 0.6)',
      countBadgeBackground: 'rgba(7, 10, 22, 0.78)',
      dividerBackground:
        'linear-gradient(90deg, transparent, rgba(230, 184, 74, 0.62), transparent)',
      handBackground: 'linear-gradient(0deg, rgba(7, 10, 22, 0.96) 62%, rgba(7, 10, 22, 0))',
      handGap: '10px',
      handPadding: '12px 18px 14px',
      handHandleWidth: '68px',
      handHandleHeight: '16px',
      handHandleBackground: 'rgba(27, 39, 72, 0.94)',
      handHandleBorder: '1px solid rgba(107, 106, 143, 0.6)',
      turnBannerBackground: 'rgba(27, 39, 72, 0.9)',
      turnBannerEnemyBackground: 'rgba(61, 48, 88, 0.9)',
      logFontSize: '12px',
      logColor: '#a2aac6',
      logLineHeight: '1.55',
    },
  },
} as const;

export type UiTextVariant = keyof typeof UI_THEME.text;
export type UiSurfaceVariant = keyof typeof UI_THEME.surfaces;
