export type AssetType = 'image' | 'audio' | 'json';

export interface AssetEntry {
  readonly key: string;
  readonly type: AssetType;
  readonly path: string;
}

export const ASSET_KEYS = {
  pf2eElfPanel: 'ui.pf2e.elf.panel',
  pf2eElfControl: 'ui.pf2e.elf.control',
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
];
