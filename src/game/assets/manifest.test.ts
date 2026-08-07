import { describe, expect, it } from 'vitest';
import { joinAssetUrl, normalizeAssetBaseUrl, normalizeAssetsManifest } from './manifest';

describe('asset manifest helpers', () => {
  it('normalizes asset base urls', () => {
    expect(normalizeAssetBaseUrl('/tcg')).toBe('/tcg');
    expect(normalizeAssetBaseUrl('/tcg/')).toBe('/tcg');
    expect(normalizeAssetBaseUrl('tcg/')).toBe('/tcg');
    expect(normalizeAssetBaseUrl('/')).toBe('/');
  });

  it('joins asset urls without duplicating slashes', () => {
    expect(joinAssetUrl('/tcg', 'assets.json')).toBe('/tcg/assets.json');
    expect(joinAssetUrl('/tcg/', '/images/card.webp')).toBe('/tcg/images/card.webp');
    expect(joinAssetUrl('tcg', 'fonts/CookieRun.ttf')).toBe('/tcg/fonts/CookieRun.ttf');
    expect(joinAssetUrl('/tcg', 'motion/attack/fallback.webm')).toBe(
      '/tcg/motion/attack/fallback.webm',
    );
  });

  it('normalizes legacy manifests without videos to an empty video list', () => {
    const normalized = normalizeAssetsManifest({
      assetBaseUrl: '/tcg',
      textures: [],
      manifestRevision: 'legacy',
      schemaVersion: 1,
      revisionAlgorithm: 'sha256-12hex',
    });

    expect(normalized.videos).toEqual([]);
  });
});
