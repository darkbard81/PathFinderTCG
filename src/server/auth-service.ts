import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AuthCredentials, AuthErrorCode, AuthSessionInfo } from '../game/auth/types';

export const AUTH_SESSION_IDLE_MS = 15 * 60 * 1000;
export const AUTH_SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;
export const MAX_ACTIVE_AUTH_IDS = 10;

const ACCOUNT_STORE_SCHEMA_VERSION = 2;
const LEGACY_ACCOUNT_STORE_SCHEMA_VERSION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
  N: 2 ** 15,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024,
} as const;

type PasswordHash = {
  algorithm: 'scrypt';
  salt: string;
  hash: string;
  keyLength: number;
  N: number;
  r: number;
  p: number;
};

type AccountRecord = {
  accountId: string;
  loginId: string;
  normalizedLoginId: string;
  password: PasswordHash;
  createdAt: string;
  loginHistory: string[];
};

type AccountStore = {
  schemaVersion: typeof ACCOUNT_STORE_SCHEMA_VERSION;
  accounts: AccountRecord[];
};

type AuthSessionRecord = {
  tokenDigest: string;
  accountId: string;
  loginId: string;
  lastSeenAt: number;
  expiresAt: number;
};

export type AuthenticatedAccount = {
  accountId: string;
  loginId: string;
  session: AuthSessionInfo;
};

export type IssuedAuthSession = AuthenticatedAccount & {
  token: string;
};

/** 인증 서비스의 영속 경로, 시계와 정리 lifecycle을 주입한다. */
export type AuthServiceOptions = {
  dataRoot: string;
  now?: () => number;
  cleanupIntervalMs?: number;
  startCleanupTimer?: boolean;
  migrateFirstAccount?: (targetSaveSlotsRoot: string) => Promise<void>;
};

/** 인증 요청에서 예측 가능한 HTTP 오류 코드와 상태를 전달한다. */
export class AuthServiceError extends Error {
  readonly code: AuthErrorCode;
  readonly statusCode: number;

