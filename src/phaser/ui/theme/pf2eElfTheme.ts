import { ASSET_KEYS } from '../../../game/assets/manifest';

export type PF2eNinePatchVariant = 'panel' | 'control';
export type PF2eNinePatchVisualState = 'idle' | 'hover' | 'pressed' | 'disabled';
export type PF2eNineLabelVariant = 'heading' | 'section' | 'status' | 'primary' | 'danger';

export interface PF2eNinePatchThemeStyle {
  readonly key: string;
  readonly columns: readonly [number, undefined, number];
  readonly rows: readonly [number, undefined, number];
}

export interface PF2eNineLabelThemeStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontStyle: 'normal' | 'bold';
  readonly textColor: string;
  readonly strokeColor: string;
  readonly strokeThickness: number;
  readonly height: number;
  readonly paddingX: number;
  readonly paddingY: number;
}

export const PF2E_ELF_THEME = {
  colors: {
    backdrop: 0x06110d,
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
  ninePatch: {
    panel: {
      key: ASSET_KEYS.pf2eElfPanel,
      columns: [72, undefined, 72],
      rows: [72, undefined, 72],
    },
    control: {
      key: ASSET_KEYS.pf2eElfControl,
      columns: [48, undefined, 48],
      rows: [24, undefined, 24],
    },
  } satisfies Record<PF2eNinePatchVariant, PF2eNinePatchThemeStyle>,
  visualStates: {
    idle: { tint: 0xffffff, alpha: 1 },
    hover: { tint: 0xdfffea, alpha: 1 },
    pressed: { tint: 0xa7c4b2, alpha: 0.96 },
    disabled: { tint: 0x67716a, alpha: 0.62 },
  } satisfies Record<PF2eNinePatchVisualState, { readonly tint: number; readonly alpha: number }>,
  label: {
    heading: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: 44,
      fontStyle: 'bold',
      textColor: '#f7e9bd',
      strokeColor: '#26170d',
      strokeThickness: 2,
      height: 86,
      paddingX: 42,
      paddingY: 18,
    },
    section: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: 26,
      fontStyle: 'bold',
      textColor: '#e9dfbd',
      strokeColor: '#26170d',
      strokeThickness: 1,
      height: 62,
      paddingX: 34,
      paddingY: 14,
    },
    status: {
      fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
      fontSize: 17,
      fontStyle: 'bold',
      textColor: '#bce8d0',
      strokeColor: '#14241c',
      strokeThickness: 1,
      height: 54,
      paddingX: 26,
      paddingY: 12,
    },
    primary: {
      fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
      fontSize: 17,
      fontStyle: 'bold',
      textColor: '#f7e9bd',
      strokeColor: '#26170d',
      strokeThickness: 1,
      height: 58,
      paddingX: 28,
      paddingY: 14,
    },
    danger: {
      fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
      fontSize: 17,
      fontStyle: 'bold',
      textColor: '#f0aaa0',
      strokeColor: '#2a110f',
      strokeThickness: 1,
      height: 58,
      paddingX: 28,
      paddingY: 14,
    },
  } satisfies Record<PF2eNineLabelVariant, PF2eNineLabelThemeStyle>,
} as const;
