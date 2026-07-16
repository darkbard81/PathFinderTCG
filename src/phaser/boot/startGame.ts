import * as Phaser from 'phaser';

import { GameSession } from '../../game/simulation/GameSession';
import { createGameConfig } from '../config/game-config';

export function startGame(parent = 'game-root'): Phaser.Game {
  const session = new GameSession();
  return new Phaser.Game(createGameConfig(parent, session));
}
