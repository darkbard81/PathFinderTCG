import * as Phaser from 'phaser';

import {
  BattlePresentationController,
  type BattleInteractionGate,
  type BattlePresentationControllerOptions,
  type BattlePresentationDiagnostic,
} from '../ui/controllers/BattlePresentationController.js';
import { BattleAudioUnlockController } from '../ui/controllers/BattleAudioUnlockController.js';
import {
  BattleSfxSettingsStore,
  type BattleSfxSettingsStorage,
} from '../ui/controllers/BattleSfxSettingsStore.js';
import {
  PhaserBattlePresentationDriver,
  type PhaserBattlePresentationViewCallbacks,
} from '../view/battle/PhaserBattlePresentationDriver.js';

export interface PhaserBattlePresentationRuntimeOptions {
  readonly view: PhaserBattlePresentationViewCallbacks;
  readonly interactionGate?: BattleInteractionGate;
  readonly settingsStore?: BattleSfxSettingsStore;
  readonly storage?: BattleSfxSettingsStorage | null;
  readonly onDiagnostic?: (diagnostic: BattlePresentationDiagnostic) => void;
  readonly cueTimeoutMs?: number;
  readonly actionTimeoutMs?: number;
}

export class PhaserBattlePresentationRuntime {
  readonly controller: BattlePresentationController;
  readonly settings: BattleSfxSettingsStore;
  readonly audioUnlock: BattleAudioUnlockController;
  private readonly scene: Phaser.Scene;
  private readonly ownsSettingsStore: boolean;
  private readonly onDiagnostic?: (diagnostic: BattlePresentationDiagnostic) => void;
  private readonly diagnosticLog: BattlePresentationDiagnostic[] = [];
  private destroyed = false;

  constructor(scene: Phaser.Scene, options: PhaserBattlePresentationRuntimeOptions) {
    this.scene = scene;
    this.onDiagnostic = options.onDiagnostic;
    this.ownsSettingsStore = options.settingsStore === undefined;
    this.settings =
      options.settingsStore ??
      new BattleSfxSettingsStore({
        storage: options.storage,
        onStorageError: (error) => {
          this.report({
            code: 'DRIVER_ERROR',
            message: '로컬 전투 SFX 설정을 읽거나 저장하지 못했습니다.',
            error,
          });
        },
      });
    const driver = new PhaserBattlePresentationDriver(scene, options.view, {
      settingsStore: this.settings,
      onDiagnostic: this.report,
    });
    const controllerOptions: BattlePresentationControllerOptions = {
      interactionGate: options.interactionGate,
      onDiagnostic: this.report,
      cueTimeoutMs: options.cueTimeoutMs,
      actionTimeoutMs: options.actionTimeoutMs,
    };
    this.controller = new BattlePresentationController(driver, controllerOptions);
    this.audioUnlock = new BattleAudioUnlockController(scene, {
      onDiagnostic: this.report,
    });
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown);
  }

  get diagnostics(): readonly BattlePresentationDiagnostic[] {
    return Object.freeze([...this.diagnosticLog]);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown);
    this.audioUnlock.destroy();
    this.controller.destroy();

    if (this.ownsSettingsStore) {
      this.settings.destroy();
    }
  }

  private readonly handleSceneShutdown = (): void => {
    this.destroy();
  };

  private readonly report = (diagnostic: BattlePresentationDiagnostic): void => {
    const frozen = Object.freeze({ ...diagnostic });
    this.diagnosticLog.push(frozen);
    this.onDiagnostic?.(frozen);
  };
}

export function createBattlePresentationRuntime(
  scene: Phaser.Scene,
  options: PhaserBattlePresentationRuntimeOptions,
): PhaserBattlePresentationRuntime {
  return new PhaserBattlePresentationRuntime(scene, options);
}
