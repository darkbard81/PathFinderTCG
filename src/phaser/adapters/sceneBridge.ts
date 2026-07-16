import type * as Phaser from 'phaser';

import { GameSession } from '../../game/simulation/GameSession';

export const GAME_SESSION_REGISTRY_KEY = 'game-session';

export function registerGameSession(registry: Phaser.Data.DataManager, session: GameSession): void {
  registry.set(GAME_SESSION_REGISTRY_KEY, session);
}

export function getGameSession(scene: Phaser.Scene): GameSession {
  const session: unknown = scene.registry.get(GAME_SESSION_REGISTRY_KEY);

  if (!(session instanceof GameSession)) {
    throw new Error('GameSession is not registered in the Phaser registry.');
  }

  return session;
}
