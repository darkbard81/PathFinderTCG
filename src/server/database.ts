import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';

import type { SaveSlotId } from './gameContent.js';

const DATABASE_SCHEMA_VERSION = 1;

export interface StoredUser {
  readonly id: string;
  readonly username: string;
  readonly passwordSalt: Buffer;
  readonly passwordHash: Buffer;
  readonly createdAt: string;
}

export interface PublicUser {
  readonly id: string;
  readonly username: string;
}

export interface StoredSession {
  readonly user: PublicUser;
  readonly expiresAt: string;
}

export interface PersistedSaveSlot {
  readonly slotId: SaveSlotId;
  readonly schemaVersion: number;
  readonly stateJson: string;
  readonly updatedAt: string;
}

interface UserRow {
  readonly id: string;
  readonly username: string;
  readonly password_salt: Buffer;
  readonly password_hash: Buffer;
  readonly created_at: string;
}

interface SessionRow {
  readonly user_id: string;
  readonly username: string;
  readonly expires_at: string;
}

interface SaveSlotRow {
  readonly slot_id: number;
  readonly schema_version: number;
  readonly state_json: string;
  readonly updated_at: string;
}

export class DuplicateUsernameError extends Error {
  constructor() {
    super('이미 사용 중인 사용자명입니다.');
    this.name = 'DuplicateUsernameError';
  }
}

export class SaveSlotAlreadyExistsError extends Error {
  constructor(slotId: SaveSlotId) {
    super(`이미 생성된 세이브 슬롯입니다: ${slotId}`);
    this.name = 'SaveSlotAlreadyExistsError';
  }
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Database.SqliteError && error.code.startsWith('SQLITE_CONSTRAINT');
}

