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

const colors = {
  black: color(0x000000),
  background: color(0x071018),
  backgroundDark: color(0x050b11),
  ink: color(0x07100d),
  inkSoft: color(0x111b18),
  surface: color(0x10261f),
  surfaceSoft: color(0x12211c),
  surfaceRow: color(0x17352d),
  surfaceHover: color(0x24513d),
  surfaceSelected: color(0x31543d),
  surfaceDisabled: color(0x1d2a26),
  primary: color(0xf5fff0),
  primarySoft: color(0xf5faf0),
  primaryWarm: color(0xfff3c2),
  secondary: color(0xd9ebd1),
  secondarySoft: color(0xd7ead4),
  muted: color(0xb8c9c0),
  mutedSoft: color(0x92aa9e),
  disabledText: color(0x8e9a95),
  disabledDetail: color(0x7f8b85),
  disabledAccent: color(0x9cadb0),
  readyAccent: color(0xa6d9b0),
  readyFooter: color(0xdff3de),
  popupPlace: color(0xd9ffd6),
  popupMove: color(0xe2f1ff),
  popupAttack: color(0xffe1dc),
  popupSkill: color(0xfff3c2),
  popupBlock: color(0xf4ffd2),
  stageDetail: color(0xc8dfc7),
  stageLockedDetail: color(0x69756f),
  accent: color(0xbfeec5),
  accentSoft: color(0xa8d2af),
  danger: color(0xffd8d8),
  dangerBorder: color(0xff8e8e),
  white: color(0xffffff),
} as const;

const text = {
  heroTitle: {
    fontSize: '78px',
    color: color(0xf4f8ef),
    fontStyle: '700',
    stroke: color(0x1a2f28),
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
    stroke: color(0x182e27),
    strokeThickness: 7,
  },
  screenTitle: {
    fontSize: '56px',
    color: colors.primarySoft,
    fontStyle: '700',
    stroke: color(0x182e27),
    strokeThickness: 7,
  },
  loaderTitle: { fontSize: '54px', color: color(0xf0f7eb) },
  loaderStatus: { fontSize: '18px', color: color(0xd0e2d2) },
  loaderPercent: { fontSize: '20px', color: color(0xeef7ed) },
  detailTitle: { fontSize: '36px', color: colors.primary, fontStyle: '700' },
  panelTitle: { fontSize: '30px', color: colors.primary, fontStyle: '700' },
  titleTagline: { fontSize: '28px', color: color(0xd8ead3) },
  menuSubtitle: { fontSize: '26px', color: colors.secondary },
  prompt: { fontSize: '26px', color: color(0xecf7e8) },
  subtitle: { fontSize: '24px', color: colors.secondary },
  status: { fontSize: '22px', color: color(0xe6f4df) },
  statusLarge: { fontSize: '24px', color: color(0xe6f4df) },
  panelSubtitle: { fontSize: '18px', color: colors.accentSoft },
  helper: { fontSize: '16px', color: color(0xb8cbb7) },
  menuStatus: { fontSize: '18px', color: color(0xd5e7d1) },
  empty: { fontSize: '24px', color: colors.muted },
  buttonLabel: { fontSize: '28px', color: colors.primary },
  buttonLabelDisabled: { fontSize: '28px', color: color(0x7e8b84) },
  disabledCaption: { fontSize: '14px', color: color(0x8d9b95) },
  rowTitle: { fontSize: '22px', color: colors.primary },
  rowMeta: { fontSize: '17px', color: colors.secondarySoft },
  rowId: { fontSize: '14px', color: colors.mutedSoft },
  rowIdSelected: { fontSize: '14px', color: colors.primaryWarm },
  tab: { fontSize: '22px', color: colors.secondarySoft },
  tabSelected: { fontSize: '22px', color: colors.primaryWarm },
  hudSummary: { fontSize: '22px', color: colors.accent },
  hudSummaryDirty: { fontSize: '22px', color: colors.primaryWarm },
  stageListTitle: { fontSize: '28px', color: color(0xf1f9ed) },
  stageCardOrder: { fontSize: '14px', color: colors.secondarySoft },
  stageCardName: { fontSize: '23px', color: colors.primary },
  stageResultTitle: { fontSize: '26px', color: colors.primaryWarm },
  bodyLarge: { fontSize: '20px', color: color(0xf1f8ec) },
  body: { fontSize: '19px', color: color(0xf1f8ec) },
  bodySmall: { fontSize: '18px', color: colors.secondarySoft },
  caption: { fontSize: '15px', color: color(0xb7c9ba) },
  slotLabel: { fontSize: '20px', color: colors.readyAccent },
  slotTitleEmpty: { fontSize: '28px', color: colors.disabledText },
  slotTitle: { fontSize: '26px', color: colors.primary },
  slotSubtitle: { fontSize: '16px', color: colors.secondarySoft },
  slotFooter: { fontSize: '15px', color: colors.readyFooter },
  battleLabel: { fontSize: '17px', color: color(0xa9c9b6) },
  battleHudHeading: { fontSize: '16px', color: color(0xa8c7af) },
  battleHudValue: { fontSize: '20px', color: color(0xfff7d2) },
  battleHudMeta: { fontSize: '15px', color: color(0xd5e7d1) },
  battleCenteredLabel: { fontSize: '17px', color: color(0xd9ead9) },
  battleCardName: {
    fontSize: '15px',
    color: color(0xaeb8b1),
    stroke: colors.ink,
    strokeThickness: 4,
  },
  battlePileCount: {
    fontSize: '17px',
    color: color(0xeef7ed),
    stroke: colors.ink,
    strokeThickness: 5,
  },
  battlePreviewName: {
    fontSize: '30px',
    color: colors.white,
    stroke: colors.black,
    strokeThickness: 5,
  },
  battleStatus: { fontSize: '18px', color: color(0xc7d7ca) },
  battleResultTitle: {
    fontSize: '58px',
    color: colors.primaryWarm,
    fontStyle: '700',
    stroke: colors.ink,
    strokeThickness: 7,
  },
  battleResultBody: { fontSize: '24px', color: color(0xedf8e9) },
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
  cardInfoTitle: {
    fontSize: '32px',
    color: color(0xf8fff1),
    stroke: colors.ink,
    strokeThickness: 2,
  },
  cardInfoSubtitle: {
    fontSize: '22px',
    color: color(0xcfe6d0),
    stroke: colors.ink,
    strokeThickness: 2,
  },
  cardInfoLabel: {
    fontSize: '21px',
    color: color(0x95afa3),
    stroke: colors.ink,
    strokeThickness: 2,
  },
  cardInfoValue: {
    fontSize: '23px',
    color: color(0xedf7e8),
    stroke: colors.ink,
    strokeThickness: 2,
  },
} as const satisfies Record<string, UiTextStyleToken>;

