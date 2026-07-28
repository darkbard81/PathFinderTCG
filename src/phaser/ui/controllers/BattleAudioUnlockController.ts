import * as Phaser from 'phaser';

import type { BattlePresentationDiagnostic } from './BattlePresentationController.js';

export type BattleAudioUnlockStatus = 'UNLOCKED' | 'BLOCKED' | 'UNAVAILABLE';

export interface BattleAudioUnlockControllerOptions {
  readonly onDiagnostic?: (diagnostic: BattlePresentationDiagnostic) => void;
}

export class BattleAudioUnlockController {
  private readonly scene: Phaser.Scene;
  private readonly onDiagnostic?: (diagnostic: BattlePresentationDiagnostic) => void;
  private attempted = false;
  private destroyed = false;

  constructor(scene: Phaser.Scene, options: BattleAudioUnlockControllerOptions = {}) {
    this.scene = scene;
    this.onDiagnostic = options.onDiagnostic;
    this.scene.input.once(Phaser.Input.Events.POINTER_DOWN, this.handleFirstGesture);
    this.scene.input.keyboard?.once('keydown', this.handleFirstGesture);
  }

  async attemptUnlock(): Promise<BattleAudioUnlockStatus> {
    if (this.destroyed) {
      return 'UNAVAILABLE';
    }

    this.removeGestureListeners();

    if (this.attempted && !this.scene.sound.locked) {
      return 'UNLOCKED';
    }

    this.attempted = true;

    try {
      const sound = this.scene.sound;

      if ('context' in sound) {
        sound.unlock();

        if (sound.context.state !== 'running') {
          await sound.context.resume();
        }
      } else if ('unlock' in sound) {
        sound.unlock();
      } else {
        return 'UNAVAILABLE';
      }

      if (this.scene.sound.locked) {
        this.reportBlocked('브라우저가 첫 사용자 제스처 뒤에도 전투 오디오를 차단했습니다.');
        return 'BLOCKED';
      }

      return 'UNLOCKED';
    } catch (error: unknown) {
      this.reportBlocked('브라우저 전투 오디오 활성화가 거부되었습니다.', error);
      return 'BLOCKED';
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.removeGestureListeners();
  }

  private readonly handleFirstGesture = (): void => {
    void this.attemptUnlock();
  };

  private removeGestureListeners(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handleFirstGesture);
    this.scene.input.keyboard?.off('keydown', this.handleFirstGesture);
  }

  private reportBlocked(message: string, error?: unknown): void {
    this.onDiagnostic?.(
      Object.freeze({
        code: 'AUDIO_BLOCKED',
        message,
        error,
      }),
    );
  }
}