  constructor(code: AuthErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = 'AuthServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** 계정 영속화와 서버 메모리 인증 세션을 소유한다. */
export class AuthService {
  private readonly dataRoot: string;
  private readonly accountsPath: string;
  private readonly usersRoot: string;
  private readonly now: () => number;
  private readonly migrateFirstAccount: (targetSaveSlotsRoot: string) => Promise<void>;
  private readonly sessionsByDigest = new Map<string, AuthSessionRecord>();
  private readonly sessionDigestByAccountId = new Map<string, string>();
  private readonly cleanupTimer: NodeJS.Timeout | null;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(options: AuthServiceOptions) {
    this.dataRoot = options.dataRoot;
    this.accountsPath = path.join(this.dataRoot, 'auth', 'accounts.json');
    this.usersRoot = path.join(this.dataRoot, 'users');
    this.now = options.now ?? Date.now;
    this.migrateFirstAccount = options.migrateFirstAccount ?? (async () => undefined);

    if (options.startCleanupTimer === false) {
      this.cleanupTimer = null;
    } else {
      this.cleanupTimer = setInterval(
        () => this.cleanupExpiredSessions(),
        options.cleanupIntervalMs ?? AUTH_SESSION_CLEANUP_INTERVAL_MS,
      );
      this.cleanupTimer.unref();
    }
  }

  /** ID와 비밀번호만으로 계정을 만들고 즉시 인증 세션을 발급한다. */
  async register(credentials: AuthCredentials): Promise<IssuedAuthSession> {
    const parsed = validateCredentials(credentials);
    return this.runExclusive(async () => {
      this.cleanupExpiredSessions();
      const store = await this.readAccountStore();
      if (
        store.accounts.some((account) => account.normalizedLoginId === parsed.normalizedLoginId)
      ) {
        throw new AuthServiceError('ID_TAKEN', '이미 사용 중인 ID입니다.', 409);
      }
      if (this.sessionsByDigest.size >= MAX_ACTIVE_AUTH_IDS) {
        throw new AuthServiceError(
          'ACTIVE_ID_LIMIT',
          `현재 활성 사용자 수가 최대 ${MAX_ACTIVE_AUTH_IDS}명입니다.`,
          429,
        );
      }

      const account: AccountRecord = {
        accountId: randomUUID(),
        loginId: parsed.loginId,
        normalizedLoginId: parsed.normalizedLoginId,
        password: await hashPassword(parsed.password),
        createdAt: new Date(this.now()).toISOString(),
        loginHistory: [],
      };
      const isFirstAccount = store.accounts.length === 0;
      const accountRoot = path.join(this.usersRoot, account.accountId);

      try {
        if (isFirstAccount) {
          await this.migrateFirstAccount(path.join(accountRoot, 'save-slots'));
        }
        await this.writeAccountStore({
          schemaVersion: ACCOUNT_STORE_SCHEMA_VERSION,
          accounts: [...store.accounts, account],
        });
      } catch (error) {
        await fs.rm(accountRoot, { recursive: true, force: true });
        throw error;
      }

      return this.issueSession(account);
    });
  }

  /** 저장된 계정을 검증하고 동일 ID의 이전 세션을 교체한다. */
  async login(credentials: AuthCredentials): Promise<IssuedAuthSession> {
    const parsed = validateCredentials(credentials);
    return this.runExclusive(async () => {
      this.cleanupExpiredSessions();
      const store = await this.readAccountStore();
      const account = store.accounts.find(
        (candidate) => candidate.normalizedLoginId === parsed.normalizedLoginId,
      );
      if (!account || !(await verifyPassword(parsed.password, account.password))) {
        throw new AuthServiceError(
          'INVALID_CREDENTIALS',
          'ID 또는 비밀번호가 올바르지 않습니다.',
          401,
        );
      }

      const existingDigest = this.sessionDigestByAccountId.get(account.accountId);
      if (!existingDigest && this.sessionsByDigest.size >= MAX_ACTIVE_AUTH_IDS) {
        throw new AuthServiceError(
          'ACTIVE_ID_LIMIT',
          `현재 활성 사용자 수가 최대 ${MAX_ACTIVE_AUTH_IDS}명입니다.`,
          429,
        );
      }

      const updatedAccount: AccountRecord = {
        ...account,
        loginHistory: [...account.loginHistory, new Date(this.now()).toISOString()],
      };
      await this.writeAccountStore({
        schemaVersion: ACCOUNT_STORE_SCHEMA_VERSION,
        accounts: store.accounts.map((candidate) =>
          candidate.accountId === updatedAccount.accountId ? updatedAccount : candidate,
        ),
      });

      if (existingDigest) {
        this.removeSessionByDigest(existingDigest);
      }

      return this.issueSession(updatedAccount);
    });
  }

  /** 쿠키 토큰을 검증하고 성공한 요청의 유휴 만료 시각을 연장한다. */
  authenticate(token: string, touch = true): AuthenticatedAccount | null {
    this.cleanupExpiredSessions();
    const digest = digestToken(token);
    const record = this.sessionsByDigest.get(digest);
    if (!record) {
      return null;
    }

    if (touch) {
      const now = this.now();
      record.lastSeenAt = now;
      record.expiresAt = now + AUTH_SESSION_IDLE_MS;
    }

    return {
      accountId: record.accountId,
      loginId: record.loginId,
      session: toSessionInfo(record),
    };
  }

  /** 쿠키 토큰에 해당하는 세션을 제거한다. */
  logout(token: string | null): void {
    if (!token) {
      return;
    }
    this.removeSessionByDigest(digestToken(token));
  }

  /** 정리 timer를 해제해 서버 lifecycle 밖에서 작업이 남지 않게 한다. */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.sessionsByDigest.clear();
    this.sessionDigestByAccountId.clear();
  }

  /** 테스트와 상태 점검에 사용할 현재 활성 ID 수를 반환한다. */
  getActiveSessionCount(): number {
    this.cleanupExpiredSessions();
    return this.sessionsByDigest.size;
  }

  private issueSession(account: AccountRecord): IssuedAuthSession {
    const token = randomBytes(32).toString('base64url');
    const now = this.now();
    const record: AuthSessionRecord = {
      tokenDigest: digestToken(token),
      accountId: account.accountId,
      loginId: account.loginId,
      lastSeenAt: now,
      expiresAt: now + AUTH_SESSION_IDLE_MS,
    };
    this.sessionsByDigest.set(record.tokenDigest, record);
    this.sessionDigestByAccountId.set(record.accountId, record.tokenDigest);
    return {
      token,
      accountId: record.accountId,
      loginId: record.loginId,
      session: toSessionInfo(record),
    };
  }

  private cleanupExpiredSessions(): void {
    const now = this.now();
    for (const [digest, record] of this.sessionsByDigest) {
      if (record.expiresAt <= now) {
        this.removeSessionByDigest(digest);
      }
    }
  }

  private removeSessionByDigest(digest: string): void {
    const record = this.sessionsByDigest.get(digest);
    if (!record) {
      return;
    }
    this.sessionsByDigest.delete(digest);
    if (this.sessionDigestByAccountId.get(record.accountId) === digest) {
      this.sessionDigestByAccountId.delete(record.accountId);
    }
  }

  private async readAccountStore(): Promise<AccountStore> {
    try {
      return validateAccountStore(JSON.parse(await fs.readFile(this.accountsPath, 'utf8')));
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return { schemaVersion: ACCOUNT_STORE_SCHEMA_VERSION, accounts: [] };
      }
      throw error;
    }
  }