const surfaces = {
  loaderBackground: { fill: color(0x041018), fillAlpha: 1 },
  loaderShade: { fill: colors.black, fillAlpha: 0.45 },
  progressTrack: { fill: color(0x13221d), fillAlpha: 0.95 },
  progressFill: { fill: color(0xa8e6b2), fillAlpha: 0.95 },
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
    fill: color(0x10221d),
    fillAlpha: 0.92,
    stroke: color(0x9ecfaa),
    strokeAlpha: 0.54,
    strokeWidth: 2,
  },
  stageCard: {
    fill: color(0x1a3a2d),
    fillAlpha: 0.95,
    stroke: colors.accent,
    strokeAlpha: 0.7,
    strokeWidth: 2,
  },
  stageCardSelected: {
    fill: color(0x1a3a2d),
    fillAlpha: 0.95,
    stroke: color(0xffe4a8),
    strokeAlpha: 0.96,
    strokeWidth: 4,
  },
  stageCardLocked: {
    fill: color(0x15201d),
    fillAlpha: 0.95,
    stroke: color(0x51605a),
    strokeAlpha: 0.7,
    strokeWidth: 2,
  },
  stageCardLockedHover: { fill: colors.surfaceDisabled, fillAlpha: 0.98 },
  detailRow: {
    fill: colors.surfaceRow,
    fillAlpha: 0.72,
    stroke: color(0x78a98d),
    strokeAlpha: 0.42,
    strokeWidth: 1,
  },
  resultWin: {
    fill: colors.surface,
    fillAlpha: 0.94,
    stroke: color(0xffe4a8),
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
    stroke: color(0x4e5d57),
    strokeAlpha: 0.7,
    strokeWidth: 2,
  },
  slotReady: {
    fill: color(0x1a3a2d),
    fillAlpha: 0.96,
    stroke: colors.accent,
    strokeAlpha: 0.94,
    strokeWidth: 2,
  },
  slotEmptyHover: { fill: color(0x173027), fillAlpha: 0.99 },
  slotReadyHover: { fill: colors.surfaceHover, fillAlpha: 0.99 },
  slotDelete: {
    fill: color(0x341d22),
    fillAlpha: 0.97,
    stroke: colors.dangerBorder,
    strokeAlpha: 0.94,
    strokeWidth: 2,
  },
  slotDeleteHover: { fill: color(0x51252d), fillAlpha: 0.99 },
  row: {
    fill: colors.surfaceRow,
    fillAlpha: 0.92,
    stroke: color(0x78a98d),
    strokeAlpha: 0.5,
    strokeWidth: 1,
  },
  rowSelected: {
    fill: colors.surfaceSelected,
    fillAlpha: 0.92,
    stroke: color(0xffe4a8),
    strokeAlpha: 0.95,
    strokeWidth: 3,
  },
  rowAssigned: {
    fill: colors.surfaceRow,
    fillAlpha: 0.92,
    stroke: color(0xa8a05f),
    strokeAlpha: 0.75,
    strokeWidth: 1,
  },
  rowHover: { fill: colors.surfaceHover, fillAlpha: 0.98 },
  rowSelectedHover: { fill: color(0x3c684a), fillAlpha: 0.98 },
  tab: {
    fill: colors.surfaceSoft,
    fillAlpha: 0.96,
    stroke: color(0x78a98d),
    strokeAlpha: 0.56,
    strokeWidth: 2,
  },
  tabSelected: {
    fill: colors.surfaceSelected,
    fillAlpha: 0.96,
    stroke: color(0xffe4a8),
    strokeAlpha: 0.95,
    strokeWidth: 2,
  },
  button: {
    fill: color(0x1d3f31),
    fillAlpha: 0.96,
    stroke: color(0xdaf6d3),
    strokeAlpha: 0.92,
    strokeWidth: 2,
  },
  buttonDisabled: {
    fill: colors.surfaceSoft,
    fillAlpha: 0.72,
    stroke: color(0x51605a),
    strokeAlpha: 0.58,
    strokeWidth: 2,
  },
  scrollTrack: { fill: color(0x07130f), fillAlpha: 0.72 },
  scrollThumb: { fill: colors.accent, fillAlpha: 0.78 },
  modal: {
    fill: color(0x10241e),
    fillAlpha: 0.98,
    stroke: colors.accent,
    strokeAlpha: 0.94,
    strokeWidth: 3,
  },
  battleHud: {
    fill: color(0x12251f),
    fillAlpha: 0.94,
    stroke: colors.accent,
    strokeAlpha: 0.72,
    strokeWidth: 2,
  },
  battleStatus: {
    fill: color(0x10211b),
    fillAlpha: 0.94,
    stroke: colors.accent,
    strokeAlpha: 0.72,
    strokeWidth: 2,
  },
  modalBackdrop: { fill: colors.black, fillAlpha: 0.52 },
  modalWin: {
    fill: color(0x10241e),
    fillAlpha: 0.98,
    stroke: color(0xffe4a8),
    strokeAlpha: 0.94,
    strokeWidth: 3,
  },
  modalLoss: {
    fill: color(0x10241e),
    fillAlpha: 0.98,
    stroke: colors.dangerBorder,
    strokeAlpha: 0.94,
    strokeWidth: 3,
  },
  cardInfo: {
    fill: color(0x10211b),
    fillAlpha: 0.96,
    stroke: color(0xd8efcd),
    strokeAlpha: 0.86,
    strokeWidth: 3,
  },
  cardPreviewPlayer: { fill: color(0x132c25), fillAlpha: 0.94 },
  cardPreviewEnemy: { fill: color(0x281c2c), fillAlpha: 0.94 },
  cardFallbackPlayer: { fill: color(0x1c4238), fillAlpha: 0.98 },
  cardFallbackEnemy: { fill: color(0x42233c), fillAlpha: 0.98 },
  cardDetailsPlayer: {
    fill: color(0x132620),
    fillAlpha: 0.94,
    stroke: colors.accent,
    strokeAlpha: 0.62,
    strokeWidth: 2,
  },
  cardDetailsEnemy: {
    fill: color(0x132620),
    fillAlpha: 0.94,
    stroke: color(0xcaa6df),
    strokeAlpha: 0.62,
    strokeWidth: 2,
  },
  cardFrame: {
    fill: colors.black,
    fillAlpha: 0,
    stroke: color(0xf5ffe9),
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
    login: {
      panelBackground: 'rgba(7, 16, 24, 0.96)',
      panelBorder: '1px solid rgba(218, 246, 211, 0.68)',
      panelShadow: '0 22px 70px rgba(0, 0, 0, 0.5)',
      inputBackground: 'rgba(18, 33, 28, 0.94)',
      inputBorder: '1px solid rgba(183, 201, 186, 0.52)',
      focusRing: 'rgba(191, 238, 197, 0.22)',
      buttonBorder: '1px solid rgba(218, 246, 211, 0.82)',
    },
    licenseDialog: {
      overlayPadding: '28px',
      overlayBackground: 'rgba(0, 0, 0, 0.68)',
      panelPadding: '28px',
      panelBorder: '1px solid rgba(218, 246, 211, 0.52)',
      panelRadius: '8px',
      panelBackground: 'rgba(7, 16, 24, 0.98)',
      panelShadow: '0 22px 70px rgba(0, 0, 0, 0.5)',
      headerGap: '20px',
      headerMarginBottom: '18px',
      titleFontSize: '32px',
      closeButtonHeight: '40px',
      closeButtonPadding: '0 18px',
      closeButtonBorder: '1px solid rgba(218, 246, 211, 0.8)',
      closeButtonRadius: '6px',
      closeButtonFontSize: '18px',
      introMargin: '0 0 22px',
      introFontSize: '18px',
      introLineHeight: '1.65',
      listGap: '12px',
      linkPadding: '14px 16px',
      linkBorder: '1px solid rgba(183, 201, 186, 0.36)',
      linkRadius: '6px',
      linkBackground: 'rgba(18, 33, 28, 0.84)',
      linkFontSize: '17px',
      linkLineHeight: '1.4',
      linkTitleMarginBottom: '4px',
      linkTitleFontSize: '18px',
      linkPurposeMarginBottom: '6px',
      linkPurposeFontSize: '15px',
      linkUrlColor: '#9fb6aa',
      linkUrlFontSize: '13px',
    },
    /**
     * 덱 구성 화면 토큰이다.
     * 목업의 카드 타일·배지·필터 구조를 따르되 색은 이 프로젝트 팔레트를 쓴다.
     */
    deckBuild: {
      sidebarWidth: '196px',
      panelGap: '14px',
      panelBackground: 'rgba(16, 34, 29, 0.92)',
      panelBorder: '1px solid rgba(158, 207, 170, 0.42)',
      panelRadius: '8px',
      panelHeaderGap: '10px',
      panelShadow: '0 14px 40px rgba(0, 0, 0, 0.45)',
      sidebarBackground: 'rgba(9, 24, 20, 0.96)',
      tabPadding: '10px 12px',
      tabRadius: '5px',
      tabBackground: 'rgba(23, 53, 45, 0.72)',
      tabSelectedBackground: 'rgba(49, 84, 61, 0.95)',
      tabSelectedBorder: '1px solid rgba(191, 238, 197, 0.72)',
      cardWidth: '104px',
      cardGap: '12px',
      cardRadius: '6px',
      cardBackground: 'rgba(26, 58, 45, 0.95)',
      cardBorder: '1px solid rgba(183, 201, 186, 0.42)',
      cardHoverBorder: '1px solid rgba(191, 238, 197, 0.9)',
      cardShadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
      cardSelectGlow: '0 0 0 2px rgba(255, 243, 194, 0.9), 0 0 16px rgba(255, 243, 194, 0.45)',
      cardFallbackBackground: 'radial-gradient(circle at 50% 35%, #1f3a2c, #0d1712)',
      /**
       * 수치는 카드 이미지에 이미 그려진 orb 위에 얹는다.
       * 좌표는 cards/card_frame_meta.json의 orb center를 1024x1536 캔버스 비율로 환산한 값이다.
       */
      orbInsetX: '13.281%',
      orbInsetY: '8.854%',
      orbFontScale: '0.115',
      orbColor: '#ffffff',
      orbTextShadow:
        '0 0 2px rgba(0, 0, 0, 0.95), 0 1px 2px rgba(0, 0, 0, 0.9), 1px 0 1px rgba(0, 0, 0, 0.75), -1px 0 1px rgba(0, 0, 0, 0.75)',
      filterSize: '26px',
      filterGap: '8px',
      filterFontSize: '11px',
      filterBackground: 'rgba(23, 53, 45, 0.8)',
      filterActiveBackground: '#bfeec5',
      filterActiveRing: '0 0 0 2px rgba(255, 243, 194, 0.85)',
    },
  },
} as const;

export type UiTextVariant = keyof typeof UI_THEME.text;
export type UiSurfaceVariant = keyof typeof UI_THEME.surfaces;
