import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthApiError, AuthSessionController } from './client';

afterEach(() => {
  vi.useRealTimers();
});

describe('auth session controller', () => {
  it('treats initial 401 as signed out and expires an established session on protected 401', async () => {
    const onExpired = vi.fn();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(401, { error: { code: 'NO_SESSION', message: 'login' } }))
      .mockResolvedValueOnce(
        response(200, {
          session: { id: 'client_user', expiresAt: '2026-07-14T00:15:00.000Z' },
        }),
      )
      .mockResolvedValueOnce(
        response(401, { error: { code: 'SESSION_EXPIRED', message: 'expired' } }),
      );
    const controller = new AuthSessionController({ fetcher, onExpired });

    await expect(controller.restore()).resolves.toBeNull();
    expect(onExpired).not.toHaveBeenCalled();

    await expect(
      controller.login({ id: 'client_user', password: 'password-123' }),
    ).resolves.toMatchObject({ id: 'client_user' });
    expect(controller.current?.id).toBe('client_user');

    await controller.request('/api/save-slots');
    expect(onExpired).toHaveBeenCalledWith('세션이 만료되었습니다. 다시 로그인해 주세요.');
    expect(controller.current).toBeNull();
    controller.destroy();
  });

  it('retries transient heartbeat failures and refreshes the session on the next interval', async () => {
    vi.useFakeTimers();
    const onExpired = vi.fn();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response(200, {
          session: { id: 'heartbeat_user', expiresAt: '2026-07-14T00:15:00.000Z' },
        }),
      )
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        response(200, {
          session: { id: 'heartbeat_user', expiresAt: '2026-07-14T00:17:00.000Z' },
        }),
      )
      .mockResolvedValueOnce(response(204, null));
    const controller = new AuthSessionController({
      fetcher,
      onExpired,
      heartbeatIntervalMs: 1000,
    });

    await controller.login({ id: 'heartbeat_user', password: 'password-123' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.current?.expiresAt).toBe('2026-07-14T00:15:00.000Z');
    expect(onExpired).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.current?.expiresAt).toBe('2026-07-14T00:17:00.000Z');
    await controller.logout();
    expect(controller.current).toBeNull();
    controller.destroy();
  });

  it('surfaces structured authentication failures', async () => {
    const controller = new AuthSessionController({
      fetcher: vi.fn(async () =>
        response(429, {
          error: { code: 'ACTIVE_ID_LIMIT', message: '현재 활성 사용자 수가 최대 10명입니다.' },
        }),
      ),
      onExpired: vi.fn(),
    });

    await expect(
      controller.register({ id: 'eleventh_user', password: 'password-123' }),
    ).rejects.toMatchObject({
      code: 'ACTIVE_ID_LIMIT',
      statusCode: 429,
    } satisfies Partial<AuthApiError>);
    controller.destroy();
  });
});

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