function prepareDatabasePath(databasePath: string): string {
  if (databasePath === ':memory:') {
    return databasePath;
  }

  const resolvedPath = resolve(databasePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  return resolvedPath;
}

function toSaveSlotId(value: number): SaveSlotId {
  if (value !== 1 && value !== 2 && value !== 3) {
    throw new Error(`DB에 유효하지 않은 세이브 슬롯 ID가 저장되어 있습니다: ${value}`);
  }

  return value;
}

export class GameDatabase {
  private readonly database: Database.Database;

  constructor(databasePath: string) {
    this.database = new Database(prepareDatabasePath(databasePath));
    this.database.pragma('foreign_keys = ON');
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('busy_timeout = 5000');
    this.migrate();
  }

  createUser(user: StoredUser): void {
    try {
      this.database
        .prepare(
          `
            INSERT INTO users (
              id,
              username,
              password_salt,
              password_hash,
              created_at
            ) VALUES (?, ?, ?, ?, ?)
          `,
        )
        .run(user.id, user.username, user.passwordSalt, user.passwordHash, user.createdAt);
    } catch (error) {
      if (isConstraintError(error)) {
        throw new DuplicateUsernameError();
      }

      throw error;
    }
  }

  findUserByUsername(username: string): StoredUser | null {
    const row = this.database
      .prepare<[string], UserRow>(
        `
          SELECT id, username, password_salt, password_hash, created_at
          FROM users
          WHERE username = ?
        `,
      )
      .get(username);

    if (row === undefined) {
      return null;
    }

    return {
      id: row.id,
      username: row.username,
      passwordSalt: row.password_salt,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
    };
  }

  createSession(tokenDigest: Buffer, userId: string, createdAt: string, expiresAt: string): void {
    this.database
      .prepare(
        `
          INSERT INTO sessions (token_digest, user_id, created_at, expires_at)
          VALUES (?, ?, ?, ?)
        `,
      )
      .run(tokenDigest, userId, createdAt, expiresAt);
  }

  findSession(tokenDigest: Buffer, nowIso: string): StoredSession | null {
    const row = this.database
      .prepare<[Buffer], SessionRow>(
        `
          SELECT users.id AS user_id, users.username, sessions.expires_at
          FROM sessions
          INNER JOIN users ON users.id = sessions.user_id
          WHERE sessions.token_digest = ?
        `,
      )
      .get(tokenDigest);

    if (row === undefined) {
      return null;
    }

    if (row.expires_at <= nowIso) {
      this.deleteSession(tokenDigest);
      return null;
    }

    return {
      user: {
        id: row.user_id,
        username: row.username,
      },
      expiresAt: row.expires_at,
    };
  }

  deleteSession(tokenDigest: Buffer): void {
    this.database.prepare('DELETE FROM sessions WHERE token_digest = ?').run(tokenDigest);
  }

  deleteExpiredSessions(nowIso: string): void {
    this.database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso);
  }

  listSaveSlots(userId: string): readonly PersistedSaveSlot[] {
    const rows = this.database
      .prepare<[string], SaveSlotRow>(
        `
          SELECT slot_id, schema_version, state_json, updated_at
          FROM save_slots
          WHERE user_id = ?
          ORDER BY slot_id ASC
        `,
      )
      .all(userId);

    return rows.map((row) => ({
      slotId: toSaveSlotId(row.slot_id),
      schemaVersion: row.schema_version,
      stateJson: row.state_json,
      updatedAt: row.updated_at,
    }));
  }

  findSaveSlot(userId: string, slotId: SaveSlotId): PersistedSaveSlot | null {
    const row = this.database
      .prepare<[string, number], SaveSlotRow>(
        `
          SELECT slot_id, schema_version, state_json, updated_at
          FROM save_slots
          WHERE user_id = ? AND slot_id = ?
        `,
      )
      .get(userId, slotId);

    if (row === undefined) {
      return null;
    }

    return {
      slotId: toSaveSlotId(row.slot_id),
      schemaVersion: row.schema_version,
      stateJson: row.state_json,
      updatedAt: row.updated_at,
    };
  }

  createSaveSlot(userId: string, slot: PersistedSaveSlot): void {
    try {
      this.database
        .prepare(
          `
            INSERT INTO save_slots (
              user_id,
              slot_id,
              schema_version,
              state_json,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          userId,
          slot.slotId,
          slot.schemaVersion,
          slot.stateJson,
          slot.updatedAt,
          slot.updatedAt,
        );
    } catch (error) {
      if (isConstraintError(error)) {
        throw new SaveSlotAlreadyExistsError(slot.slotId);
      }

      throw error;
    }
  }

  updateSaveSlot(userId: string, slot: PersistedSaveSlot): boolean {
    const result = this.database
      .prepare(
        `
          UPDATE save_slots
          SET schema_version = ?, state_json = ?, updated_at = ?
          WHERE user_id = ? AND slot_id = ?
        `,
      )
      .run(slot.schemaVersion, slot.stateJson, slot.updatedAt, userId, slot.slotId);

    return result.changes === 1;
  }

  deleteSaveSlot(userId: string, slotId: SaveSlotId): boolean {
    const result = this.database
      .prepare('DELETE FROM save_slots WHERE user_id = ? AND slot_id = ?')
      .run(userId, slotId);

    return result.changes === 1;
  }

  getPragma(name: 'busy_timeout' | 'foreign_keys' | 'journal_mode' | 'user_version'): unknown {
    return this.database.pragma(name, { simple: true });
  }

  close(): void {
    if (this.database.open) {
      this.database.close();
    }
  }

  private migrate(): void {
    const currentVersion = this.database.pragma('user_version', { simple: true });

    if (typeof currentVersion !== 'number') {
      throw new Error('SQLite user_version을 읽을 수 없습니다.');
    }

    if (currentVersion > DATABASE_SCHEMA_VERSION) {
      throw new Error(
        `지원하지 않는 미래 DB Schema입니다: ${currentVersion} > ${DATABASE_SCHEMA_VERSION}`,
      );
    }

    if (currentVersion === DATABASE_SCHEMA_VERSION) {
      return;
    }

    this.database.transaction(() => {
      this.database.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_salt BLOB NOT NULL CHECK (length(password_salt) = 16),
          password_hash BLOB NOT NULL CHECK (length(password_hash) = 64),
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE sessions (
          token_digest BLOB PRIMARY KEY CHECK (length(token_digest) = 32),
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX sessions_user_id_index ON sessions(user_id);
        CREATE INDEX sessions_expires_at_index ON sessions(expires_at);

        CREATE TABLE save_slots (
          user_id TEXT NOT NULL,
          slot_id INTEGER NOT NULL CHECK (slot_id BETWEEN 1 AND 3),
          schema_version INTEGER NOT NULL CHECK (schema_version > 0),
          state_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, slot_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) STRICT;
      `);
      this.database.pragma(`user_version = ${DATABASE_SCHEMA_VERSION}`);
    })();
  }
}
