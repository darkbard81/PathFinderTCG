import type * as Phaser from 'phaser';

import type { PF2eTreeNavigationController } from './PF2eTreeNavigationController';

export class PF2eTreeKeyboardController<NodeId extends string> {
  private readonly scene: Phaser.Scene;
  private readonly navigation: PF2eTreeNavigationController<NodeId>;

  constructor(scene: Phaser.Scene, navigation: PF2eTreeNavigationController<NodeId>) {
    this.scene = scene;
    this.navigation = navigation;
    this.scene.input.keyboard?.on('keydown', this.handleKeyDown);
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown', this.handleKeyDown);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'ArrowUp':
        this.navigation.focusPrevious();
        break;
      case 'ArrowDown':
        this.navigation.focusNext();
        break;
      case 'Enter':
        this.navigation.activateFocused();
        break;
      default:
        return;
    }
    event.preventDefault();
  };
}
