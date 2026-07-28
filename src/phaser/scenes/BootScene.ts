import * as Phaser from 'phaser';

import { assetManifest } from '../../game/assets/manifest.js';
import { getGameSession } from '../adapters/sceneBridge.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    for (const asset of assetManifest) {
      switch (asset.type) {
        case 'image':
          this.load.image(asset.key, asset.path);
          break;
        case 'audio':
          this.load.audio(asset.key, [...asset.paths]);
          break;
        case 'json':
          this.load.json(asset.key, asset.path);
          break;
      }
    }
  }

  create(): void {
    void this.routeInitialScene();
  }

  private async routeInitialScene(): Promise<void> {
    try {
      const authenticated = await getGameSession(this).restoreAuthentication();

      if (this.scene.isActive()) {
        this.scene.start(authenticated ? 'SaveSlotScene' : 'LoginScene');
      }
    } catch (error: unknown) {
      if (this.scene.isActive()) {
        this.scene.start('LoginScene', {
          status:
            error instanceof Error
              ? `API 연결을 확인하세요. ${error.message}`
              : 'API 연결을 확인하세요.',
        });
      }
    }
  }
}
