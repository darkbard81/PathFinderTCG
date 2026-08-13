import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Texture } from 'pixi.js';
import type {
  LobbyCustomizationModel,
  LobbyView,
  LobbyViewOptions,
} from '../../dom/screens/lobby-view';
import { createInitialSaveState } from '../../game/save/create-initial-save';
import { createGameSession, type GameSession } from '../../game/save/session';
import type { SoundVolumeControl } from '../../game/sound/sound-player';
import { createDefaultVolumeState } from '../../game/sound/volume';
import { LobbyScene } from './LobbyScene';

type LobbyHarness = {
  saveName: (saveName: string) => Promise<void>;
  saveCustomization: (customization: LobbyCustomizationModel) => Promise<void>;
  buildViewOptions: () => LobbyViewOptions;
  replaceBackground: (backgroundId: string) => Promise<boolean>;
  loadAsset: () => Promise<Texture | null>;
  backgroundId: string | null;
};

function createMockView(): LobbyView & {
  setSaveName: ReturnType<typeof vi.fn>;
  setCustomization: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  setSettingsStatus: ReturnType<typeof vi.fn>;
  setCustomizationStatus: ReturnType<typeof vi.fn>;
  setBusy: ReturnType<typeof vi.fn>;
} {
  return {
    element: {} as HTMLElement,
    readStandingPlayback: () => null,
    setSaveName: vi.fn(),
    setCustomization: vi.fn(),
    setStatus: vi.fn(),
    setSettingsStatus: vi.fn(),
    setCustomizationStatus: vi.fn(),
    setPlayingBgmTrackId: vi.fn(),
    setBusy: vi.fn(),
  };
}

function createHarness(
  session: GameSession,
  options: { stubBackground?: boolean; volume?: SoundVolumeControl } = {},
) {
  const view = createMockView();
  const save = vi.fn(async (state) => state);
  const scene = new LobbyScene({
    services: {
      auth: { logout: vi.fn() } as never,
      saveSlots: { save } as never,
      battle: {} as never,
    },
    assetBaseUrl: '/tcg',
    session,
    onBack: vi.fn(),
    onPlay: vi.fn(),
    onDeck: vi.fn(),
    onEquipment: vi.fn(),
    onGrowth: vi.fn(),
    onLoggedOut: vi.fn(),
    ...(options.volume ? { volume: options.volume } : {}),
    view,
  }) as unknown as LobbyHarness;
  const replaceBackground = vi.fn(async () => true);
  if (options.stubBackground ?? true) {
    scene.replaceBackground = replaceBackground;
  }

  return { scene, view, save, replaceBackground };
}

describe('LobbyScene settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('저장 이름을 정규화해 저장하고 현재 세션과 헤더를 갱신한다', async () => {
    const session = createGameSession(await createInitialSaveState({ slotId: 1 }));
    const { scene, view, save } = createHarness(session);

    await scene.saveName('  두 번째 모험  ');

    expect(save).toHaveBeenCalledOnce();
    expect(session.saveName).toBe('두 번째 모험');
    expect(view.setSaveName).toHaveBeenLastCalledWith('두 번째 모험');
    expect(view.setSettingsStatus).toHaveBeenLastCalledWith('저장 이름을 바꿨습니다.');
    expect(view.setStatus).not.toHaveBeenCalled();
  });

  it('볼륨 상태는 Presenter가 읽고 DOM에는 값과 입력 콜백만 넘긴다', async () => {
    const session = createGameSession(await createInitialSaveState({ slotId: 1 }));
    const state = createDefaultVolumeState();
    state.bgm.level = 35;
    const volume: SoundVolumeControl = {
      getVolume: vi.fn(() => state),
      setVolume: vi.fn(),
    };
    const { scene } = createHarness(session, { volume });

    const viewOptions = scene.buildViewOptions();

    expect(viewOptions.volume?.state.bgm.level).toBe(35);
    viewOptions.volume?.onChange('bgm', { level: 20 });
    expect(volume.setVolume).toHaveBeenCalledWith('bgm', { level: 20 });
  });

  it('보유 배경과 standing 표시, 미디어 형식, 위치, 크기를 한 저장 상태로 반영한다', async () => {
    const session = createGameSession(await createInitialSaveState({ slotId: 1 }));
    const { scene, view, save, replaceBackground } = createHarness(session);
    const customization: LobbyCustomizationModel = {
      selectedBackgroundId: 'background_02',
      standingVisible: false,
      standingMediaType: 'image',
      standingPositionX: 68,
      standingPositionY: 18,
      standingScale: 125,
      bgmTrackIds: ['intro'],
      bgmPlayMode: 'shuffle',
    };

    await scene.saveCustomization(customization);

    expect(replaceBackground).toHaveBeenCalledWith('background_02');
    expect(save).toHaveBeenCalledOnce();
    expect(session.lobby).toMatchObject(customization);
    expect(view.setCustomization).toHaveBeenLastCalledWith(customization);
    expect(view.setCustomizationStatus).toHaveBeenLastCalledWith('로비 설정을 저장했습니다.');
    expect(view.setStatus).not.toHaveBeenCalled();
  });

  it('늦게 끝난 이전 배경 요청이 마지막 선택을 덮어쓰지 않는다', async () => {
    const session = createGameSession(await createInitialSaveState({ slotId: 1 }));
    const { scene } = createHarness(session, { stubBackground: false });
    let resolveFirst!: (texture: Texture) => void;
    let resolveSecond!: (texture: Texture) => void;
    scene.loadAsset = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Texture>((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => new Promise<Texture>((resolve) => (resolveSecond = resolve)));

    const first = scene.replaceBackground('background_01');
    const second = scene.replaceBackground('background_02');
    resolveSecond(Texture.EMPTY);
    await expect(second).resolves.toBe(true);
    resolveFirst(Texture.EMPTY);
    await expect(first).resolves.toBe(false);

    expect(scene.backgroundId).toBe('background_02');
  });
});
