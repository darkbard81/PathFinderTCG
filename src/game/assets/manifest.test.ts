import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  joinAssetUrl,
  loadAssetsManifest,
  normalizeAssetBaseUrl,
  normalizeAssetsManifest,
  resetAssetsManifestCache,
} from './manifest';

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
    expect(normalized.audio).toEqual([]);
  });

  it('audio가 있는 manifest는 그대로 둔다', () => {
    const audio = [{ key: 'sound.bgm.intro', path: 'sound/bgm/intro.webm', revision: 'a' }];

    expect(
      normalizeAssetsManifest({
        assetBaseUrl: '/tcg',
        textures: [],
        videos: [],
        audio,
        manifestRevision: 'rev',
        schemaVersion: 3,
        revisionAlgorithm: 'sha256-12hex',
      }).audio,
    ).toEqual(audio);
  });
});

describe('loadAssetsManifest', () => {
  beforeEach(() => {
    resetAssetsManifestCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAssetsManifestCache();
  });

  function stubFetch(responses: Array<() => Promise<Response>>): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(() => {
      const next = responses.shift();
      if (!next) {
        throw new Error('unexpected fetch');
      }
      return next();
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function okResponse(manifestRevision: string): () => Promise<Response> {
    return () =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            assetBaseUrl: '/tcg',
            textures: [],
            manifestRevision,
            schemaVersion: 3,
            revisionAlgorithm: 'sha256-12hex',
          }),
      } as unknown as Response);
  }

  it('같은 base URL의 manifest는 한 번만 받는다', async () => {
    const fetchMock = stubFetch([okResponse('first'), okResponse('second')]);

    const first = await loadAssetsManifest('/tcg');
    const second = await loadAssetsManifest('/tcg');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(second).toBe(first);
    expect(second.manifestRevision).toBe('first');
  });

  it('동시 요청도 한 번의 왕복으로 합친다', async () => {
    const fetchMock = stubFetch([okResponse('only')]);

    const [first, second] = await Promise.all([
      loadAssetsManifest('/tcg'),
      loadAssetsManifest('/tcg'),
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(second).toBe(first);
  });

  it('실패는 굳히지 않아 다시 시도하면 새로 받는다', async () => {
    const fetchMock = stubFetch([
      () => Promise.reject(new Error('network down')),
      okResponse('recovered'),
    ]);

    await expect(loadAssetsManifest('/tcg')).rejects.toThrow('network down');
    await expect(loadAssetsManifest('/tcg')).resolves.toMatchObject({
      manifestRevision: 'recovered',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('base URL이 다르면 따로 받는다', async () => {
    const fetchMock = stubFetch([okResponse('a'), okResponse('b')]);

    await loadAssetsManifest('/tcg');
    await loadAssetsManifest('/other');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
