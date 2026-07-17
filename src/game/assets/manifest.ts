export type AssetType = 'image' | 'audio' | 'json';

export interface AssetEntry {
  readonly key: string;
  readonly type: AssetType;
  readonly path: string;
}

export const ASSET_KEYS = {
  pf2eElfPanel: 'ui.pf2e.elf.panel',
  pf2eElfControl: 'ui.pf2e.elf.control',
  pf2eElfTab: 'ui.pf2e.elf.tab',
  pf2eElfScrollTrack: 'ui.pf2e.elf.scrollTrack',
  pf2eElfScrollThumb: 'ui.pf2e.elf.scrollThumb',
  pf2eElfGridCell: 'ui.pf2e.elf.gridCell',
  pf2eElfDialog: 'ui.pf2e.elf.dialog',
  pf2eElfBadge: 'ui.pf2e.elf.badge',
  pf2eElfButton: 'ui.pf2e.elf.button',
} as const;

/**
 * Runtime asset paths are declared once and referenced by stable keys.
 * Add project assets here as game content is introduced.
 */
export const assetManifest: readonly AssetEntry[] = [
  {
    key: ASSET_KEYS.pf2eElfPanel,
    type: 'image',
    path: '/assets/ui/pf2e-elf-panel-ninepatch.png',
  },
  {
    key: ASSET_KEYS.pf2eElfControl,
    type: 'image',
    path: '/assets/ui/pf2e-elf-control-ninepatch.png',
  },
  {
    key: ASSET_KEYS.pf2eElfTab,
    type: 'image',
    path: '/assets/ui/pf2e-elf-tab-ninepatch.png',
  },
  {
    key: ASSET_KEYS.pf2eElfScrollTrack,
    type: 'image',
    path: '/assets/ui/pf2e-elf-scroll-track-ninepatch.png',
  },
  {
    key: ASSET_KEYS.pf2eElfScrollThumb,
    type: 'image',
    path: '/assets/ui/pf2e-elf-scroll-thumb-ninepatch.png',
  },
  {
    key: ASSET_KEYS.pf2eElfGridCell,
    type: 'image',
    path: '/assets/ui/pf2e-elf-grid-cell-ninepatch.png',
  },
  {
    key: ASSET_KEYS.pf2eElfDialog,
    type: 'image',
    path: '/assets/ui/pf2e-elf-dialog-ninepatch.png',
  },
  {
    key: ASSET_KEYS.pf2eElfBadge,
    type: 'image',
    path: '/assets/ui/pf2e-elf-badge.png',
  },
  {
    key: ASSET_KEYS.pf2eElfButton,
    type: 'image',
    path: '/assets/ui/pf2e-elf-button-ninepatch.png',
  },
];
