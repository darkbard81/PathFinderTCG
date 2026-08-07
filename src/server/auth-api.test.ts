import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { AUTH_SESSION_COOKIE_NAME, createAuthApiHandler } from './auth-api';
import { AuthService } from './auth-service';

function createRequest(options: {
  method: string;
  url: string;
  body?: string;
  cookie?: string;
  forwardedProto?: string;
}): IncomingMessage {
  const request = Readable.from(options.body ? [options.body] : []) as IncomingMessage;
  request.method = options.method;
  request.url = options.url;
  request.headers = {};
  if (options.cookie) {
    request.headers.cookie = options.cookie;
  }
  if (options.forwardedProto) {
    request.headers['x-forwarded-proto'] = options.forwardedProto;
  }
  return request;
}

function createResponse(): {
  response: ServerResponse;
  statusCode(): number;
  header(name: string): string | undefined;
  json(): unknown;
} {
  const headers = new Map<string, string>();
  const chunks: string[] = [];
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value));
      return this;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    end(chunk?: unknown) {
      if (chunk != null) {
        chunks.push(String(chunk));
      }
      return this;
    },
  } as unknown as ServerResponse;
  return {
    response,
    statusCode: () => response.statusCode,
    header: (name) => headers.get(name.toLowerCase()),
    json: () => JSON.parse(chunks.join('') || 'null') as unknown,
  };
}

describe('auth api', () => {
  it('registers, restores, refreshes, and logs out an HttpOnly cookie session', async () => {
    const service = new AuthService({
      dataRoot: await fs.mkdtemp(path.join(os.tmpdir(), 'auth-api-')),
      startCleanupTimer: false,
    });
    const handler = createAuthApiHandler(service);
    const registerResponse = createResponse();
    await handler(
      createRequest({
        method: 'POST',
        url: '/api/auth/register',
        body: JSON.stringify({ id: 'api_user', password: 'password-123' }),
      }),
      registerResponse.response,
    );

    expect(registerResponse.statusCode()).toBe(201);
    expect(registerResponse.json()).toMatchObject({
      session: { id: 'api_user', expiresAt: expect.any(String) },
    });
    const setCookie = registerResponse.header('set-cookie')!;
    expect(setCookie).toContain(`${AUTH_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Max-Age=900');
    expect(setCookie).not.toContain('Secure');
    const cookie = setCookie.split(';')[0]!;

    const sessionResponse = createResponse();
    await handler(
      createRequest({ method: 'GET', url: '/api/auth/session', cookie }),
      sessionResponse.response,
    );
    expect(sessionResponse.statusCode()).toBe(200);
    expect(sessionResponse.json()).toMatchObject({ session: { id: 'api_user' } });
    expect(sessionResponse.header('set-cookie')).toContain('Max-Age=900');

    const heartbeatResponse = createResponse();
    await handler(
      createRequest({ method: 'POST', url: '/api/auth/heartbeat', cookie }),
      heartbeatResponse.response,
    );
    expect(heartbeatResponse.statusCode()).toBe(200);

    const logoutResponse = createResponse();
    await handler(
      createRequest({ method: 'POST', url: '/api/auth/logout', cookie }),
      logoutResponse.response,
    );
    expect(logoutResponse.statusCode()).toBe(204);
    expect(logoutResponse.header('set-cookie')).toContain('Max-Age=0');

    const expiredResponse = createResponse();
    await handler(
      createRequest({ method: 'GET', url: '/api/auth/session', cookie }),
      expiredResponse.response,
    );
    expect(expiredResponse.statusCode()).toBe(401);
    expect(expiredResponse.json()).toMatchObject({ error: { code: 'SESSION_EXPIRED' } });
  });

  it('adds Secure behind HTTPS and reports missing sessions as structured errors', async () => {
    const service = new AuthService({
      dataRoot: await fs.mkdtemp(path.join(os.tmpdir(), 'auth-api-')),
      startCleanupTimer: false,
    });
    const handler = createAuthApiHandler(service);

    const registerResponse = createResponse();
    await handler(
      createRequest({
        method: 'POST',
        url: '/api/auth/register',
        forwardedProto: 'https',
        body: JSON.stringify({ id: 'secure_user', password: 'password-123' }),
      }),
      registerResponse.response,
    );
    expect(registerResponse.header('set-cookie')).toContain('Secure');

    const missingResponse = createResponse();
    await handler(
      createRequest({ method: 'GET', url: '/api/auth/session' }),
      missingResponse.response,
    );
    expect(missingResponse.statusCode()).toBe(401);
    expect(missingResponse.json()).toEqual({
      error: { code: 'NO_SESSION', message: '로그인이 필요합니다.' },
    });
  });
});
