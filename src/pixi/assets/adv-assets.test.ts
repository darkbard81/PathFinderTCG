import type { AssetsManifest } from '../../game/assets/manifest';
import { selectStageAdvBundleAssets } from './adv-assets';

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
