import { describe, expect, it } from 'vitest';

import { GAME_RUNTIME_SETTINGS } from './runtime-settings';

describe('GAME_RUNTIME_SETTINGS', () => {
  it('declares responsive resize mode and the rexUI scene mapping', () => {
    expect(GAME_RUNTIME_SETTINGS).toMatchObject({
      scaleMode: 'RESIZE',
      rexUiPluginKey: 'rexUI',
      rexUiPluginMapping: 'rexUI',
    });
  });
});
