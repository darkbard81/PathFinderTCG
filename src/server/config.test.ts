import { describe, expect, it } from 'vitest';

import { loadServerConfig } from './config.js';

describe('server config', () => {
  it('uses the approved development bind, port, database, and Origin defaults', () => {
    const config = loadServerConfig({
      NODE_ENV: 'development',
    });

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3011);
    expect(config.databasePath).toMatch(/data\/pathfinder-tcg\.sqlite$/);
    expect(config.allowedOrigins).toEqual([
      'http://127.0.0.1:3010',
      'http://localhost:3010',
      'http://mcp.krdp.ddns.net:3010',
      'https://mcp.krdp.ddns.net',
    ]);
    expect(config.secureCookies).toBe(false);
  });

  it('requires explicit production bind, port, and Origins and enables secure cookies', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
      }),
    ).toThrow(/HOST/);

    const config = loadServerConfig({
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '4011',
      DATABASE_PATH: 'tmp/production.sqlite',
      ALLOWED_ORIGINS: 'https://game.example.test',
    });

    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 4011,
      allowedOrigins: ['https://game.example.test'],
      secureCookies: true,
    });
  });

  it('rejects invalid ports and Origins with paths', () => {
    expect(() => loadServerConfig({ PORT: '0' })).toThrow(/PORT/);
    expect(() =>
      loadServerConfig({
        ALLOWED_ORIGINS: 'http://localhost:3010/api',
      }),
    ).toThrow(/Origin/);
  });
});
