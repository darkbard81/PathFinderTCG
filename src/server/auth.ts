import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';

import type { GameDatabase, PublicUser, StoredUser } from './database.js';

export const SESSION_COOKIE_NAME = 'ptcg_session';
export const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
export const USERNAME_PATTERN = /^[a-z0-9_-]{3,24}$/;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 64;
const SESSION_TOKEN_BYTES = 32;
const SCRYPT_OPTIONS = Object.freeze({
  N: 32_768,
  r: 8,
  p: 1,
  maxmem: 67_108_864,
});
const DUMMY_PASSWORD_SALT = Buffer.alloc(PASSWORD_SALT_BYTES, 0xa5);

export type Clock = () => Date;

export interface LoginSession {
  readonly user: PublicUser;
  readonly rawToken: string;
  readonly expiresAt: Date;
}

export class AuthInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthInputError';
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('사용자명 또는 비밀번호가 올바르지 않습니다.');
    this.name = 'InvalidCredentialsError';
  }
}

function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_HASH_BYTES, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error !== null) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

function digestSessionToken(rawToken: string): Buffer {
  return createHash('sha256').update(rawToken, 'utf8').digest();
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function validateRegistrationCredentials(username: string, password: string): string {
  const normalizedUsername = normalizeUsername(username);

  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    throw new AuthInputError(
      '사용자명은 영문 소문자, 숫자, 밑줄, 하이픈으로 구성된 3~24자여야 합니다.',
    );
  }

  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new AuthInputError(
      `비밀번호는 ${PASSWORD_MIN_LENGTH}~${PASSWORD_MAX_LENGTH}자여야 합니다.`,
    );
  }

  return normalizedUsername;
}

export class AuthService {
  private readonly database: GameDatabase;
  private readonly now: Clock;

  constructor(database: GameDatabase, now: Clock = () => new Date()) {
    this.database = database;
    this.now = now;
  }

  async register(username: string, password: string): Promise<PublicUser> {
    const normalizedUsername = validateRegistrationCredentials(username, password);
    const passwordSalt = randomBytes(PASSWORD_SALT_BYTES);
    const passwordHash = await derivePasswordKey(password, passwordSalt);
    const user: StoredUser = {
      id: randomUUID(),
      username: normalizedUsername,
      passwordSalt,
      passwordHash,
      createdAt: this.now().toISOString(),
    };

    this.database.createUser(user);

    return {
      id: user.id,
      username: user.username,
    };
  }

  async login(username: string, password: string): Promise<LoginSession> {
    const normalizedUsername = normalizeUsername(username);
    const credentialsWellFormed =
      USERNAME_PATTERN.test(normalizedUsername) &&
      password.length >= PASSWORD_MIN_LENGTH &&
      password.length <= PASSWORD_MAX_LENGTH;
    const storedUser = credentialsWellFormed
      ? this.database.findUserByUsername(normalizedUsername)
      : null;
    const passwordSalt = storedUser?.passwordSalt ?? DUMMY_PASSWORD_SALT;
    const suppliedPassword = credentialsWellFormed ? password : 'invalid-password';
    const suppliedHash = await derivePasswordKey(suppliedPassword, passwordSalt);
    const passwordMatches =
      storedUser !== null &&
      suppliedHash.length === storedUser.passwordHash.length &&
      timingSafeEqual(suppliedHash, storedUser.passwordHash);

    if (!passwordMatches || storedUser === null) {
      throw new InvalidCredentialsError();
    }

    const now = this.now();
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_SECONDS * 1000);
    const rawToken = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
    const tokenDigest = digestSessionToken(rawToken);

    this.database.deleteExpiredSessions(now.toISOString());
    this.database.createSession(
      tokenDigest,
      storedUser.id,
      now.toISOString(),
      expiresAt.toISOString(),
    );

    return {
      user: {
        id: storedUser.id,
        username: storedUser.username,
      },
      rawToken,
      expiresAt,
    };
  }

  authenticate(rawToken: string | undefined): PublicUser | null {
    if (rawToken === undefined || rawToken.length === 0) {
      return null;
    }

    return (
      this.database.findSession(digestSessionToken(rawToken), this.now().toISOString())?.user ??
      null
    );
  }

  logout(rawToken: string | undefined): void {
    if (rawToken === undefined || rawToken.length === 0) {
      return;
    }

    this.database.deleteSession(digestSessionToken(rawToken));
  }
}
