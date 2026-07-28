import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { GameDatabase } from './database.js';

describe('GameDatabase', () => {
  let temporaryDirectory: string | null = null;

  afterEach(async () => {
    if (temporaryDirectory !== null) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = null;
    }
  });

  it('enables foreign keys, WAL, the busy timeout, and the current migration', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'pathfinder-tcg-database-'));
    const database = new GameDatabase(join(temporaryDirectory, 'game.sqlite'));

    expect(database.getPragma('foreign_keys')).toBe(1);
    expect(database.getPragma('journal_mode')).toBe('wal');
    expect(database.getPragma('busy_timeout')).toBe(5000);
    expect(database.getPragma('user_version')).toBe(2);

    database.close();
  });

  it('migrates an existing v1 database to the Stage run schema without replacing v1 tables', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'pathfinder-tcg-database-v1-'));
    const databasePath = join(temporaryDirectory, 'game.sqlite');
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_salt BLOB NOT NULL,
        password_hash BLOB NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE sessions (
        token_digest BLOB PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE save_slots (
        user_id TEXT NOT NULL,
        slot_id INTEGER NOT NULL,
        schema_version INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, slot_id)
      ) STRICT;

      PRAGMA user_version = 1;
    `);
    legacy.close();

    const migrated = new GameDatabase(databasePath);
    expect(migrated.getPragma('user_version')).toBe(2);
    migrated.close();

    const inspection = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    const tableNames = inspection
      .prepare<[], { readonly name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    const pendingIndex = inspection
      .prepare<[], { readonly name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'stage_runs_pending_stage_index'",
      )
      .get();
    inspection.close();

    expect(tableNames).toEqual(['save_slots', 'sessions', 'stage_runs', 'users']);
    expect(pendingIndex?.name).toBe('stage_runs_pending_stage_index');
  });
});
