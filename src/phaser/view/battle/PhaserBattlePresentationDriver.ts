import * as Phaser from 'phaser';

import type { StableId } from '../../../game/data/contracts.js';
import type { BattleState } from '../../../game/simulation/battle/types.js';
import type {
  BattlePresentationCue,
  TweenPresentationCue,
  VisualFxPresentationCue,
} from '../../adapters/battlePresentationCueAdapter.js';
import type {
  BattleCuePlayback,
  BattleCuePlaybackContext,
  BattlePresentationDiagnostic,
  BattlePresentationDriver,
  BattleStateApplyContext,
} from '../../ui/controllers/BattlePresentationController.js';
import { BattleSfxSettingsStore } from '../../ui/controllers/BattleSfxSettingsStore.js';
import { PF2E_ELF_THEME } from '../../ui/theme/pf2eElfTheme.js';

export type PhaserBattleCardView =
  Phaser.GameObjects.Container | Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

type PhaserBattleVisualView =
  PhaserBattleCardView | Phaser.GameObjects.Arc | Phaser.GameObjects.Text;

interface BattleTweenConfig {
  readonly x?: number;
  readonly y?: number;
  readonly alpha?: number;
  readonly scale?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly duration: number;
  readonly ease: string;
  readonly yoyo?: boolean;
  readonly repeat?: number;
}

export interface PhaserBattlePoint {
  readonly x: number;
  readonly y: number;
}

export interface PhaserBattlePresentationViewCallbacks {
  readonly getCardView: (cardId: StableId) => PhaserBattleCardView | undefined;
  /**
   * renderer의 keyed view registry에서 참조만 제거한다. GameObject를 destroy하면 안 된다.
   * death와 여러 step에 걸친 공격 view를 실제 효과 레이어로 옮기기 전에 호출된다.
   */
  readonly detachCardView: (cardId: StableId, view: PhaserBattleCardView) => void;
  readonly createTransientCardView?: (
    cardId: StableId,
    cue: BattlePresentationCue,
    context: BattleCuePlaybackContext,
  ) => PhaserBattleCardView | undefined;
  readonly getCardPosition?: (
    cardId: StableId,
    state: BattleState,
  ) => PhaserBattlePoint | undefined;
  readonly renderState: (state: BattleState, context: BattleStateApplyContext) => void;
}

export interface PhaserBattlePresentationDriverOptions {
  readonly settingsStore?: BattleSfxSettingsStore;
  readonly onDiagnostic?: (diagnostic: BattlePresentationDiagnostic) => void;
}

class ManagedBattleCuePlayback implements BattleCuePlayback {
  readonly finished: Promise<void>;
  private resolveFinished = (): void => undefined;
  private cancelAction = (): void => undefined;
  private settled = false;

  constructor() {
    this.finished = new Promise<void>((resolve) => {
      this.resolveFinished = resolve;
    });
  }

  setCancelAction(cancelAction: () => void): void {
    this.cancelAction = cancelAction;
  }

  complete(): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    this.resolveFinished();
  }

  cancel(): void {
    if (this.settled) {
      return;
    }

    this.cancelAction();
    this.complete();
  }
}

function completedPlayback(): BattleCuePlayback {
  return {
    finished: Promise.resolve(),
    cancel: () => undefined,
  };
}

