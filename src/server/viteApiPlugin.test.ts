import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

import { createPathfinderApiPlugin, isApiRequestUrl } from './viteApiPlugin.js';

const TEST_ORIGIN = 'http://127.0.0.1:3010';

describe('isApiRequestUrl', () => {
  it('matches only the API route boundary', () => {
    expect(isApiRequestUrl('/api')).toBe(true);
    expect(isApiRequestUrl('/api/auth/session')).toBe(true);
    expect(isApiRequestUrl('/api/auth/session?refresh=true')).toBe(true);
    expect(isApiRequestUrl('/apiary')).toBe(false);
    expect(isApiRequestUrl('/')).toBe(false);
    expect(isApiRequestUrl(undefined)).toBe(false);
  });
});

describe('createPathfinderApiPlugin', () => {
  let server: ViteDevServer | undefined;
  let temporaryDirectory: string | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;

    if (temporaryDirectory !== undefined) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = undefined;
    }
  });

  it('serves the frontend and API through one Vite HTTP listener', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'pathfinder-vite-api-'));
    const databasePath = join(temporaryDirectory, 'test.sqlite');

    server = await createServer({
      configFile: false,
      root: resolve('.'),
      logLevel: 'silent',
      plugins: [
        createPathfinderApiPlugin({
          environment: {
            NODE_ENV: 'development',
            DATABASE_PATH: databasePath,
            ALLOWED_ORIGINS: TEST_ORIGIN,
          },
          logger: false,
        }),
      ],
      server: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
      },
    });
    await server.listen();

    const address = server.httpServer?.address();
    if (address === null || address === undefined || typeof address === 'string') {
      throw new Error('Vite 테스트 서버의 TCP 주소를 확인할 수 없습니다.');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const pageResponse = await fetch(`${baseUrl}/`);
    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain('id="game-root"');

    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: TEST_ORIGIN,
      },
      body: JSON.stringify({
        username: 'single_port_user',
        password: 'correct horse battery staple',
      }),
    });
    expect(registerResponse.status).toBe(201);
    expect(registerResponse.headers.get('content-type')).toContain('application/json');
  });
});
