import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CARD_TEXT_TOOL_ACCOUNT_ID,
  createDefaultLicenseLinks,
  formatMainMenuLoadSummary,
} from '../../dom/screens/main-menu-view';
import type { MainMenuView, MainMenuViewModel } from '../../dom/screens/main-menu-view';
import { MainMenuScene } from './MainMenuScene';

const logout = vi.fn<() => Promise<void>>();

function createMockView(): MainMenuView & { render: ReturnType<typeof vi.fn> } {
  return {
    element: {} as HTMLElement,
    render: vi.fn(),
  };
}

function lastModel(view: { render: ReturnType<typeof vi.fn> }): MainMenuViewModel {
  const call = view.render.mock.calls.at(-1);
  if (!call) {
    throw new Error('render was never called');
  }

  return call[0] as MainMenuViewModel;
}

type MainMenuSceneHarness = {
  isLoggingOut: boolean;
  logout: () => Promise<void>;
};

function createHarness(
  accountId: string,
  view = createMockView(),
): {
  scene: MainMenuSceneHarness;
  mockView: ReturnType<typeof createMockView>;
  onLoggedOut: ReturnType<typeof vi.fn>;
} {
  const onLoggedOut = vi.fn();
  const scene = new MainMenuScene({
    services: {
      auth: {
        current: { id: accountId, expiresAt: '2099-01-01T00:00:00.000Z' },
        logout,
      } as never,
      saveSlots: {} as never,
    },
    backgroundImageUrl: '/tcg/ui/title-screen.png',
    loadedCount: 10,
    failedCount: 0,
    onStartGame: vi.fn(),
    onLoggedOut,
    view,
  }) as unknown as MainMenuSceneHarness;

  return { scene, mockView: view, onLoggedOut };
}

describe('MainMenuScene', () => {
  beforeEach(() => {
    logout.mockReset();
    logout.mockResolvedValue();
  });

  it('logs out and hands control back to the title flow', async () => {
    const { scene, mockView, onLoggedOut } = createHarness('player');

    await scene.logout();

    expect(logout).toHaveBeenCalledOnce();
    expect(mockView.render).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Signing out...', busy: true, licenseOpen: false }),
    );
    expect(onLoggedOut).toHaveBeenCalledWith('You have been logged out.');
  });

  it('blocks a second logout while the first is still in flight', async () => {
    let resolveLogout: (() => void) | undefined;
    logout.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLogout = resolve;
        }),
    );
    const { scene } = createHarness('player');

    const first = scene.logout();
    const second = scene.logout();
    resolveLogout?.();
    await Promise.all([first, second]);

    expect(logout).toHaveBeenCalledOnce();
  });

  it('surfaces logout failures and unlocks the menu again', async () => {
    logout.mockRejectedValue(new Error('network down'));
    const { scene, mockView, onLoggedOut } = createHarness('player');

    await scene.logout();

    expect(onLoggedOut).not.toHaveBeenCalled();
    expect(scene.isLoggingOut).toBe(false);
    expect(lastModel(mockView)).toMatchObject({
      status: 'network down',
      statusIsError: true,
      busy: false,
    });
  });
});

describe('main menu helpers', () => {
  it('gates the card text tool account id like the original', () => {
    expect(CARD_TEXT_TOOL_ACCOUNT_ID).toBe('darkbard81');
  });

  it('formats load summaries like the original MainMenuScene', () => {
    expect(formatMainMenuLoadSummary(12, 0)).toBe('Loaded 12 assets');
    expect(formatMainMenuLoadSummary(12, 3)).toBe('Loaded 12 assets, skipped 3');
  });

  it('lists the licenses of what the game actually ships with', () => {
    const labels = createDefaultLicenseLinks().map((link) => link.label);

    // 렌더러와 런타임, 그리고 카드 규칙의 출처는 반드시 고지 대상이다.
    expect(labels).toEqual(
      expect.arrayContaining(['PixiJS License', 'Node.js License', 'ORC License']),
    );
  });

  it('gives every license link a purpose', () => {
    for (const link of createDefaultLicenseLinks()) {
      expect(link.purpose.length).toBeGreaterThan(0);
    }
  });
});
