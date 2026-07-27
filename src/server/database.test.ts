import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    expect(database.getPragma('user_version')).toBe(1);

    database.close();
  });
});
