import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTH_SESSION_IDLE_MS,
  AuthService,
  AuthServiceError,
  MAX_ACTIVE_AUTH_IDS,
} from './auth-service';

const PASSWORD = 'password-123';

describe('auth service', () => {
  it('stores a salted hash, treats ids case-insensitively, and rotates the latest login', async () => {
    const dataRoot = await createTempDataRoot();
    const migrationTargets: string[] = [];
    let now = Date.parse('2026-07-14T00:00:00.000Z');
    const service = new AuthService({
      dataRoot,
      now: () => now,
      startCleanupTimer: false,
      migrateFirstAccount: async (target) => {
        migrationTargets.push(target);
      },
    });

    const registered = await service.register({ id: 'User_One', password: PASSWORD });
    expect(registered.session.id).toBe('User_One');
    expect(migrationTargets).toEqual([
      path.join(dataRoot, 'users', registered.accountId, 'save-slots'),
    ]);

    const storedText = await fs.readFile(path.join(dataRoot, 'auth', 'accounts.json'), 'utf8');
    const stored = JSON.parse(storedText) as {
      schemaVersion: number;
      accounts: Array<{ password: Record<string, unknown>; loginHistory: string[] }>;
    };
    expect(stored.schemaVersion).toBe(2);
    expect(storedText).not.toContain(PASSWORD);
    expect(stored.accounts[0]?.loginHistory).toEqual([]);
    expect(stored.accounts[0]?.password).toMatchObject({
      algorithm: 'scrypt',
      N: 2 ** 15,
      r: 8,
      p: 3,
    });

    await expect(service.register({ id: 'user_one', password: PASSWORD })).rejects.toMatchObject({
      code: 'ID_TAKEN',
      statusCode: 409,
    });
    await expect(
      service.login({ id: 'USER_ONE', password: 'incorrect-password' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
    expect(
      JSON.parse(await fs.readFile(path.join(dataRoot, 'auth', 'accounts.json'), 'utf8')),
    ).toMatchObject({ accounts: [{ loginHistory: [] }] });

    now += 60_000;
    const loggedIn = await service.login({ id: 'USER_ONE', password: PASSWORD });
    expect(loggedIn.session.id).toBe('User_One');
    expect(service.authenticate(registered.token)).toBeNull();
    expect(service.authenticate(loggedIn.token)?.accountId).toBe(registered.accountId);
    expect(
      JSON.parse(await fs.readFile(path.join(dataRoot, 'auth', 'accounts.json'), 'utf8')),
    ).toMatchObject({ accounts: [{ loginHistory: ['2026-07-14T00:01:00.000Z'] }] });

    now += 60_000;
    const restarted = new AuthService({ dataRoot, now: () => now, startCleanupTimer: false });
    expect(restarted.authenticate(loggedIn.token)).toBeNull();
    await expect(restarted.login({ id: 'user_one', password: PASSWORD })).resolves.toMatchObject({
      accountId: registered.accountId,
    });
    expect(
      JSON.parse(await fs.readFile(path.join(dataRoot, 'auth', 'accounts.json'), 'utf8')),
    ).toMatchObject({
      accounts: [
        {
          loginHistory: ['2026-07-14T00:01:00.000Z', '2026-07-14T00:02:00.000Z'],
        },
      ],
    });
  });

  it('migrates schema version one accounts when recording the next login', async () => {
    const dataRoot = await createTempDataRoot();
    const service = new AuthService({ dataRoot, startCleanupTimer: false });
    const registered = await service.register({ id: 'legacy_user', password: PASSWORD });
    service.dispose();

    const accountsPath = path.join(dataRoot, 'auth', 'accounts.json');
    const currentStore = JSON.parse(await fs.readFile(accountsPath, 'utf8')) as {
      accounts: Array<Record<string, unknown>>;
    };
    await fs.writeFile(
      accountsPath,
      `${JSON.stringify({
        schemaVersion: 1,
        accounts: currentStore.accounts.map((account) => {
          const legacyAccount = { ...account };
          delete legacyAccount.loginHistory;
          return legacyAccount;
        }),
      })}\n`,
      'utf8',
    );

    const now = Date.parse('2026-07-14T01:00:00.000Z');
    const restarted = new AuthService({
      dataRoot,
      now: () => now,
      startCleanupTimer: false,
    });
    await expect(restarted.login({ id: 'legacy_user', password: PASSWORD })).resolves.toMatchObject(
      {
        accountId: registered.accountId,
      },
    );

    expect(JSON.parse(await fs.readFile(accountsPath, 'utf8'))).toMatchObject({
      schemaVersion: 2,
      accounts: [{ loginHistory: ['2026-07-14T01:00:00.000Z'] }],
    });
  });

  it('uses a 15 minute sliding expiry and removes idle sessions', async () => {
    const dataRoot = await createTempDataRoot();
    let now = Date.parse('2026-07-14T00:00:00.000Z');
    const service = new AuthService({
      dataRoot,
      now: () => now,
      startCleanupTimer: false,
    });
    const issued = await service.register({ id: 'idle_user', password: PASSWORD });

    now += 10 * 60 * 1000;
    const touched = service.authenticate(issued.token);
    expect(touched?.session.expiresAt).toBe(new Date(now + AUTH_SESSION_IDLE_MS).toISOString());

    now += 14 * 60 * 1000;
    expect(service.authenticate(issued.token, false)).not.toBeNull();
    now += 2 * 60 * 1000;
    expect(service.authenticate(issued.token, false)).toBeNull();
    expect(service.getActiveSessionCount()).toBe(0);
  });

  it('limits active ids to ten without preventing inactive accounts from existing', async () => {
    const dataRoot = await createTempDataRoot();
    let now = Date.parse('2026-07-14T00:00:00.000Z');
    const service = new AuthService({
      dataRoot,
      now: () => now,
      startCleanupTimer: false,
    });

    for (let index = 1; index <= MAX_ACTIVE_AUTH_IDS + 1; index += 1) {
      const issued = await service.register({ id: `user_${index}`, password: PASSWORD });
      service.logout(issued.token);
    }

    const active = [];
    for (let index = 1; index <= MAX_ACTIVE_AUTH_IDS; index += 1) {
      active.push(await service.login({ id: `user_${index}`, password: PASSWORD }));
    }
    expect(service.getActiveSessionCount()).toBe(MAX_ACTIVE_AUTH_IDS);

    await expect(
      service.login({ id: `user_${MAX_ACTIVE_AUTH_IDS + 1}`, password: PASSWORD }),
    ).rejects.toMatchObject({
      code: 'ACTIVE_ID_LIMIT',
      statusCode: 429,
    });
    await expect(
      service.register({ id: `user_${MAX_ACTIVE_AUTH_IDS + 2}`, password: PASSWORD }),
    ).rejects.toMatchObject({
      code: 'ACTIVE_ID_LIMIT',
      statusCode: 429,
    });

    const replacement = await service.login({ id: 'USER_1', password: PASSWORD });
    expect(service.authenticate(active[0]!.token)).toBeNull();
    expect(service.authenticate(replacement.token)).not.toBeNull();
    expect(service.getActiveSessionCount()).toBe(MAX_ACTIVE_AUTH_IDS);

    now += AUTH_SESSION_IDLE_MS;
    expect(service.getActiveSessionCount()).toBe(0);
    await expect(
      service.login({ id: `user_${MAX_ACTIVE_AUTH_IDS + 1}`, password: PASSWORD }),
    ).resolves.toMatchObject({ loginId: `user_${MAX_ACTIVE_AUTH_IDS + 1}` });

    const accountStore = JSON.parse(
      await fs.readFile(path.join(dataRoot, 'auth', 'accounts.json'), 'utf8'),
    ) as { accounts: unknown[] };
    expect(accountStore.accounts).toHaveLength(MAX_ACTIVE_AUTH_IDS + 1);
  }, 40_000);

  it('rolls back the first account when legacy migration fails', async () => {
    const dataRoot = await createTempDataRoot();
    const service = new AuthService({
      dataRoot,
      startCleanupTimer: false,
      migrateFirstAccount: async () => {
        throw new Error('legacy migration failed');
      },
    });

    await expect(service.register({ id: 'first_user', password: PASSWORD })).rejects.toThrow(
      'legacy migration failed',
    );
    await expect(fs.stat(path.join(dataRoot, 'auth', 'accounts.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(service.getActiveSessionCount()).toBe(0);
  });

  it('rejects ids and passwords outside the selected input rules', async () => {
    const service = new AuthService({
      dataRoot: await createTempDataRoot(),
      startCleanupTimer: false,
    });

    await expect(service.register({ id: 'abc', password: PASSWORD })).rejects.toBeInstanceOf(
      AuthServiceError,
    );
    await expect(service.register({ id: 'valid_id', password: 'short' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});

async function createTempDataRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'elven-auth-'));
}
