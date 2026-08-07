import type { AssetsManifest } from '../../game/assets/manifest';
import { selectPreloadAssets } from './preload-assets';

function createManifest(overrides: Partial<AssetsManifest> = {}): AssetsManifest {
  return {
    assetBaseUrl: '/tcg',
    textures: [],
    videos: [],
    manifestRevision: 'rev',
    schemaVersion: 2,
    revisionAlgorithm: 'sha1',
    ...overrides,
  };
}

describe('selectPreloadAssets', () => {
  it('webp 텍스처와 webm 비디오만 고르고 png는 제외한다', () => {
    const manifest = createManifest({
      textures: [
        { key: 'ui.title', path: 'ui/title.webp', revision: 'a' },
        { key: 'cards.art', path: 'cards/arts/card.png', revision: 'b' },
      ],
      videos: [
        { key: 'motion.attack', path: 'motion/attack/card.webm', revision: 'c' },
        { key: 'motion.legacy', path: 'motion/legacy/card.mp4', revision: 'd' },
      ],
    });

    expect(selectPreloadAssets(manifest)).toEqual([
      { alias: 'ui.title', src: '/tcg/ui/title.webp', kind: 'texture' },
      { alias: 'motion.attack', src: '/tcg/motion/attack/card.webm', kind: 'video' },
    ]);
  });

  it('대문자 확장자도 동일하게 인식한다', () => {
    const manifest = createManifest({
      textures: [{ key: 'ui.title', path: 'ui/TITLE.WEBP', revision: 'a' }],
    });

    expect(selectPreloadAssets(manifest)).toHaveLength(1);
  });

  it('manifest의 assetBaseUrl을 기준으로 URL을 만든다', () => {
    const manifest = createManifest({
      assetBaseUrl: 'static/tcg/',
      textures: [{ key: 'ui.title', path: '/ui/title.webp', revision: 'a' }],
    });

    expect(selectPreloadAssets(manifest)[0]?.src).toBe('/static/tcg/ui/title.webp');
  });

  it('대상이 없으면 빈 목록을 반환한다', () => {
    expect(selectPreloadAssets(createManifest())).toEqual([]);
  });
});
