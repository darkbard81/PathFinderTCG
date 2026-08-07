import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Browser } from 'playwright';

type BrowserPathOptions = {
  configuredHome?: string;
  accountHome?: string;
  canAccess?: (targetPath: string) => Promise<boolean>;
};

/** Card Text Tool 캡처에 사용할 Chromium을 실행한다. */
export async function launchCaptureBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright');
  const executablePath = await resolveCaptureBrowserExecutablePath(chromium.executablePath());
  const accountHome = os.userInfo().homedir;

  return chromium.launch({
    headless: true,
    ...(executablePath
      ? {
          executablePath,
          env: { ...process.env, HOME: accountHome },
        }
      : {}),
  });
}

/** HOME과 실제 계정 홈이 다를 때 설치된 Playwright 실행 파일 경로를 보정한다. */
export async function resolveCaptureBrowserExecutablePath(
  defaultExecutablePath: string,
  options: BrowserPathOptions = {},
): Promise<string | undefined> {
  const canAccess = options.canAccess ?? isAccessible;
  if (await canAccess(defaultExecutablePath)) {
    return undefined;
  }

  const configuredHome = options.configuredHome ?? process.env.HOME;
  const accountHome = options.accountHome ?? os.userInfo().homedir;
  if (!configuredHome || configuredHome === accountHome) {
    return undefined;
  }

  const relativeExecutablePath = path.relative(configuredHome, defaultExecutablePath);
  if (
    relativeExecutablePath === '..' ||
    relativeExecutablePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeExecutablePath)
  ) {
    return undefined;
  }

  const accountExecutablePath = path.join(accountHome, relativeExecutablePath);
  return (await canAccess(accountExecutablePath)) ? accountExecutablePath : undefined;
}

async function isAccessible(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
