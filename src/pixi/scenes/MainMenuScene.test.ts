import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CARD_TEXT_TOOL_ACCOUNT_ID,
  createDefaultLicenseLinks,
  formatMainMenuLoadSummary,
} from '../../dom/screens/main-menu-view';
import type { MainMenuView } from '../../dom/screens/main-menu-view';
import { MainMenuScene } from './MainMenuScene';

const logout = vi.fn<() => Promise<void>>();

function createMockView(): MainMenuView & {
  setStatus: ReturnType<typeof vi.fn>;
  setBusy: ReturnType<typeof vi.fn>;
  setLicenseOpen: ReturnType<typeof vi.fn>;
  isLicenseOpen: ReturnType<typeof vi.fn>;
} {
  return {
    element: {} as HTMLElement,
    setStatus: vi.fn(),
    setBusy: vi.fn(),
    setLicenseOpen: vi.fn(),
    isLicenseOpen: vi.fn(() => false),
  };
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
    expect(mockView.setBusy).toHaveBeenCalledWith(true);
    expect(mockView.setStatus).toHaveBeenCalledWith('Signing out...');
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
    expect(mockView.setBusy).toHaveBeenLastCalledWith(false);
    expect(mockView.setStatus).toHaveBeenLastCalledWith('network down', true);
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

  it('lists PixiJS instead of Phaser and rexUI in license links', () => {
    const labels = createDefaultLicenseLinks().map((link) => link.label);

    expect(labels).toContain('PixiJS License');
    expect(labels).not.toContain('Phaser License');
    expect(labels).not.toContain('rexUI License');
  });
});
