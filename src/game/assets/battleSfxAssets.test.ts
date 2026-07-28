import { access } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { assetManifest } from './manifest.js';
import {
  BATTLE_SFX_ASSET_DEFINITIONS,
  BATTLE_SFX_ASSET_KEYS,
  BATTLE_SFX_NAMES,
} from './battleSfxAssets.js';

describe('Phase 6 battle SFX assets', () => {
  it('defines the approved stable key set with OGG and MP3 fallbacks', async () => {
    expect(BATTLE_SFX_ASSET_KEYS).toEqual({
      attack: 'sfx.battle.attack',
      impact: 'sfx.battle.impact',
      damage: 'sfx.battle.damage',
      destroy: 'sfx.battle.destroy',
      heal: 'sfx.battle.heal',
      draw: 'sfx.battle.draw',
      move: 'sfx.battle.move',
      place: 'sfx.battle.place',
      discard: 'sfx.battle.discard',
      stat: 'sfx.battle.stat',
      statusAdd: 'sfx.battle.status.add',
      statusRemove: 'sfx.battle.status.remove',
    });
    expect(BATTLE_SFX_ASSET_DEFINITIONS).toHaveLength(BATTLE_SFX_NAMES.length);

    for (const definition of BATTLE_SFX_ASSET_DEFINITIONS) {
      expect(definition.paths[0]).toMatch(/\.ogg$/);
      expect(definition.paths[1]).toMatch(/\.mp3$/);
      expect(assetManifest).toContainEqual({
        key: definition.key,
        type: 'audio',
        paths: definition.paths,
      });

      await Promise.all(
        definition.paths.map((assetPath) =>
          access(path.join(process.cwd(), 'public', assetPath.replace(/^\/assets\//, 'assets/'))),
        ),
      );
    }
  });
});
