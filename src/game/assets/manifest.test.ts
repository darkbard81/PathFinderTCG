import { describe, expect, it } from 'vitest';

import { TEST_CARD_DESIGNS } from '../content/testCardPool.js';
import {
  CARD_ART_ASSET_DEFINITIONS,
  CARD_FRAME_ASSET_KEYS,
  CARD_FRAME_ASSET_PATHS,
  CARD_FRAME_VARIANTS,
  getCardFrameAssetKey,
} from './cardAssets.js';
import { assetManifest } from './manifest.js';

describe('Phase 4 card assets', () => {
  it('maps all 32 card definitions to their declared stable art keys', () => {
    expect(CARD_ART_ASSET_DEFINITIONS).toHaveLength(32);
    expect(new Set(CARD_ART_ASSET_DEFINITIONS.map(({ key }) => key)).size).toBe(32);
    expect(new Set(CARD_ART_ASSET_DEFINITIONS.map(({ path }) => path)).size).toBe(32);

    for (const design of TEST_CARD_DESIGNS) {
      const asset = CARD_ART_ASSET_DEFINITIONS.find(
        ({ cardDefinitionId }) => cardDefinitionId === design.definition.id,
      );

      expect(asset).toEqual({
        cardDefinitionId: design.definition.id,
        key: design.presentation.artAssetKey,
        path: `/assets/cards/art/${design.definition.id}.webp`,
      });
      expect(assetManifest).toContainEqual({
        key: design.presentation.artAssetKey,
        type: 'image',
        path: `/assets/cards/art/${design.definition.id}.webp`,
      });
    }
  });

  it('registers one transparent overlay key and path per rarity', () => {
    expect(CARD_FRAME_VARIANTS).toEqual(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']);

    for (const variant of CARD_FRAME_VARIANTS) {
      expect(getCardFrameAssetKey(variant)).toBe(CARD_FRAME_ASSET_KEYS[variant]);
      expect(assetManifest).toContainEqual({
        key: CARD_FRAME_ASSET_KEYS[variant],
        type: 'image',
        path: CARD_FRAME_ASSET_PATHS[variant],
      });
    }
  });

  it('keeps every manifest key and path unique', () => {
    const paths = assetManifest.flatMap((asset) =>
      asset.type === 'audio' ? asset.paths : [asset.path],
    );

    expect(new Set(assetManifest.map(({ key }) => key)).size).toBe(assetManifest.length);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
