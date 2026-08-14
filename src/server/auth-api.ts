import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  AuthCredentials,
  AuthErrorCode,
  AuthErrorResponse,
  AuthSessionResponse,
} from '../game/auth/types';
import { AUTH_SESSION_IDLE_MS, AuthServiceError, type AuthenticatedAccount } from './auth-service';
import type { AuthService } from './auth-service';

export const AUTH_SESSION_COOKIE_NAME = 'pathfinder_tcg_session';

/** `/api/auth/...`의 가입, 로그인, 확인, heartbeat, 로그아웃 요청을 처리한다. */
export function createAuthApiHandler(
  authService: AuthService,
): (request: IncomingMessage, response: ServerResponse) => Promise<boolean> {
  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/auth')) {
      return false;
    }

    try {
      if (request.method === 'POST' && url.pathname === '/api/auth/register') {
        const issued = await authService.register(await readCredentials(request));
        setSessionCookie(request, response, issued.token);
        sendJson(response, { session: issued.session } satisfies AuthSessionResponse, 201);
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        const issued = await authService.login(await readCredentials(request));
        setSessionCookie(request, response, issued.token);
        sendJson(response, { session: issued.session } satisfies AuthSessionResponse);
        return true;
      }

      if (request.method === 'GET' && url.pathname === '/api/auth/session') {
        const account = authenticateHttpRequest(authService, request, response);
        if (account) {
          sendJson(response, { session: account.session } satisfies AuthSessionResponse);
        }
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/heartbeat') {
        const account = authenticateHttpRequest(authService, request, response);
        if (account) {
          sendJson(response, { session: account.session } satisfies AuthSessionResponse);
        }
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
        authService.logout(readSessionToken(request));
        clearSessionCookie(request, response);
        response.statusCode = 204;
        response.end();
        return true;
      }

      response.statusCode = 404;
      response.end('Not found');
      return true;
    } catch (error) {
      if (error instanceof AuthServiceError) {
        sendAuthError(response, error.code, error.message, error.statusCode);
        return true;
      }
      if (error instanceof SyntaxError) {
        sendAuthError(response, 'INVALID_INPUT', '요청 JSON이 올바르지 않습니다.', 400);
        return true;
      }
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
      return true;
    }
  };
}

/** 보호 API가 사용할 쿠키 세션을 확인하고 성공 시 만료 시각을 연장한다. */
export function authenticateHttpRequest(
  authService: AuthService,
  request: IncomingMessage,
  response: ServerResponse,
): AuthenticatedAccount | null {
  const token = readSessionToken(request);
  if (!token) {
    clearSessionCookie(request, response);
    sendAuthError(response, 'NO_SESSION', '로그인이 필요합니다.', 401);
    return null;
  }

  const account = authService.authenticate(token);
  if (!account) {
    clearSessionCookie(request, response);
    sendAuthError(response, 'SESSION_EXPIRED', '세션이 만료되었습니다.', 401);
    return null;
  }

  setSessionCookie(request, response, token);
  return account;
}

/**
 * 쿠키 세션이 살아 있는지만 본다. 응답을 건드리지 않고 만료도 늘리지 않는다.
 *
 * 자산 요청처럼 한 화면에 수십 번 오는 경로가 쓴다. 그때마다 쿠키를 다시 굽거나
 * 세션을 연장할 이유가 없고, 오래 캐시되는 응답에 Set-Cookie가 섞이면 안 된다.
 * 세션 연장은 게임 API와 heartbeat가 이미 맡고 있다.
 */
export function hasActiveSession(authService: AuthService, request: IncomingMessage): boolean {
  const token = readSessionToken(request);
  return token !== null && authService.authenticate(token, false) !== null;
}

async function readCredentials(request: IncomingMessage): Promise<AuthCredentials> {
  const body = await readRequestJson(request);
  if (!isRecord(body) || typeof body.id !== 'string' || typeof body.password !== 'string') {
    throw new AuthServiceError('INVALID_INPUT', 'ID와 비밀번호를 문자열로 입력해 주세요.', 400);
  }
  return { id: body.id, password: body.password };
}

async function readRequestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of request) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    byteLength += buffer.length;
    if (byteLength > 8 * 1024) {
      throw new AuthServiceError('INVALID_INPUT', '인증 요청이 너무 큽니다.', 400);
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw.length > 0 ? JSON.parse(raw) : null;
}

function readSessionToken(request: IncomingMessage): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const name = item.slice(0, separator).trim();
    if (name === AUTH_SESSION_COOKIE_NAME) {
      return item.slice(separator + 1).trim() || null;
    }
  }
  return null;
}

function setSessionCookie(request: IncomingMessage, response: ServerResponse, token: string): void {
  const attributes = [
    `${AUTH_SESSION_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${Math.floor(AUTH_SESSION_IDLE_MS / 1000)}`,
  ];
  if (isSecureRequest(request)) {
    attributes.push('Secure');
  }
  response.setHeader('Set-Cookie', attributes.join('; '));
}

function clearSessionCookie(request: IncomingMessage, response: ServerResponse): void {
  const attributes = [
    `${AUTH_SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0',
  ];
  if (isSecureRequest(request)) {
    attributes.push('Secure');
  }
  response.setHeader('Set-Cookie', attributes.join('; '));
}

function isSecureRequest(request: IncomingMessage): boolean {
  const forwardedProto = request.headers['x-forwarded-proto'];
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const socket = request.socket;
  return (
    protocol?.split(',')[0]?.trim().toLowerCase() === 'https' ||
    (socket != null && 'encrypted' in socket && socket.encrypted === true)
  );
}

function sendAuthError(
  response: ServerResponse,
  code: AuthErrorCode,
  message: string,
  statusCode: number,
): void {
  sendJson(
    response,
    {
      error: { code, message },
    } satisfies AuthErrorResponse,
    statusCode,
  );
}

function sendJson(response: ServerResponse, body: unknown, statusCode = 200): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
