import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetsManifest } from '../../game/assets/manifest';
import { resetAssetsManifestCache } from '../../game/assets/manifest';
import {
  loadStageAdvBundle,
  resetStageAdvBundleRegistry,
  selectStageAdvBundleAssets,
  unloadStageAdvBundle,
} from './adv-assets';

const addBundle = vi.fn();
const loadBundle = vi.fn();
const unloadBundle = vi.fn((bundleId: string) => Promise.resolve(bundleId));

vi.mock('pixi.js', () => ({
  Assets: {
    addBundle: (bundleId: string, assets: unknown) => addBundle(bundleId, assets),
    loadBundle: (bundleId: string) => loadBundle(bundleId),
    unloadBundle: (bundleId: string) => unloadBundle(bundleId),
  },
}));

function createManifest(): AssetsManifest {
  return {
    assetBaseUrl: '/tcg',
    textures: [
      {
        key: 'adv.level01.start.cutscene',
        path: 'adv/level01/start/cutscene.webp',
        revision: 'start-rev',
      },
      {
        key: 'adv.level01.end.cutscene',
        path: 'adv/level01/end/cutscene.webp',
        revision: 'end-rev',
      },
      {
        key: 'adv.level01.shared.ujjuring-standing',
        path: 'adv/level01/shared/ujjuring-standing.webp',
        revision: 'shared-rev',
      },
      {
        key: 'adv.level02.start.cutscene',
        path: 'adv/level02/start/cutscene.webp',
        revision: 'other-rev',
      },
      { key: 'ui.title', path: 'ui/title.webp', revision: 'ui-rev' },
    ],
    videos: [],
    audio: [],
    manifestRevision: 'manifest-rev',
    schemaVersion: 3,
    revisionAlgorithm: 'sha256-12hex',
  };
}

describe('selectStageAdvBundleAssets', () => {
  it('Start에는 같은 Stage의 start와 shared만 넣는다', () => {
    expect(selectStageAdvBundleAssets(createManifest(), 'level01', 'start')).toEqual([
      {
        alias: 'adv.level01.start.cutscene',
        src: '/tcg/adv/level01/start/cutscene.webp?v=start-rev',
      },
      {
        alias: 'adv.level01.shared.ujjuring-standing',
        src: '/tcg/adv/level01/shared/ujjuring-standing.webp?v=shared-rev',
      },
    ]);
  });

  it('End에는 같은 Stage의 end와 shared만 넣는다', () => {
    expect(selectStageAdvBundleAssets(createManifest(), 'level01', 'end')).toEqual([
      {
        alias: 'adv.level01.end.cutscene',
        src: '/tcg/adv/level01/end/cutscene.webp?v=end-rev',
      },
      {
        alias: 'adv.level01.shared.ujjuring-standing',
        src: '/tcg/adv/level01/shared/ujjuring-standing.webp?v=shared-rev',
      },
    ]);
  });
});

describe('loadStageAdvBundle', () => {
  beforeEach(() => {
    resetAssetsManifestCache();
    resetStageAdvBundleRegistry();
    addBundle.mockClear();
    loadBundle.mockClear();
    unloadBundle.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(createManifest()) } as Response),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAssetsManifestCache();
    resetStageAdvBundleRegistry();
  });

  it('컷씬만 텍스처로 올리고 face와 스탠딩은 URL로만 돌려준다', async () => {
    loadBundle.mockResolvedValueOnce({
      'stage-adv-level01-start-manifest-rev::adv.level01.start.cutscene': 'cutscene-texture',
    });

    const bundle = await loadStageAdvBundle('/tcg', 'level01', 'start', [
      'adv.level01.start.cutscene',
    ]);

    // GPU에는 컷씬 하나만 올라간다. 스탠딩은 아무도 그리지 않는 텍스처가 되지 않는다.
    expect(addBundle.mock.calls[0]?.[1]).toEqual([
      {
        alias: 'stage-adv-level01-start-manifest-rev::adv.level01.start.cutscene',
        src: '/tcg/adv/level01/start/cutscene.webp?v=start-rev',
      },
    ]);
    expect(bundle.resources).toEqual({ 'adv.level01.start.cutscene': 'cutscene-texture' });
    expect(bundle.urls.get('adv.level01.shared.ujjuring-standing')).toBe(
      '/tcg/adv/level01/shared/ujjuring-standing.webp?v=shared-rev',
    );
  });

  it('start와 end가 같은 shared 키를 써도 alias를 다시 등록하지 않는다', async () => {
    loadBundle.mockResolvedValue({});

    await loadStageAdvBundle('/tcg', 'level01', 'start', ['adv.level01.shared.ujjuring-standing']);
    await loadStageAdvBundle('/tcg', 'level01', 'end', ['adv.level01.shared.ujjuring-standing']);

    const aliases = addBundle.mock.calls.flatMap((call) =>
      (call[1] as Array<{ alias: string }>).map((asset) => asset.alias),
    );
    expect(addBundle).toHaveBeenCalledTimes(2);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it('manifest는 ADV마다 다시 받지 않는다', async () => {
    loadBundle.mockResolvedValue({});

    await loadStageAdvBundle('/tcg', 'level01', 'start', ['adv.level01.start.cutscene']);
    await loadStageAdvBundle('/tcg', 'level01', 'end', ['adv.level01.end.cutscene']);

    expect(fetch).toHaveBeenCalledOnce();
  });

  it('등록한 적 없는 번들은 해제하지 않는다', async () => {
    const bundle = await loadStageAdvBundle('/tcg', 'level01', 'start', []);

    expect(addBundle).not.toHaveBeenCalled();
    expect(bundle.resources).toEqual({});

    await unloadStageAdvBundle(bundle.bundleId);
    expect(unloadBundle).not.toHaveBeenCalled();
  });
});
