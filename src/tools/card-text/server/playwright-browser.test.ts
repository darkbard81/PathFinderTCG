import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolveCaptureBrowserExecutablePath } from './playwright-browser';

const ROOT_EXECUTABLE = path.join(
  '/root',
  '.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
);
const ACCOUNT_EXECUTABLE = path.join(
  '/home/deck',
  '.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
);

describe('Card Text Tool Playwright browser path', () => {
  it('uses the Playwright default when its executable exists', async () => {
    const canAccess = vi.fn(async () => true);

    await expect(
      resolveCaptureBrowserExecutablePath(ROOT_EXECUTABLE, {
        configuredHome: '/root',
        accountHome: '/home/deck',
        canAccess,
      }),
    ).resolves.toBeUndefined();
    expect(canAccess).toHaveBeenCalledOnce();
  });

  it('falls back to the operating-system account home when HOME is incorrect', async () => {
    const canAccess = vi.fn(async (targetPath: string) => targetPath === ACCOUNT_EXECUTABLE);

    await expect(
      resolveCaptureBrowserExecutablePath(ROOT_EXECUTABLE, {
        configuredHome: '/root',
        accountHome: '/home/deck',
        canAccess,
      }),
    ).resolves.toBe(ACCOUNT_EXECUTABLE);
  });

  it('does not remap an executable outside the configured home', async () => {
    const canAccess = vi.fn(async () => false);

    await expect(
      resolveCaptureBrowserExecutablePath('/opt/chromium/chrome', {
        configuredHome: '/root',
        accountHome: '/home/deck',
        canAccess,
      }),
    ).resolves.toBeUndefined();
  });
});
