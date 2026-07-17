import { ASSET_KEYS } from '../../../game/assets/manifest';

export type PF2eNinePatchVariant =
  'panel' | 'control' | 'tab' | 'scrollTrack' | 'scrollThumb' | 'gridCell' | 'dialog' | 'button';
export const PF2E_NINE_PATCH_VISUAL_STATES = [
  'idle',
  'hover',
  'pressed',
  'focused',
  'selected',
  'disabled',
] as const;
export type PF2eNinePatchVisualState = (typeof PF2E_NINE_PATCH_VISUAL_STATES)[number];

export interface PF2eNinePatchStretchMode {
  readonly edge: 'scale' | 'repeat';
  readonly internal: 'scale' | 'repeat';
}

export const PF2E_NINE_LABEL_VARIANTS = [
  'heading',
  'section',
  'status',
  'tab',
  'primary',
  'danger',
] as const;
export type PF2eNineLabelVariant = (typeof PF2E_NINE_LABEL_VARIANTS)[number];

export interface PF2eNinePatchThemeStyle {
  readonly key: string;
  readonly columns: readonly [number, undefined, number];
  readonly rows: readonly [number, undefined, number];
  readonly stretchMode?: PF2eNinePatchStretchMode;
}

export interface PF2eNineLabelThemeStyle {
  readonly backgroundVariant: PF2eNinePatchVariant;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontStyle: 'normal' | 'bold';
  readonly textColor: string;
  readonly strokeColor: string;
  readonly strokeThickness: number;
  readonly minHeight: number;
  readonly paddingX: number;
  readonly paddingY: number;
}

