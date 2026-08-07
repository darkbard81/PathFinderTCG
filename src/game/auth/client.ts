import type {
  AuthCredentials,
  AuthErrorCode,
  AuthErrorResponse,
  AuthSessionInfo,
  AuthSessionResponse,
} from './types';

const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/** API client가 주입받는 fetch 호환 요청 함수다. */
export type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type AuthSessionControllerOptions = {
  fetcher?: ApiFetch;
  onExpired: (message: string) => void;
  heartbeatIntervalMs?: number;
};

/** 인증 API가 반환한 사용자 처리 가능한 오류를 표현한다. */
export class AuthApiError extends Error {
  readonly code: AuthErrorCode | null;
  readonly statusCode: number;

  constructor(message: string, statusCode: number, code: AuthErrorCode | null = null) {
    super(message);
    this.name = 'AuthApiError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** 브라우저 인증 상태, 보호 요청과 heartbeat lifecycle을 관리한다. */
export class AuthSessionController {
  private readonly fetcher: ApiFetch;
  private readonly onExpired: (message: string) => void;
  private readonly heartbeatIntervalMs: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatInFlight = false;
  private session: AuthSessionInfo | null = null;
  private readonly visibilityHandler = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && this.session) {
      void this.sendHeartbeat();
    }
  };

  constructor(options: AuthSessionControllerOptions) {
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.onExpired = options.onExpired;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  /** 현재 메모리에 유지 중인 인증 세션 요약을 반환한다. */
  get current(): AuthSessionInfo | null {
    return this.session;
  }

  /** 브라우저 쿠키의 기존 세션을 복원하며 미인증 상태는 오류 없이 null로 처리한다. */
  async restore(): Promise<AuthSessionInfo | null> {
    const response = await this.fetcher('/api/auth/session', {
      method: 'GET',
      credentials: 'same-origin',
    });
    if (response.status === 401) {
      this.clearSession();
      return null;
    }
    const session = await readSessionResponse(response);
    this.acceptSession(session);
    return session;
  }

  /** ID와 비밀번호로 로그인하고 heartbeat를 시작한다. */
  async login(credentials: AuthCredentials): Promise<AuthSessionInfo> {
    return this.submitCredentials('/api/auth/login', credentials);
  }

  /** ID와 비밀번호로 가입하고 발급된 세션의 heartbeat를 시작한다. */
  async register(credentials: AuthCredentials): Promise<AuthSessionInfo> {
    return this.submitCredentials('/api/auth/register', credentials);
  }

  /** 서버 세션과 로컬 heartbeat를 함께 종료한다. */
  async logout(): Promise<void> {
    const response = await this.fetcher('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw await createApiError(response);
    }
    this.clearSession();
  }

  /** 보호 API 요청을 보내고 401 응답을 전체 게임의 세션 만료로 전달한다. */
  async request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await this.fetcher(input, {
      ...init,
      credentials: init?.credentials ?? 'same-origin',
    });
    if (response.status === 401) {
      this.expireSession('세션이 만료되었습니다. 다시 로그인해 주세요.');
    }
    return response;
  }

  /** document 이벤트와 timer를 해제한다. */
  destroy(): void {
    this.clearSession();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  private async submitCredentials(
    path: '/api/auth/login' | '/api/auth/register',
    credentials: AuthCredentials,
  ): Promise<AuthSessionInfo> {
    const response = await this.fetcher(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const session = await readSessionResponse(response);
    this.acceptSession(session);
    return session;
  }

  private acceptSession(session: AuthSessionInfo): void {
    this.session = session;
    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        void this.sendHeartbeat();
      }, this.heartbeatIntervalMs);
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.session || this.heartbeatInFlight) {
      return;
    }
    this.heartbeatInFlight = true;
    try {
      const response = await this.fetcher('/api/auth/heartbeat', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (response.status === 401) {
        this.expireSession('세션이 만료되었습니다. 다시 로그인해 주세요.');
        return;
      }
      if (response.ok) {
        this.session = await readSessionResponse(response);
      }
    } catch {
      // 네트워크 단절은 다음 heartbeat에서 재시도하고 서버의 401만 만료로 확정한다.
    } finally {
      this.heartbeatInFlight = false;
    }
  }

  private expireSession(message: string): void {
    if (!this.session) {
      return;
    }
    this.clearSession();
    this.onExpired(message);
  }

  private clearSession(): void {
    this.session = null;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

async function readSessionResponse(response: Response): Promise<AuthSessionInfo> {
  if (!response.ok) {
    throw await createApiError(response);
  }
  const value = (await response.json()) as unknown;
  if (!isAuthSessionResponse(value)) {
    throw new AuthApiError('인증 서버 응답 형식이 올바르지 않습니다.', response.status);
  }
  return value.session;
}

async function createApiError(response: Response): Promise<AuthApiError> {
  let value: unknown;
  try {
    value = (await response.json()) as unknown;
  } catch {
    return new AuthApiError(`인증 요청에 실패했습니다. (${response.status})`, response.status);
  }
  if (isAuthErrorResponse(value)) {
    return new AuthApiError(value.error.message, response.status, value.error.code);
  }
  return new AuthApiError(`인증 요청에 실패했습니다. (${response.status})`, response.status);
}

function isAuthSessionResponse(value: unknown): value is AuthSessionResponse {
  return (
    isRecord(value) &&
    isRecord(value.session) &&
    typeof value.session.id === 'string' &&
    typeof value.session.expiresAt === 'string'
  );
}

function isAuthErrorResponse(value: unknown): value is AuthErrorResponse {
  return (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