  private async writeAccountStore(store: AccountStore): Promise<void> {
    const directory = path.dirname(this.accountsPath);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(directory, `.accounts-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fs.rename(temporaryPath, this.accountsPath);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let release!: () => void;
    this.mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function validateCredentials(credentials: AuthCredentials): {
  loginId: string;
  normalizedLoginId: string;
  password: string;
} {
  const loginId = credentials.id.trim();
  if (!/^[A-Za-z0-9_-]{4,20}$/.test(loginId)) {
    throw new AuthServiceError(
      'INVALID_INPUT',
      'ID는 영문, 숫자, 밑줄, 하이픈 4~20자로 입력해 주세요.',
      400,
    );
  }
  const passwordLength = Array.from(credentials.password).length;
  if (passwordLength < 8 || passwordLength > 64) {
    throw new AuthServiceError('INVALID_INPUT', '비밀번호는 8~64자로 입력해 주세요.', 400);
  }
  return {
    loginId,
    normalizedLoginId: loginId.toLowerCase(),
    password: credentials.password,
  };
}

async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);
  return {
    algorithm: 'scrypt',
    salt: salt.toString('base64'),
    hash: derived.toString('base64'),
    keyLength: SCRYPT_KEY_LENGTH,
    N: SCRYPT_OPTIONS.N,
    r: SCRYPT_OPTIONS.r,
    p: SCRYPT_OPTIONS.p,
  };
}

async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const expected = Buffer.from(stored.hash, 'base64');
  const actual = await derivePassword(
    password,
    Buffer.from(stored.salt, 'base64'),
    stored.keyLength,
    {
      N: stored.N,
      r: stored.r,
      p: stored.p,
      maxmem: 64 * 1024 * 1024,
    },
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function derivePassword(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

function validateAccountStore(value: unknown): AccountStore {
  if (
    !isRecord(value) ||
    (value.schemaVersion !== ACCOUNT_STORE_SCHEMA_VERSION &&
      value.schemaVersion !== LEGACY_ACCOUNT_STORE_SCHEMA_VERSION)
  ) {
    throw new Error('Invalid account store schema');
  }
  const isLegacyStore = value.schemaVersion === LEGACY_ACCOUNT_STORE_SCHEMA_VERSION;
  if (
    !Array.isArray(value.accounts) ||
    !value.accounts.every((account) =>
      isLegacyStore ? isLegacyAccountRecord(account) : isAccountRecord(account),
    )
  ) {
    throw new Error('Invalid account store accounts');
  }
  return {
    schemaVersion: ACCOUNT_STORE_SCHEMA_VERSION,
    accounts: value.accounts.map((account) => ({
      ...account,
      loginHistory: isLegacyStore ? [] : account.loginHistory,
    })),
  };
}

function isAccountRecord(value: unknown): value is AccountRecord {
  if (!isRecord(value)) {
    return false;
  }
  const loginHistory = value.loginHistory;
  return (
    isLegacyAccountRecord(value) &&
    Array.isArray(loginHistory) &&
    loginHistory.every((timestamp) => typeof timestamp === 'string')
  );
}

function isLegacyAccountRecord(value: unknown): value is Omit<AccountRecord, 'loginHistory'> {
  if (!isRecord(value) || !isRecord(value.password)) {
    return false;
  }
  return (
    typeof value.accountId === 'string' &&
    typeof value.loginId === 'string' &&
    typeof value.normalizedLoginId === 'string' &&
    typeof value.createdAt === 'string' &&
    value.password.algorithm === 'scrypt' &&
    typeof value.password.salt === 'string' &&
    typeof value.password.hash === 'string' &&
    Number.isInteger(value.password.keyLength) &&
    Number.isInteger(value.password.N) &&
    Number.isInteger(value.password.r) &&
    Number.isInteger(value.password.p)
  );
}

function toSessionInfo(record: AuthSessionRecord): AuthSessionInfo {
  return {
    id: record.loginId,
    expiresAt: new Date(record.expiresAt).toISOString(),
  };
}

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