export const PF2E_ELF_THEME = {
  colors: {
    backdrop: 0x06110d,
    surface: 0x0b2a1e,
    border: 0x9a7944,
    accent: 0x8cc9aa,
    modalCover: 0x020805,
    text: '#f2ead4',
    mutedText: '#a8bcae',
    accentText: '#bce8d0',
    dangerText: '#f0aaa0',
  },
  typography: {
    display: 'Georgia, "Times New Roman", serif',
    body: 'Inter, Pretendard, system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  spacing: {
    panelInset: 42,
    controlGap: 12,
  },
  radii: {
    control: 10,
  },
  strokes: {
    hairline: 1,
    control: 2,
  },
  sizes: {
    minimumTouchTarget: 48,
    treeRow: 54,
    treeToggle: 18,
    scrollbar: 24,
    badge: 64,
  },
  components: {
    tree: {
      inset: 28,
      topInset: 48,
      indent: 22,
      itemGap: 8,
      rowFontSize: 15,
      titleFontSize: 20,
      titlePaddingX: 18,
      titlePaddingY: 10,
      togglePadding: 12,
    },
    showcase: {
      inset: 32,
      sectionGap: 18,
      sampleGap: 12,
      minimumContentWidth: 220,
      titleFontSize: 30,
      bodyFontSize: 15,
      bodyLineSpacing: 7,
      sectionFontSize: 16,
      samplePaddingX: 20,
      samplePaddingY: 10,
      panelSampleHeight: 140,
      controlSampleHeight: 58,
      panelDemoHeight: 260,
      tabPagesDemoHeight: 380,
      scrollablePanelDemoHeight: 360,
      gridTableDemoHeight: 360,
      confirmDialogDemoHeight: 330,
      responsiveHeadingScale: 0.1,
      responsiveHeadingMinimum: 26,
    },
    tabPages: {
      inset: 0,
      tabGap: 0,
      pageGap: 0,
      pageInset: 38,
      tabWidth: 156,
      tabHeight: 70,
    },
    scrollablePanel: {
      maskPadding: 2,
      sliderGap: 12,
      wheelSpeed: 0.12,
      dragThreshold: 8,
      minThumbSize: 64,
    },
    gridTable: {
      columns: 2,
      cellHeight: 104,
      cellGap: 10,
      cellInsetX: 24,
      cellInsetY: 18,
      titleFontSize: 18,
      detailFontSize: 14,
    },
    confirmDialog: {
      inset: 42,
      titleGap: 18,
      contentGap: 24,
      actionGap: 12,
      actionWidth: 176,
      coverAlpha: 0.78,
      depth: 1000,
    },
    badgeLabel: {
      badgePadding: 6,
      badgeFontSize: 18,
    },
    buttons: {
      gap: 12,
      width: 176,
      height: 58,
    },
  },
  ninePatch: {
    panel: {
      key: ASSET_KEYS.pf2eElfPanel,
      columns: [104, undefined, 104],
      rows: [104, undefined, 104],
    },
    control: {
      key: ASSET_KEYS.pf2eElfControl,
      columns: [56, undefined, 56],
      rows: [32, undefined, 32],
    },
    tab: {
      key: ASSET_KEYS.pf2eElfTab,
      columns: [56, undefined, 56],
      rows: [32, undefined, 32],
    },
    scrollTrack: {
      key: ASSET_KEYS.pf2eElfScrollTrack,
      columns: [14, undefined, 14],
      rows: [92, undefined, 92],
    },
    scrollThumb: {
      key: ASSET_KEYS.pf2eElfScrollThumb,
      columns: [20, undefined, 20],
      rows: [56, undefined, 56],
      stretchMode: {
        edge: 'scale',
        internal: 'scale',
      },
    },
    gridCell: {
      key: ASSET_KEYS.pf2eElfGridCell,
      columns: [84, undefined, 84],
      rows: [48, undefined, 48],
    },
    dialog: {
      key: ASSET_KEYS.pf2eElfDialog,
      columns: [96, undefined, 96],
      rows: [96, undefined, 96],
    },
    button: {
      key: ASSET_KEYS.pf2eElfButton,
      columns: [84, undefined, 84],
      rows: [44, undefined, 44],
    },
  } satisfies Record<PF2eNinePatchVariant, PF2eNinePatchThemeStyle>,
  ninePatchStretchMode: {
    edge: 'scale',
    internal: 'repeat',
  },
  visualStates: {
    idle: { tint: 0xffffff, alpha: 1 },
    hover: { tint: 0xdfffea, alpha: 1 },
    pressed: { tint: 0xa7c4b2, alpha: 0.96 },
    focused: { tint: 0xc8f3dc, alpha: 1 },
    selected: { tint: 0x8ed8b1, alpha: 1 },
    disabled: { tint: 0x67716a, alpha: 0.62 },
  } satisfies Record<PF2eNinePatchVisualState, { readonly tint: number; readonly alpha: number }>,
  label: {
    heading: {
      backgroundVariant: 'control',
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: 44,
      fontStyle: 'bold',
      textColor: '#f7e9bd',
      strokeColor: '#26170d',
      strokeThickness: 2,
      minHeight: 86,
      paddingX: 42,
      paddingY: 18,
    },
    section: {
      backgroundVariant: 'control',
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: 26,
      fontStyle: 'bold',
      textColor: '#e9dfbd',
      strokeColor: '#26170d',
      strokeThickness: 1,
      minHeight: 62,
      paddingX: 34,
      paddingY: 14,
    },
    status: {
      backgroundVariant: 'control',
      fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
      fontSize: 17,
      fontStyle: 'bold',
      textColor: '#bce8d0',
      strokeColor: '#14241c',
      strokeThickness: 1,
      minHeight: 54,
      paddingX: 26,
      paddingY: 12,
    },
    tab: {
      backgroundVariant: 'tab',
      fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
      fontSize: 17,
      fontStyle: 'bold',
      textColor: '#d9f4e5',
      strokeColor: '#14241c',
      strokeThickness: 1,
      minHeight: 70,
      paddingX: 28,
      paddingY: 14,
    },
    primary: {
      backgroundVariant: 'button',
      fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
      fontSize: 17,
      fontStyle: 'bold',
      textColor: '#f7e9bd',
      strokeColor: '#26170d',
      strokeThickness: 1,
      minHeight: 58,
      paddingX: 28,
      paddingY: 14,
    },
    danger: {
      backgroundVariant: 'button',
      fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
      fontSize: 17,
      fontStyle: 'bold',
      textColor: '#f0aaa0',
      strokeColor: '#2a110f',
      strokeThickness: 1,
      minHeight: 58,
      paddingX: 28,
      paddingY: 14,
    },
  } satisfies Record<PF2eNineLabelVariant, PF2eNineLabelThemeStyle>,
} as const;
