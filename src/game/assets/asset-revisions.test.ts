import {
  appendAssetRevision,
  findAssetRevision,
  forgetAssetRevisions,
  rememberAssetRevisions,
  resolveAssetUrl,
} from './asset-revisions';
import type { AssetsManifest } from './manifest';

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

afterEach(() => {
  forgetAssetRevisions();
});

describe('rememberAssetRevisions', () => {
  it('세 종류의 자산을 한 표로 모은다', () => {
    rememberAssetRevisions(
      createManifest({
        textures: [{ key: 'cards.a', path: 'cards/webp/a.webp', revision: 'tex' }],
        videos: [{ key: 'motion.a', path: 'motion/a.webm', revision: 'vid' }],
        audio: [{ key: 'sound.a', path: 'sound/bgm/a.webm', revision: 'aud' }],
      }),
    );

    expect(findAssetRevision('cards/webp/a.webp')).toBe('tex');
    expect(findAssetRevision('motion/a.webm')).toBe('vid');
    expect(findAssetRevision('sound/bgm/a.webm')).toBe('aud');
  });

  it('앞쪽 슬래시가 있든 없든 같은 자산으로 찾는다', () => {
    rememberAssetRevisions(
      createManifest({ textures: [{ key: 'ui.title', path: '/ui/title.webp', revision: 'a' }] }),
    );

    expect(findAssetRevision('ui/title.webp')).toBe('a');
    expect(findAssetRevision('/ui/title.webp')).toBe('a');
  });

  it('다시 부르면 이전 표를 덮는다', () => {
    rememberAssetRevisions(
      createManifest({ textures: [{ key: 'ui.title', path: 'ui/title.webp', revision: 'a' }] }),
    );
    rememberAssetRevisions(
      createManifest({ textures: [{ key: 'ui.title', path: 'ui/title.webp', revision: 'b' }] }),
    );

    expect(findAssetRevision('ui/title.webp')).toBe('b');
  });
});

describe('appendAssetRevision', () => {
  it('revision이 없으면 URL을 그대로 둔다', () => {
    expect(appendAssetRevision('/tcg/ui/title.webp', undefined)).toBe('/tcg/ui/title.webp');
    expect(appendAssetRevision('/tcg/ui/title.webp', '')).toBe('/tcg/ui/title.webp');
  });

  it('이미 질의가 있으면 뒤에 이어 붙인다', () => {
    expect(appendAssetRevision('/tcg/ui/title.webp?t=1', 'abc')).toBe('/tcg/ui/title.webp?t=1&v=abc');
  });

  it('revision을 URL에 안전한 형태로 넣는다', () => {
    expect(appendAssetRevision('/tcg/a.webp', 'a b&c')).toBe('/tcg/a.webp?v=a%20b%26c');
  });
});

describe('resolveAssetUrl', () => {
  it('manifest에 있는 자산은 revision까지 붙인다', () => {
    rememberAssetRevisions(
      createManifest({
        textures: [{ key: 'cards.a', path: 'cards/webp/a.webp', revision: 'abc123' }],
      }),
    );

    expect(resolveAssetUrl('/tcg', 'cards/webp/a.webp')).toBe('/tcg/cards/webp/a.webp?v=abc123');
  });

  it('manifest에 없는 자산은 경로만 합친다', () => {
    expect(resolveAssetUrl('/tcg', 'cards/webp/unknown.webp')).toBe(
      '/tcg/cards/webp/unknown.webp',
    );
  });

  it('base URL의 뒤쪽 슬래시를 정리한다', () => {
    expect(resolveAssetUrl('/tcg/', 'cards/webp/a.webp')).toBe('/tcg/cards/webp/a.webp');
  });
});
