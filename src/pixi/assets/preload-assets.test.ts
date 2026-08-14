import type { AssetsManifest } from '../../game/assets/manifest';
import { selectPreloadAssets } from './preload-assets';

function createManifest(overrides: Partial<AssetsManifest> = {}): AssetsManifest {
  return {
    assetBaseUrl: '/tcg',
    textures: [],
    videos: [],
    audio: [],
    manifestRevision: 'rev',
    schemaVersion: 3,
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
      { alias: 'ui.title', src: '/tcg/ui/title.webp?v=a', kind: 'texture' },
      { alias: 'motion.attack', src: '/tcg/motion/attack/card.webm?v=c', kind: 'video' },
    ]);
  });

  it('카드 그림은 확장자가 맞아도 제외한다', () => {
    const manifest = createManifest({
      textures: [
        { key: 'cards.art', path: 'cards/webp/card.webp', revision: 'a' },
        { key: 'cards.badge', path: 'cards/badge/cost.webp', revision: 'b' },
      ],
    });

    // 카드 그림은 DOM <img>가 그린다. Pixi에 올려 두면 아무도 안 쓰는 텍스처만 남는다.
    expect(selectPreloadAssets(manifest)).toEqual([
      { alias: 'cards.badge', src: '/tcg/cards/badge/cost.webp?v=b', kind: 'texture' },
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

    expect(selectPreloadAssets(manifest)[0]?.src).toBe('/static/tcg/ui/title.webp?v=a');
  });

  it('대상이 없으면 빈 목록을 반환한다', () => {
    expect(selectPreloadAssets(createManifest())).toEqual([]);
  });

  it('소리는 확장자가 webm이어도 프리로드하지 않는다', () => {
    const manifest = createManifest({
      audio: [
        { key: 'sound.bgm.intro', path: 'sound/bgm/intro.webm', revision: 'a' },
        { key: 'sound.voice.title-intro', path: 'sound/voice/title-intro.webm', revision: 'b' },
      ],
    });

    // BGM은 흘려 받고 SFX는 필요할 때 디코드한다. 부팅에 25MB를 딸려 보내면 안 된다.
    expect(selectPreloadAssets(manifest)).toEqual([]);
  });
});
