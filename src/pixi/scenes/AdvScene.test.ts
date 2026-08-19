import { Texture } from 'pixi.js';
import type { AdvView, AdvViewModel } from '../../dom/screens/adv-view';
import type { StageAdvDefinition } from '../../game/stage/types';
import type { LoadedStageAdvBundle } from '../assets/adv-assets';
import { AdvScene, type StageAdvAssetLoader } from './AdvScene';

const definition: StageAdvDefinition = {
  beats: [
    {
      speaker: '우쭈링',
      text: '첫 대사',
      faceAssetKey: 'adv.level01.shared.ujjuring-face-taunt',
      cutsceneAssetKey: 'adv.level01.start.cutscene',
      standings: [{ assetKey: 'adv.level01.shared.ujjuring-standing', position: 'center' }],
    },
    { speaker: null, text: '같은 화면의 대사', faceAssetKey: null },
    {
      speaker: null,
      text: '바뀐 화면의 마지막 대사',
      faceAssetKey: null,
      cutsceneAssetKey: 'adv.level01.start.cutscene-next',
      standings: [],
    },
  ],
};

// 컷씬만 Sprite가 되므로 텍스처로 올라오고, 나머지는 DOM이 쓸 URL로만 온다.
const CUTSCENE_KEYS = [
  definition.beats[0].cutsceneAssetKey!,
  definition.beats[2]!.cutsceneAssetKey!,
] as const;

const URL_KEYS = [
  ...CUTSCENE_KEYS,
  definition.beats[0].standings![0]!.assetKey,
  definition.beats[0].faceAssetKey!,
] as const;

function createBundle(): LoadedStageAdvBundle {
  return {
    bundleId: 'adv-bundle',
    resources: {
      [CUTSCENE_KEYS[0]]: Texture.WHITE,
      [CUTSCENE_KEYS[1]]: Texture.EMPTY,
    },
    urls: new Map(URL_KEYS.map((key) => [key, `/tcg/${key}.webp?v=rev`])),
  };
}

function createView(): AdvView & { render: ReturnType<typeof vi.fn> } {
  return {
    element: {} as HTMLElement,
    render: vi.fn(),
  };
}

type AdvSceneHarness = Pick<AdvScene, 'enter' | 'exit' | 'view'> & {
  next: () => void;
  skip: () => void;
  retry: () => void;
};

