import * as Phaser from 'phaser';
import RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';

import type { GameSession } from '../../game/simulation/GameSession';
import { registerGameSession } from '../adapters/sceneBridge';
import { BootScene } from '../scenes/BootScene';
import { PF2eCustomClassShowcaseScene } from '../scenes/PF2eCustomClassShowcaseScene';
import { StarterScene } from '../scenes/StarterScene';
import { PF2E_ELF_THEME } from '../ui/theme/pf2eElfTheme';
import { GAME_RUNTIME_SETTINGS } from './runtime-settings';

export function createGameConfig(
  parent: string,
  session: GameSession,
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: PF2E_ELF_THEME.colors.backdrop,
    width: GAME_RUNTIME_SETTINGS.fallbackWidth,
    height: GAME_RUNTIME_SETTINGS.fallbackHeight,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: GAME_RUNTIME_SETTINGS.fallbackWidth,
      height: GAME_RUNTIME_SETTINGS.fallbackHeight,
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
    },
    input: {
      activePointers: 3,
    },
    plugins: {
      scene: [
        {
          key: GAME_RUNTIME_SETTINGS.rexUiPluginKey,
          plugin: RexUIPlugin,
          mapping: GAME_RUNTIME_SETTINGS.rexUiPluginMapping,
        },
      ],
    },
    scene: [BootScene, StarterScene, PF2eCustomClassShowcaseScene],
    callbacks: {
      preBoot: (game) => {
        registerGameSession(game.registry, session);
      },
    },
  };
}
