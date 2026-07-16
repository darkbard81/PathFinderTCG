import * as Phaser from 'phaser';

import { assetManifest } from '../../game/assets/manifest';

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
          this.load.audio(asset.key, asset.path);
          break;
        case 'json':
          this.load.json(asset.key, asset.path);
          break;
      }
    }
  }

  create(): void {
    this.scene.start('StarterScene');
  }
}