function createHarness(overrides: Partial<StageAdvAssetLoader> = {}) {
  const view = createView();
  const onComplete = vi.fn();
  const assets: StageAdvAssetLoader = {
    load: vi.fn(() => Promise.resolve(createBundle())),
    unload: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  const scene = new AdvScene({
    assetBaseUrl: '/tcg',
    stageId: 'level01',
    phase: 'start',
    definition,
    onComplete,
    view,
    assets,
  }) as unknown as AdvSceneHarness;

  return { scene, view, onComplete, assets };
}

function lastModel(view: ReturnType<typeof createView>): AdvViewModel {
  const model = view.render.mock.calls.at(-1)?.[0] as AdvViewModel | undefined;
  if (!model) {
    throw new Error('ADV view was not rendered');
  }
  return model;
}

describe('AdvScene', () => {
  it('생략된 visual은 유지하고 변경된 컷씬과 스탠딩만 적용한다', async () => {
    const { scene, view, onComplete } = createHarness();

    scene.enter();
    await vi.waitFor(() => expect(lastModel(view).state).toBe('ready'));

    expect(lastModel(view)).toMatchObject({
      speaker: '우쭈링',
      text: '첫 대사',
      progressText: '1 / 3',
      faceImageUrl: '/tcg/adv.level01.shared.ujjuring-face-taunt.webp?v=rev',
      standings: [
        {
          position: 'center',
          imageUrl: '/tcg/adv.level01.shared.ujjuring-standing.webp?v=rev',
        },
      ],
    });
    const cutscene = scene.view.children[0];

    scene.next();
    expect(lastModel(view)).toMatchObject({
      speaker: null,
      text: '같은 화면의 대사',
      progressText: '2 / 3',
      standings: [
        {
          position: 'center',
          imageUrl: '/tcg/adv.level01.shared.ujjuring-standing.webp?v=rev',
        },
      ],
    });
    expect(scene.view.children[0]).toBe(cutscene);
    expect(cutscene).toHaveProperty('texture', Texture.WHITE);

    scene.next();
    expect(lastModel(view)).toMatchObject({
      text: '바뀐 화면의 마지막 대사',
      progressText: '3 / 3',
      standings: [],
    });
    expect(scene.view.children[0]).toBe(cutscene);
    expect(cutscene).toHaveProperty('texture', Texture.EMPTY);
    expect(onComplete).not.toHaveBeenCalled();

    scene.next();
    scene.next();
    scene.skip();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('로딩 중 건너뛰어도 완료 콜백은 한 번만 실행하고 늦은 번들을 해제한다', async () => {
    let resolveLoad: ((bundle: LoadedStageAdvBundle) => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<LoadedStageAdvBundle>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const { scene, onComplete, assets } = createHarness({ load });

    scene.enter();
    scene.skip();
    scene.skip();
    expect(onComplete).toHaveBeenCalledOnce();

    resolveLoad?.(createBundle());
    await vi.waitFor(() => expect(assets.unload).toHaveBeenCalledWith('adv-bundle'));
    expect(scene.view.children).toHaveLength(0);
  });

  it('로드 실패를 오류 상태로 보이고 다시 시도하면 첫 beat로 복구한다', async () => {
    const load = vi
      .fn<StageAdvAssetLoader['load']>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(createBundle());
    const { scene, view } = createHarness({ load });

    scene.enter();
    await vi.waitFor(() => expect(lastModel(view).state).toBe('error'));
    expect(lastModel(view).errorMessage).toBe('network down');

    scene.retry();
    await vi.waitFor(() => expect(lastModel(view).state).toBe('ready'));
    expect(load).toHaveBeenCalledTimes(2);
    expect(lastModel(view).text).toBe('첫 대사');
  });

  it('필수 자산이 번들에 없으면 오류 상태로 두고 번들을 해제한다', async () => {
    const bundle = createBundle();
    (bundle.urls as Map<string, string>).delete(definition.beats[0].standings![0]!.assetKey);
    const { scene, view, assets } = createHarness({
      load: vi.fn(() => Promise.resolve(bundle)),
    });

    scene.enter();
    await vi.waitFor(() => expect(lastModel(view).state).toBe('error'));

    expect(lastModel(view).errorMessage).toContain('Missing ADV asset');
    expect(assets.unload).toHaveBeenCalledWith('adv-bundle');
  });

  it('후속 beat가 나중에 쓸 컷씬도 진입할 때 미리 검증한다', async () => {
    const bundle = createBundle();
    delete bundle.resources[definition.beats[2]!.cutsceneAssetKey!];
    const { scene, view, assets } = createHarness({
      load: vi.fn(() => Promise.resolve(bundle)),
    });

    scene.enter();
    await vi.waitFor(() => expect(lastModel(view).state).toBe('error'));

    expect(lastModel(view).errorMessage).toContain('adv.level01.start.cutscene-next');
    expect(assets.unload).toHaveBeenCalledWith('adv-bundle');
  });

  it('DOM이 그리는 face와 스탠딩은 빼고 컷씬 키만 텍스처로 요청한다', async () => {
    const load = vi.fn<StageAdvAssetLoader['load']>(() => Promise.resolve(createBundle()));
    const { scene, view } = createHarness({ load });

    scene.enter();
    await vi.waitFor(() => expect(lastModel(view).state).toBe('ready'));

    expect(load).toHaveBeenCalledWith('/tcg', 'level01', 'start', [...CUTSCENE_KEYS]);
  });

  it('퇴장 중 번들 해제가 실패해도 던지지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { scene, view } = createHarness({
      unload: vi.fn(() => Promise.reject(new Error('unload failed'))),
    });

    scene.enter();
    await vi.waitFor(() => expect(lastModel(view).state).toBe('ready'));

    // 여기서 던지면 라우터가 다음 씬을 붙이지 못하고 빈 화면에 갇힌다.
    await expect(scene.exit()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('퇴장할 때 컷씬 Sprite를 먼저 파괴한 뒤 번들을 해제한다', async () => {
    const events: string[] = [];
    const { scene, view, assets } = createHarness({
      unload: vi.fn(() => {
        events.push(`unload:${scene.view.children.length}`);
        return Promise.resolve();
      }),
    });

    scene.enter();
    await vi.waitFor(() => expect(lastModel(view).state).toBe('ready'));
    const cutscene = scene.view.children[0];

    await scene.exit();

    expect(cutscene?.destroyed).toBe(true);
    expect(events).toEqual(['unload:0']);
    expect(assets.unload).toHaveBeenCalledOnce();
  });
});
