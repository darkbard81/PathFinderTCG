export type AssetType = 'image' | 'audio' | 'json';

export interface AssetEntry {
  readonly key: string;
  readonly type: AssetType;
  readonly path: string;
}

/**
 * Runtime asset paths are declared once and referenced by stable keys.
 * Add project assets here as game content is introduced.
 */
export const assetManifest: readonly AssetEntry[] = [];