export class PhaserBattlePresentationDriver implements BattlePresentationDriver {
  private readonly scene: Phaser.Scene;
  private readonly callbacks: PhaserBattlePresentationViewCallbacks;
  private readonly settingsStore: BattleSfxSettingsStore;
  private readonly ownsSettingsStore: boolean;
  private readonly onDiagnostic?: (diagnostic: BattlePresentationDiagnostic) => void;
  private readonly effectsLayer: Phaser.GameObjects.Layer;
  private readonly retainedViewsByStep = new Map<StableId, Map<StableId, PhaserBattleCardView>>();
  private readonly transientViewsByStep = new Map<StableId, Set<PhaserBattleVisualView>>();
  private readonly destroyedViews = new Set<PhaserBattleVisualView>();
  private readonly activeVisualPlaybacks = new Set<ManagedBattleCuePlayback>();
  private readonly activeSoundPlaybacks = new Set<ManagedBattleCuePlayback>();
  private readonly attackOrigins = new Map<StableId, PhaserBattlePoint>();
  private readonly pinnedAttackViews = new Map<StableId, PhaserBattleCardView>();
  private readonly completedAttackReturns = new Set<StableId>();
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    callbacks: PhaserBattlePresentationViewCallbacks,
    options: PhaserBattlePresentationDriverOptions = {},
  ) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.ownsSettingsStore = options.settingsStore === undefined;
    this.settingsStore = options.settingsStore ?? new BattleSfxSettingsStore();
    this.onDiagnostic = options.onDiagnostic;
    this.effectsLayer = scene.add
      .layer()
      .setDepth(PF2E_ELF_THEME.components.battlePresentation.effectDepth);
  }

  retainCardView(cardId: StableId, stepId: StableId): void {
    if (this.destroyed) {
      return;
    }

    const existingStepViews = this.retainedViewsByStep.get(stepId);

    if (existingStepViews?.has(cardId)) {
      return;
    }

    const view = this.findView(cardId);

    if (view === undefined) {
      this.report({
        code: 'MISSING_ASSET',
        message: `제거 연출 전에 보존할 카드 view를 찾지 못했습니다: ${cardId}`,
        stepId,
        assetKey: cardId,
      });
      return;
    }

    if (view.parentContainer !== null) {
      view.parentContainer.remove(view);
    }

    this.callbacks.detachCardView(cardId, view);
    this.effectsLayer.add(view);
    this.pinnedAttackViews.delete(cardId);
    this.completedAttackReturns.delete(cardId);
    const stepViews = existingStepViews ?? new Map<StableId, PhaserBattleCardView>();
    stepViews.set(cardId, view);
    this.retainedViewsByStep.set(stepId, stepViews);
  }

  playCue(cue: BattlePresentationCue, context: BattleCuePlaybackContext): BattleCuePlayback {
    if (this.destroyed) {
      return completedPlayback();
    }

    switch (cue.type) {
      case 'ANIMATION':
        return this.playAnimation(cue, context);
      case 'TWEEN':
        return this.playTween(cue, context);
      case 'SOUND':
        return this.playSound(cue.assetKey, cue.id, cue.stepId);
      case 'VISUAL_FX':
        return this.playVisualFx(cue, context);
    }
  }

  applyState(state: BattleState, context: BattleStateApplyContext): void {
    if (!this.destroyed) {
      this.callbacks.renderState(state, context);
      this.reconcilePinnedAttackViews(state);
    }
  }

  releaseStep(stepId: StableId): void {
    const retainedViews = this.retainedViewsByStep.get(stepId);

    if (retainedViews !== undefined) {
      for (const view of retainedViews.values()) {
        this.destroyViewOnce(view);
      }
      this.retainedViewsByStep.delete(stepId);
    }

    const transientViews = this.transientViewsByStep.get(stepId);

    if (transientViews !== undefined) {
      for (const view of transientViews) {
        this.destroyViewOnce(view);
      }
      this.transientViewsByStep.delete(stepId);
    }
  }

  cancelActive(): void {
    for (const playback of [...this.activeVisualPlaybacks]) {
      playback.cancel();
    }

    this.activeVisualPlaybacks.clear();

    for (const cardId of this.pinnedAttackViews.keys()) {
      this.completedAttackReturns.add(cardId);
    }

    this.attackOrigins.clear();
  }

  stopTransientSounds(): void {
    for (const playback of [...this.activeSoundPlaybacks]) {
      playback.cancel();
    }

    this.activeSoundPlaybacks.clear();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.cancelActive();
    this.stopTransientSounds();

    for (const stepId of [
      ...this.retainedViewsByStep.keys(),
      ...this.transientViewsByStep.keys(),
    ]) {
      this.releaseStep(stepId);
    }

    for (const view of this.pinnedAttackViews.values()) {
      this.destroyViewOnce(view);
    }
    this.pinnedAttackViews.clear();
    this.completedAttackReturns.clear();
    this.effectsLayer.destroy();

    if (this.ownsSettingsStore) {
      this.settingsStore.destroy();
    }
  }

  private playAnimation(
    cue: Extract<BattlePresentationCue, { readonly type: 'ANIMATION' }>,
    context: BattleCuePlaybackContext,
  ): BattleCuePlayback {
    const view = this.resolveCueView(cue.targetCardId, cue, context);

    if (view === undefined || !('anims' in view) || !('play' in view)) {
      this.report({
        code: 'MISSING_ASSET',
        message: `Animation 대상 Sprite를 찾지 못해 Tween fallback만 사용합니다: ${cue.targetCardId}`,
        stepId: cue.stepId,
        cueId: cue.id,
        assetKey: cue.animationKey,
      });
      return completedPlayback();
    }

    if (!this.scene.anims.exists(cue.animationKey)) {
      this.report({
        code: 'MISSING_ASSET',
        message: `전투 Animation 키를 찾지 못해 Tween fallback만 사용합니다: ${cue.animationKey}`,
        stepId: cue.stepId,
        cueId: cue.id,
        assetKey: cue.animationKey,
      });
      return completedPlayback();
    }

    const playback = new ManagedBattleCuePlayback();
    const completeEvent = Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + cue.animationKey;
    const stopEvent = Phaser.Animations.Events.ANIMATION_STOP;
    const finish = (): void => {
      view.off(completeEvent, finish);
      view.off(stopEvent, finish);
      view.anims.timeScale = 1;
      playback.complete();
    };

    playback.setCancelAction(() => {
      view.off(completeEvent, finish);
      view.off(stopEvent, finish);
      view.anims.stop();
      view.anims.timeScale = 1;
    });
    this.trackVisualPlayback(playback);
    view.once(completeEvent, finish);
    view.once(stopEvent, finish);
    view.play(cue.animationKey);

    const animationDuration = view.anims.currentAnim?.duration ?? cue.durationMs;
    view.anims.timeScale =
      cue.durationMs <= 0 ? context.speed : (animationDuration / cue.durationMs) * context.speed;
    return playback;
  }

  private playTween(
    cue: TweenPresentationCue,
    context: BattleCuePlaybackContext,
  ): BattleCuePlayback {
    const view = this.resolveCueView(cue.targetCardId, cue, context);

    if (view === undefined) {
      return completedPlayback();
    }

    const duration = cue.durationMs / context.speed;
    const original = {
      x: view.x,
      y: view.y,
      alpha: view.alpha,
      scaleX: view.scaleX,
      scaleY: view.scaleY,
    };

    switch (cue.tween) {
      case 'ATTACK_APPROACH': {
        const targetView =
          cue.relatedCardId === undefined ? undefined : this.findView(cue.relatedCardId);
        const targetPosition =
          targetView === undefined ? undefined : { x: targetView.x, y: targetView.y };

        if (targetPosition === undefined) {
          this.reportMissingView(cue, cue.relatedCardId ?? cue.targetCardId);
          return completedPlayback();
        }

        this.pinAttackView(cue.targetCardId, view);
        this.attackOrigins.set(cue.targetCardId, { x: original.x, y: original.y });
        const fraction = PF2E_ELF_THEME.components.battlePresentation.approachFraction;
        return this.addTween(
          view,
          {
            x: original.x + (targetPosition.x - original.x) * fraction,
            y: original.y + (targetPosition.y - original.y) * fraction,
            duration,
            ease: cue.easing,
          },
          () => {
            view.setPosition(original.x, original.y);
            this.attackOrigins.delete(cue.targetCardId);
          },
        );
      }
      case 'ATTACK_RETURN': {
        const origin = this.attackOrigins.get(cue.targetCardId);

        if (origin === undefined) {
          return completedPlayback();
        }

        return this.addTween(
          view,
          {
            x: origin.x,
            y: origin.y,
            duration,
            ease: cue.easing,
          },
          () => {
            view.setPosition(origin.x, origin.y);
            this.attackOrigins.delete(cue.targetCardId);
          },
          () => {
            this.attackOrigins.delete(cue.targetCardId);
            this.completedAttackReturns.add(cue.targetCardId);
          },
        );
      }
      case 'DAMAGE_SHAKE': {
        const segments = 6;
        return this.addTween(
          view,
          {
            x: original.x + PF2E_ELF_THEME.components.battlePresentation.shakeDistance,
            duration: duration / segments,
            ease: cue.easing,
            yoyo: true,
            repeat: segments / 2 - 1,
          },
          () => {
            view.setPosition(original.x, original.y);
          },
          () => {
            view.setPosition(original.x, original.y);
          },
        );
      }
      case 'DEATH_FADE':
        return this.addTween(view, {
          alpha: 0,
          scaleX: original.scaleX * PF2E_ELF_THEME.components.battlePresentation.deathScale,
          scaleY: original.scaleY * PF2E_ELF_THEME.components.battlePresentation.deathScale,
          duration,
          ease: cue.easing,
        });
      case 'HEAL_PULSE':
      case 'STAT_PULSE':
      case 'STATUS_PULSE': {
        const pulseScale = PF2E_ELF_THEME.components.battlePresentation.pulseScale;
        return this.addTween(
          view,
          {
            scaleX: original.scaleX * pulseScale,
            scaleY: original.scaleY * pulseScale,
            duration: duration / 2,
            ease: cue.easing,
            yoyo: true,
          },
          () => {
            view.setScale(original.scaleX, original.scaleY);
          },
          () => {
            view.setScale(original.scaleX, original.scaleY);
          },
        );
      }
      case 'DRAW_CARD':
      case 'PLACE_CARD': {
        const destination = this.callbacks.getCardPosition?.(
          cue.targetCardId,
          context.step.afterState,
        );
        const entryScale = PF2E_ELF_THEME.components.battlePresentation.entryScale;
        view.setAlpha(0.25).setScale(original.scaleX * entryScale, original.scaleY * entryScale);
        return this.addTween(
          view,
          {
            x: destination?.x ?? original.x,
            y: destination?.y ?? original.y,
            alpha: original.alpha,
            scaleX: original.scaleX,
            scaleY: original.scaleY,
            duration,
            ease: cue.easing,
          },
          () => {
            view
              .setPosition(original.x, original.y)
              .setAlpha(original.alpha)
              .setScale(original.scaleX, original.scaleY);
          },
        );
      }
      case 'MOVE_CARD': {
        const destination = this.callbacks.getCardPosition?.(
          cue.targetCardId,
          context.step.afterState,
        );

        if (destination === undefined) {
          this.reportMissingView(cue, cue.targetCardId);
          return completedPlayback();
        }

        return this.addTween(
          view,
          {
            x: destination.x,
            y: destination.y,
            duration,
            ease: cue.easing,
          },
          () => {
            view.setPosition(original.x, original.y);
          },
        );
      }
      case 'DISCARD_CARD':
        return this.addTween(
          view,
          {
            alpha: 0.2,
            scaleX: original.scaleX * PF2E_ELF_THEME.components.battlePresentation.entryScale,
            scaleY: original.scaleY * PF2E_ELF_THEME.components.battlePresentation.entryScale,
            duration,
            ease: cue.easing,
          },
          () => {
            view.setAlpha(original.alpha).setScale(original.scaleX, original.scaleY);
          },
        );
    }
  }

  private playSound(assetKey: string, cueId: string, stepId: StableId): BattleCuePlayback {
    const settings = this.settingsStore.value;

    if (settings.muted) {
      return completedPlayback();
    }

    if (!this.scene.cache.audio.exists(assetKey)) {
      this.report({
        code: 'MISSING_ASSET',
        message: `전투 SFX 자산을 찾지 못했습니다: ${assetKey}`,
        stepId,
        cueId,
        assetKey,
      });
      return completedPlayback();
    }

    if (this.scene.sound.locked) {
      this.report({
        code: 'AUDIO_BLOCKED',
        message: `브라우저 오디오가 잠겨 SFX 없이 계속합니다: ${assetKey}`,
        stepId,
        cueId,
        assetKey,
      });
      return completedPlayback();
    }

    const sound = this.scene.sound.add(assetKey, {
      volume: settings.volume,
      mute: false,
      rate: 1,
    });
    const playback = new ManagedBattleCuePlayback();
    const finish = (): void => {
      sound.off(Phaser.Sound.Events.COMPLETE, finish);
      sound.off(Phaser.Sound.Events.STOP, finish);
      sound.off(Phaser.Sound.Events.DESTROY, finish);

      if (!sound.pendingRemove) {
        sound.destroy();
      }

      playback.complete();
    };

    playback.setCancelAction(() => {
      sound.off(Phaser.Sound.Events.COMPLETE, finish);
      sound.off(Phaser.Sound.Events.STOP, finish);
      sound.off(Phaser.Sound.Events.DESTROY, finish);
      sound.stop();

      if (!sound.pendingRemove) {
        sound.destroy();
      }
    });
    this.trackSoundPlayback(playback);
    sound.once(Phaser.Sound.Events.COMPLETE, finish);
    sound.once(Phaser.Sound.Events.STOP, finish);
    sound.once(Phaser.Sound.Events.DESTROY, finish);

    if (!sound.play({ volume: settings.volume, mute: false, rate: 1 })) {
      finish();
    }

    return playback;
  }

  private playVisualFx(
    cue: VisualFxPresentationCue,
    context: BattleCuePlaybackContext,
  ): BattleCuePlayback {
    const targetView = this.resolveCueView(cue.targetCardId, cue, context);

    if (targetView === undefined) {
      return completedPlayback();
    }

    const duration = cue.durationMs / context.speed;
    const theme = PF2E_ELF_THEME.components.battlePresentation;

    if (cue.visualFx === 'ATTACK_IMPACT') {
      const impact = this.scene.add
        .circle(targetView.x, targetView.y, theme.impactRadius, theme.impactColor, 0.78)
        .setScale(theme.impactStartScale);
      this.effectsLayer.add(impact);
      this.trackTransientView(cue.stepId, impact);
      return this.addFxTween(cue.stepId, impact, {
        scale: theme.impactEndScale,
        alpha: 0,
        duration,
        ease: cue.easing,
      });
    }

    const style = this.getPopupStyle(cue, theme);
    const text = this.scene.add
      .text(targetView.x, targetView.y, cue.text ?? '', {
        color: style.color,
        fontFamily: PF2E_ELF_THEME.typography.display,
        fontSize: `${theme.popupFontSize}px`,
        fontStyle: 'bold',
        stroke: theme.popupStrokeColor,
        strokeThickness: theme.popupStrokeThickness,
      })
      .setOrigin(0.5)
      .setAlpha(0.95);
    this.effectsLayer.add(text);
    this.trackTransientView(cue.stepId, text);
    return this.addFxTween(cue.stepId, text, {
      y: text.y - theme.popupRise,
      alpha: 0,
      scale: style.scale,
      duration,
      ease: cue.easing,
    });
  }

  private getPopupStyle(
    cue: VisualFxPresentationCue,
    theme: typeof PF2E_ELF_THEME.components.battlePresentation,
  ): { readonly color: string; readonly scale: number } {
    switch (cue.visualFx) {
      case 'DAMAGE_POPUP':
        return { color: theme.damageTextColor, scale: 1.12 };
      case 'HEAL_POPUP':
        return { color: theme.healTextColor, scale: 1.12 };
      case 'STATUS_HIGHLIGHT':
        return { color: theme.statusTextColor, scale: 1.04 };
      case 'ATTACK_IMPACT':
        return { color: theme.statusTextColor, scale: 1 };
    }
  }

  private addTween(
    view: PhaserBattleCardView,
    config: BattleTweenConfig,
    onCancel?: () => void,
    onComplete?: () => void,
  ): BattleCuePlayback {
    const playback = new ManagedBattleCuePlayback();
    const tween = this.scene.tweens.add({
      targets: view,
      ...config,
      onComplete: () => {
        onComplete?.();
        playback.complete();
      },
      onStop: () => {
        playback.complete();
      },
    });

    playback.setCancelAction(() => {
      tween.remove();
      tween.destroy();
      onCancel?.();
    });
    this.trackVisualPlayback(playback);
    return playback;
  }

  private addFxTween(
    stepId: StableId,
    view: PhaserBattleVisualView,
    config: BattleTweenConfig,
  ): BattleCuePlayback {
    const playback = new ManagedBattleCuePlayback();
    const finish = (): void => {
      this.removeTransientView(stepId, view);
      this.destroyViewOnce(view);
      playback.complete();
    };
    const tween = this.scene.tweens.add({
      targets: view,
      ...config,
      onComplete: finish,
      onStop: () => undefined,
    });

    playback.setCancelAction(() => {
      tween.remove();
      tween.destroy();
      this.removeTransientView(stepId, view);
      this.destroyViewOnce(view);
    });
    this.trackVisualPlayback(playback);
    return playback;
  }

  private resolveCueView(
    cardId: StableId,
    cue: BattlePresentationCue,
    context: BattleCuePlaybackContext,
  ): PhaserBattleCardView | undefined {
    const existing = this.findView(cardId);

    if (existing !== undefined) {
      return existing;
    }

    const transient = this.callbacks.createTransientCardView?.(cardId, cue, context);

    if (transient === undefined) {
      this.reportMissingView(cue, cardId);
      return undefined;
    }

    this.effectsLayer.add(transient);
    this.trackTransientView(cue.stepId, transient);
    return transient;
  }

  private findView(cardId: StableId): PhaserBattleCardView | undefined {
    for (const retainedViews of this.retainedViewsByStep.values()) {
      const retained = retainedViews.get(cardId);

      if (retained !== undefined) {
        return retained;
      }
    }

    const pinned = this.pinnedAttackViews.get(cardId);

    if (pinned !== undefined) {
      return pinned;
    }

    return this.callbacks.getCardView(cardId);
  }

  private pinAttackView(cardId: StableId, view: PhaserBattleCardView): void {
    if (this.pinnedAttackViews.has(cardId)) {
      return;
    }

    if (view.parentContainer !== null) {
      view.parentContainer.remove(view);
    }

    this.callbacks.detachCardView(cardId, view);
    this.effectsLayer.add(view);
    this.pinnedAttackViews.set(cardId, view);
  }

  private reconcilePinnedAttackViews(state: BattleState): void {
    for (const [cardId, pinnedView] of [...this.pinnedAttackViews]) {
      const renderedView = this.callbacks.getCardView(cardId);

      if (this.completedAttackReturns.has(cardId)) {
        if (renderedView !== pinnedView) {
          this.destroyViewOnce(pinnedView);
        }

        this.pinnedAttackViews.delete(cardId);
        this.completedAttackReturns.delete(cardId);
        continue;
      }

      if (renderedView !== undefined && renderedView !== pinnedView) {
        this.callbacks.detachCardView(cardId, renderedView);
        this.destroyViewOnce(renderedView);
      }

      const currentPosition = this.callbacks.getCardPosition?.(cardId, state);

      if (currentPosition !== undefined) {
        this.attackOrigins.set(cardId, currentPosition);
      }
    }
  }

  private trackVisualPlayback(playback: ManagedBattleCuePlayback): void {
    this.activeVisualPlaybacks.add(playback);
    void playback.finished.finally(() => {
      this.activeVisualPlaybacks.delete(playback);
    });
  }

  private trackSoundPlayback(playback: ManagedBattleCuePlayback): void {
    this.activeSoundPlaybacks.add(playback);
    void playback.finished.finally(() => {
      this.activeSoundPlaybacks.delete(playback);
    });
  }

  private trackTransientView(stepId: StableId, view: PhaserBattleVisualView): void {
    const views = this.transientViewsByStep.get(stepId) ?? new Set<PhaserBattleVisualView>();
    views.add(view);
    this.transientViewsByStep.set(stepId, views);
  }

  private removeTransientView(stepId: StableId, view: PhaserBattleVisualView): void {
    const views = this.transientViewsByStep.get(stepId);
    views?.delete(view);

    if (views?.size === 0) {
      this.transientViewsByStep.delete(stepId);
    }
  }

  private destroyViewOnce(view: PhaserBattleVisualView): void {
    if (this.destroyedViews.has(view)) {
      return;
    }

    this.destroyedViews.add(view);
    view.destroy();
  }

  private reportMissingView(cue: BattlePresentationCue, cardId: StableId): void {
    this.report({
      code: 'MISSING_ASSET',
      message: `cue 대상 카드 view를 찾지 못해 연출 없이 계속합니다: ${cardId}`,
      stepId: cue.stepId,
      cueId: cue.id,
      assetKey: cardId,
    });
  }

  private report(diagnostic: BattlePresentationDiagnostic): void {
    this.onDiagnostic?.(Object.freeze({ ...diagnostic }));
  }
}
