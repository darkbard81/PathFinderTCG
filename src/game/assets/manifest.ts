import {
  CARD_ART_ASSET_DEFINITIONS,
  CARD_FRAME_ASSET_KEYS,
  CARD_FRAME_ASSET_PATHS,
  CARD_FRAME_VARIANTS,
} from './cardAssets.js';
import { BATTLE_SFX_ASSET_DEFINITIONS } from './battleSfxAssets.js';

export type AssetType = 'image' | 'audio' | 'json';

interface AssetEntryBase {
  readonly key: string;
  readonly type: AssetType;
}

export interface ImageAssetEntry extends AssetEntryBase {
  readonly type: 'image';
  readonly path: string;
}

export interface AudioAssetEntry extends AssetEntryBase {
  readonly type: 'audio';
  readonly paths: readonly string[];
}

export interface JsonAssetEntry extends AssetEntryBase {
  readonly type: 'json';
  readonly path: string;
}

export type AssetEntry = ImageAssetEntry | AudioAssetEntry | JsonAssetEntry;

export const ASSET_KEYS = {
  pf2eElfBadge: 'ui.pf2e.elf.badge',
  pf2eElfBadgeCost: 'ui.pf2e.elf.badge.cost',
  pf2eElfBadgeAttack: 'ui.pf2e.elf.badge.attack',
  pf2eElfBadgeHealth: 'ui.pf2e.elf.badge.health',
  pf2eElfBadgeDefense: 'ui.pf2e.elf.badge.defense',
} as const;

/**
 * Runtime asset paths are declared once and referenced by stable keys.
 * Add project assets here as game content is introduced.
 */
export const assetManifest: readonly AssetEntry[] = [
  {
    key: ASSET_KEYS.pf2eElfBadge,
    type: 'image',
    path: '/assets/ui/pf2e-elf-badge.png',
  },
  {
    key: ASSET_KEYS.pf2eElfBadgeCost,
    type: 'image',
    path: '/assets/ui/pf2e-elf-badge-cost.png',
  },
  {
    key: ASSET_KEYS.pf2eElfBadgeAttack,
    type: 'image',
    path: '/assets/ui/pf2e-elf-badge-attack.png',
  },
  {
    key: ASSET_KEYS.pf2eElfBadgeHealth,
    type: 'image',
    path: '/assets/ui/pf2e-elf-badge-health.png',
  },
  {
    key: ASSET_KEYS.pf2eElfBadgeDefense,
    type: 'image',
    path: '/assets/ui/pf2e-elf-badge-defense.png',
  },
  ...CARD_FRAME_VARIANTS.map((variant) => ({
    key: CARD_FRAME_ASSET_KEYS[variant],
    type: 'image' as const,
    path: CARD_FRAME_ASSET_PATHS[variant],
  })),
  ...CARD_ART_ASSET_DEFINITIONS.map(({ key, path }) => ({
    key,
    type: 'image' as const,
    path,
  })),
  ...BATTLE_SFX_ASSET_DEFINITIONS.map(({ key, paths }) => ({
    key,
    type: 'audio' as const,
    paths,
  })),
];
