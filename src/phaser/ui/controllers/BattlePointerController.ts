import * as Phaser from 'phaser';

import type { StableId } from '../../../game/data/index.js';
import {
  locateBattleCard,
  type BattleAction,
  type BattleState,
} from '../../../game/simulation/battle/index.js';
import type { PF2eBattleBoard } from '../components/PF2eBattleBoard.js';
import type { PF2eBattleSlot } from '../components/PF2eBattleSlot.js';
import { PF2eCard } from '../components/PF2eCard.js';
import type { PF2eHandDeck } from '../components/PF2eHandDeck.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import {
  findDirectBattleAction,
  getDirectActiveSkillSourceIds,
  getDirectCardTargets,
} from './battlePointerActions.js';

export interface BattlePointerControllerConfig {
  readonly board: PF2eBattleBoard;
  readonly handDeck: PF2eHandDeck;
  readonly state: BattleState;
  readonly actions: readonly BattleAction[];
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly viewportPadding: number;
  readonly handExpandedY: number;
  readonly handCollapsedY: number;
  readonly handHoverTop: number;
  readonly handPeekTop: number;
  readonly previewCardWidth: number;
  readonly isEnabled: () => boolean;
  readonly onAction: (action: BattleAction) => void;
  readonly onStatus: (message: string, danger?: boolean) => void;
  readonly onSelectionChange?: (
    selectedCardId: StableId | undefined,
    activeSkillSourceCardId: StableId | undefined,
  ) => void;
  readonly onHandExpandedChange?: (expanded: boolean) => void;
}

interface CardHandlers {
  readonly over: (pointer: Phaser.Input.Pointer) => void;
  readonly out: () => void;
  readonly down: (pointer: Phaser.Input.Pointer) => void;
}

interface PendingCardPointer {
  readonly pointerId: number;
  readonly cardId: StableId;
  readonly card: PF2eCard;
  readonly draggable: boolean;
  readonly startX: number;
  readonly startY: number;
}

interface SlotHandlers {
  readonly up: () => void;
}

const ACTIVE_HOLD_DURATION_MS = 1_000;

/**
 * 전장 카드, 슬롯과 popup HandDeck의 포인터 입력을 합법 BattleAction으로 변환한다.
 */
export class BattlePointerController {
  private readonly scene: Phaser.Scene;
  private readonly board: PF2eBattleBoard;
  private readonly handDeck: PF2eHandDeck;
  private readonly state: BattleState;
  private readonly actions: readonly BattleAction[];
  private readonly viewportWidth: number;
  private readonly viewportHeight: number;
  private readonly viewportPadding: number;
  private readonly handExpandedY: number;
  private readonly handCollapsedY: number;
  private readonly handHoverTop: number;
  private readonly handPeekTop: number;
  private readonly previewCardWidth: number;
  private readonly isEnabled: () => boolean;
  private readonly onAction: (action: BattleAction) => void;
  private readonly onStatus: (message: string, danger?: boolean) => void;
  private readonly onSelectionChange?: BattlePointerControllerConfig['onSelectionChange'];
  private readonly onHandExpandedChange?: BattlePointerControllerConfig['onHandExpandedChange'];
  private readonly cardHandlers = new Map<PF2eCard, CardHandlers>();
  private readonly slotHandlers = new Map<PF2eBattleSlot, SlotHandlers>();
  private selectedCardId?: StableId;
  private activeSkillSourceCardId?: StableId;
  private preview?: PF2eCard;
  private dragPreview?: PF2eCard;
  private pendingCardPointer?: PendingCardPointer;
  private draggedCardId?: StableId;
  private suppressTargetTap = false;
  private handExpanded = false;
  private handTargetY?: number;
  private activeHoldTimer?: Phaser.Time.TimerEvent;
  private activeHoldTriggered = false;

  constructor(scene: Phaser.Scene, config: BattlePointerControllerConfig) {
    this.scene = scene;
    this.board = config.board;
    this.handDeck = config.handDeck;
    this.state = config.state;
    this.actions = config.actions;
    this.viewportWidth = config.viewportWidth;
    this.viewportHeight = config.viewportHeight;
    this.viewportPadding = config.viewportPadding;
    this.handExpandedY = config.handExpandedY;
    this.handCollapsedY = config.handCollapsedY;
    this.handHoverTop = config.handHoverTop;
    this.handPeekTop = config.handPeekTop;
    this.previewCardWidth = config.previewCardWidth;
    this.isEnabled = config.isEnabled;
    this.onAction = config.onAction;
    this.onStatus = config.onStatus;
    this.onSelectionChange = config.onSelectionChange;
    this.onHandExpandedChange = config.onHandExpandedChange;

    for (const [cardId, card] of this.board.getCardEntries()) {
      this.bindCard(cardId, card, false);
    }
    for (const [cardId, card] of this.handDeck.getCardEntries()) {
      this.bindCard(cardId, card, true);
    }
    for (const slot of this.board.getSlots()) {
      this.bindSlot(slot);
    }
    this.handDeck.handleView.setInteractive({ useHandCursor: true });
    this.scene.input
      .on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove)
      .on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp);
    this.setHandExpanded(false, false);
    this.refreshHighlights();
  }

  update(pointer: Phaser.Input.Pointer): void {
    if (this.draggedCardId !== undefined) {
      this.setHandExpanded(true);
      return;
    }
    if (!pointer.wasTouch) {
      const hoverTop = this.handExpanded ? this.handHoverTop : this.handPeekTop;
      const withinFixedHoverZone =
        pointer.worldX >= this.viewportPadding &&
        pointer.worldX <= this.viewportWidth - this.viewportPadding &&
        pointer.worldY >= hoverTop &&
        pointer.worldY <= this.viewportHeight - this.viewportPadding;
      this.setHandExpanded(withinFixedHoverZone);
    }
  }

  requestEndTurn(): BattleAction | undefined {
    if (!this.isEnabled()) {
      return undefined;
    }
    const action = findDirectBattleAction(this.actions, { type: 'END_TURN' });
    if (action === undefined) {
      this.onStatus('현재 선택으로는 턴을 종료할 수 없습니다.', true);
      return undefined;
    }
    this.emitAction(action);
    return action;
  }

  destroy(): void {
    for (const [card, handlers] of this.cardHandlers) {
      card
        .off(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, handlers.over)
        .off(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, handlers.out)
        .off(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, handlers.down);
      card.removeInteractive();
    }
    this.cardHandlers.clear();
    for (const [slot, handlers] of this.slotHandlers) {
      slot.off(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, handlers.up).removeInteractive();
    }
    this.slotHandlers.clear();
    this.handDeck.handleView.removeInteractive();
    this.scene.input
      .off(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove)
      .off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp);
    this.scene.tweens.killTweensOf(this.handDeck);
    this.cancelActiveHold();
    this.preview?.destroy();
    this.dragPreview?.destroy();
    this.preview = undefined;
    this.dragPreview = undefined;
    this.pendingCardPointer = undefined;
    this.draggedCardId = undefined;
  }

  private bindCard(cardId: StableId, card: PF2eCard, inHand: boolean): void {
    const location = locateBattleCard(this.state, cardId);
    const draggable = location.playerId === 'PLAYER' && (inHand || location.zone === 'FIELD');
    const handlers: CardHandlers = {
      over: () => {
        this.showPreview(cardId);
      },
      out: () => {
        if (this.selectedCardId !== cardId) {
          this.hidePreview();
        }
      },
      down: (pointer) => {
        this.cancelActiveHold();
        this.activeHoldTriggered = false;
        this.pendingCardPointer = {
          pointerId: pointer.id,
          cardId,
          card,
          draggable,
          startX: pointer.worldX,
          startY: pointer.worldY,
        };
        this.startActiveHold(pointer, cardId, card, inHand);
      },
    };
    card
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, handlers.over)
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, handlers.out)
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, handlers.down);
    this.cardHandlers.set(card, handlers);
  }

  private bindSlot(slot: PF2eBattleSlot): void {
    const handlers: SlotHandlers = {
      up: () => {
        if (!this.suppressTargetTap) {
          this.handleSlotTap(slot);
        }
      },
    };
    slot
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, handlers.up);
    this.slotHandlers.set(slot, handlers);
  }

  private handleCardTap(cardId: StableId): void {
    if (!this.isEnabled()) {
      return;
    }
    if (this.activeSkillSourceCardId !== undefined) {
      if (cardId === this.activeSkillSourceCardId) {
        this.activeSkillSourceCardId = undefined;
        this.onStatus('Active 대상 선택을 취소했습니다.');
        this.refreshHighlights();
        this.onSelectionChange?.(this.selectedCardId, undefined);
        return;
      }

      const active = findDirectBattleAction(this.actions, {
        type: 'ACTIVE',
        cardId: this.activeSkillSourceCardId,
        targetCardId: cardId,
      });
      if (active !== undefined) {
        this.emitAction(active);
        return;
      }
      this.onStatus('강조된 카드만 Active 대상으로 선택할 수 있습니다.', true);
      return;
    }

    if (this.selectedCardId !== undefined && this.selectedCardId !== cardId) {
      const attack = findDirectBattleAction(this.actions, {
        type: 'ATTACK',
        cardId: this.selectedCardId,
        targetCardId: cardId,
      });
      if (attack !== undefined) {
        this.emitAction(attack);
        return;
      }
    }

    const location = locateBattleCard(this.state, cardId);
    if (location.playerId !== 'PLAYER' || (location.zone !== 'HAND' && location.zone !== 'FIELD')) {
      this.showPreview(cardId);
      this.onStatus('먼저 내 손패 또는 전장 카드를 선택하세요.');
      return;
    }

    const activeSources = getDirectActiveSkillSourceIds(this.actions);
    this.selectedCardId = cardId;
    this.activeSkillSourceCardId = undefined;
    this.onStatus(
      activeSources.includes(cardId)
        ? '카드 선택됨 · 1초간 누르면 Active, 대상까지 드래그하면 기본 Action'
        : '카드 선택됨 · 합법 target을 누르거나 드래그하세요.',
    );
    this.showPreview(cardId);
    this.refreshHighlights();
    this.onSelectionChange?.(this.selectedCardId, this.activeSkillSourceCardId);
  }

  private handleSlotTap(slot: PF2eBattleSlot): void {
    const selectedCardId = this.selectedCardId;
    if (!this.isEnabled() || selectedCardId === undefined || slot.playerId !== 'PLAYER') {
      return;
    }
    if (this.activeSkillSourceCardId !== undefined) {
      this.onStatus('강조된 카드 중 Active 대상을 선택하세요.', true);
      return;
    }
    const location = locateBattleCard(this.state, selectedCardId);
    const action =
      location.zone === 'HAND'
        ? findDirectBattleAction(this.actions, {
            type: 'PLACE',
            cardId: selectedCardId,
            fieldPosition: slot.fieldPosition,
          })
        : findDirectBattleAction(this.actions, {
            type: 'MOVE',
            cardId: selectedCardId,
            fieldPosition: slot.fieldPosition,
          });
    if (action === undefined) {
      this.onStatus('선택한 카드가 이동할 수 없는 Field입니다.', true);
      return;
    }
    this.emitAction(action);
  }

  private handleDragStart(cardId: StableId, pointer: Phaser.Input.Pointer): void {
    if (!this.isEnabled()) {
      return;
    }
    this.cancelActiveHold();
    this.draggedCardId = cardId;
    this.suppressTargetTap = true;
    this.selectedCardId = cardId;
    this.activeSkillSourceCardId = undefined;
    this.setHandExpanded(true);
    const model =
      this.handDeck.getCardModel(cardId) ?? this.board.createCardModel(this.state, cardId);
    this.dragPreview = new PF2eCard(this.scene, {
      card: model.card,
      width: Math.min(this.previewCardWidth, PF2E_ELF_THEME.components.card.maximumWidth),
      compact: true,
    })
      .setAlpha(PF2E_ELF_THEME.components.battleDirect.dragPreviewAlpha)
      .setDepth(PF2E_ELF_THEME.components.battleDirect.dragPreviewDepth)
      .setPosition(pointer.worldX, pointer.worldY)
      .layout();
    this.refreshHighlights();
  }

  private handleDragEnd(cardId: StableId, pointer: Phaser.Input.Pointer): void {
    if (this.draggedCardId !== cardId) {
      return;
    }
    this.suppressTargetTap = true;
    this.scene.time.delayedCall(0, () => {
      this.suppressTargetTap = false;
    });
    this.dragPreview?.destroy();
    this.dragPreview = undefined;
    this.draggedCardId = undefined;

    const enemyTarget = this.board
      .getCardEntries()
      .find(
        ([targetId, card]) =>
          targetId !== cardId && card.getBounds().contains(pointer.worldX, pointer.worldY),
      );
    if (enemyTarget !== undefined) {
      const attack = findDirectBattleAction(this.actions, {
        type: 'ATTACK',
        cardId,
        targetCardId: enemyTarget[0],
      });
      if (attack !== undefined) {
        this.emitAction(attack);
        return;
      }
    }

    const slot = this.board
      .getSlots()
      .find((candidate) => candidate.getBounds().contains(pointer.worldX, pointer.worldY));
    if (slot !== undefined) {
      this.handleSlotTap(slot);
      return;
    }

    this.onStatus('합법 target 위에 카드를 놓아야 합니다.', true);
    this.refreshHighlights();
  }

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    const pending = this.pendingCardPointer;
    if (
      pending === undefined ||
      pending.pointerId !== pointer.id ||
      !pending.draggable ||
      !pointer.isDown ||
      this.activeHoldTriggered
    ) {
      return;
    }

    if (this.draggedCardId === undefined) {
      const distance = Phaser.Math.Distance.Between(
        pending.startX,
        pending.startY,
        pointer.worldX,
        pointer.worldY,
      );
      if (distance < PF2E_ELF_THEME.components.battleDirect.dragThreshold) {
        return;
      }
      this.cancelActiveHold();
      this.handleDragStart(pending.cardId, pointer);
    }
    this.dragPreview?.setPosition(pointer.worldX, pointer.worldY);
  };

  private readonly handlePointerUp = (pointer: Phaser.Input.Pointer): void => {
    this.cancelActiveHold();
    if (this.draggedCardId === undefined && this.isPointerOnHandHandle(pointer)) {
      this.pendingCardPointer = undefined;
      this.handleHandToggle();
      return;
    }
    const pending = this.pendingCardPointer;
    if (pending === undefined) {
      return;
    }
    if (pending.pointerId !== pointer.id) {
      return;
    }
    this.pendingCardPointer = undefined;

    if (this.activeHoldTriggered) {
      this.activeHoldTriggered = false;
      return;
    }
    if (this.draggedCardId === pending.cardId) {
      this.handleDragEnd(pending.cardId, pointer);
      return;
    }
    if (pending.card.getBounds().contains(pointer.worldX, pointer.worldY)) {
      this.handleCardTap(pending.cardId);
    }
  };

  private isPointerOnHandHandle(pointer: Phaser.Input.Pointer): boolean {
    const theme = PF2E_ELF_THEME.components.battleDirect;
    const handleWidth = Math.min(
      this.viewportWidth - this.viewportPadding * 2 - theme.handInset * 2,
      380,
    );
    const handleHeight = Math.max(theme.handHandleHeight, PF2E_ELF_THEME.label.status.minHeight);
    const handleTop = (this.handExpanded ? this.handHoverTop : this.handPeekTop) + 4;
    return (
      pointer.worldX >= (this.viewportWidth - handleWidth) / 2 &&
      pointer.worldX <= (this.viewportWidth + handleWidth) / 2 &&
      pointer.worldY >= handleTop &&
      pointer.worldY <= handleTop + handleHeight
    );
  }

  private emitAction(action: BattleAction): void {
    this.selectedCardId = undefined;
    this.activeSkillSourceCardId = undefined;
    this.hidePreview();
    this.refreshHighlights();
    this.onSelectionChange?.(undefined, undefined);
    this.onAction(action);
  }

  private refreshHighlights(): void {
    for (const [, card] of this.board.getCardEntries()) {
      card.setSelectionState('idle');
    }
    for (const [cardId] of this.handDeck.getCardEntries()) {
      this.handDeck.setCardState(cardId, 'idle');
    }
    for (const slot of this.board.getSlots()) {
      slot.setTargetState('idle');
    }

    if (this.selectedCardId === undefined) {
      return;
    }
    this.board.getCardView(this.selectedCardId)?.setSelectionState('selected');
    this.handDeck.setCardState(this.selectedCardId, 'selected');
    const targets = getDirectCardTargets(
      this.actions,
      this.selectedCardId,
      this.activeSkillSourceCardId,
    );
    for (const slot of this.board.getSlots()) {
      if (slot.playerId === 'PLAYER' && targets.fieldPositions.includes(slot.fieldPosition)) {
        slot.setTargetState('legal-target');
      }
    }
    for (const targetCardId of targets.targetCardIds) {
      this.board.getCardView(targetCardId)?.setSelectionState('legal-target');
    }
  }

  private startActiveHold(
    pointer: Phaser.Input.Pointer,
    cardId: StableId,
    card: PF2eCard,
    inHand: boolean,
  ): void {
    if (
      inHand ||
      !this.isEnabled() ||
      !getDirectActiveSkillSourceIds(this.actions).includes(cardId)
    ) {
      return;
    }

    this.activeHoldTimer = this.scene.time.delayedCall(ACTIVE_HOLD_DURATION_MS, () => {
      const pending = this.pendingCardPointer;
      if (
        pending === undefined ||
        pending.pointerId !== pointer.id ||
        pending.cardId !== cardId ||
        this.draggedCardId !== undefined ||
        !pointer.isDown ||
        !card.getBounds().contains(pointer.worldX, pointer.worldY) ||
        !this.isEnabled()
      ) {
        return;
      }

      this.activeHoldTimer = undefined;
      this.activeHoldTriggered = true;
      this.activateHeldCard(cardId);
    });
  }

  private activateHeldCard(cardId: StableId): void {
    const immediate = findDirectBattleAction(this.actions, {
      type: 'ACTIVE',
      cardId,
    });
    if (immediate !== undefined) {
      this.onStatus('Active Skill을 발동합니다.');
      this.emitAction(immediate);
      return;
    }

    const targets = getDirectCardTargets(this.actions, cardId, cardId);
    if (targets.targetCardIds.length === 0) {
      this.onStatus('현재 선택할 수 있는 Active 대상이 없습니다.', true);
      return;
    }

    this.selectedCardId = cardId;
    this.activeSkillSourceCardId = cardId;
    this.showPreview(cardId);
    this.refreshHighlights();
    this.onStatus('Active Skill 준비됨 · 강조된 대상을 선택하세요.');
    this.onSelectionChange?.(cardId, cardId);
  }

  private cancelActiveHold(): void {
    this.activeHoldTimer?.remove(false);
    this.activeHoldTimer = undefined;
  }

  private showPreview(cardId: StableId): void {
    const model =
      this.handDeck.getCardModel(cardId) ?? this.board.createCardModel(this.state, cardId);
    this.preview?.destroy();
    const preview = new PF2eCard(this.scene, {
      card: model.card,
      width: this.previewCardWidth,
      compact: true,
    })
      .setAlpha(PF2E_ELF_THEME.components.battleDirect.previewAlpha)
      .setDepth(PF2E_ELF_THEME.components.battleDirect.previewDepth)
      .layout();
    const source = this.handDeck.getCardView(cardId) ?? this.board.getCardView(cardId);
    const previewHeight = preview.height;
    const x =
      (source?.x ?? 0) < this.viewportWidth / 2
        ? this.viewportWidth - this.viewportPadding - preview.width / 2
        : this.viewportPadding + preview.width / 2;
    const y = Phaser.Math.Clamp(
      source?.y ?? this.viewportHeight / 2,
      this.viewportPadding + previewHeight / 2,
      this.viewportHeight - this.viewportPadding - previewHeight / 2,
    );
    preview.setPosition(x, y);
    this.preview = preview;
  }

  private hidePreview(): void {
    this.preview?.destroy();
    this.preview = undefined;
  }

  private readonly handleHandToggle = (): void => {
    this.setHandExpanded(!this.handExpanded);
  };

  private setHandExpanded(expanded: boolean, animate = true): void {
    const targetY = expanded ? this.handExpandedY : this.handCollapsedY;
    if (this.handTargetY === targetY) {
      return;
    }
    this.handExpanded = expanded;
    this.handTargetY = targetY;
    this.scene.tweens.killTweensOf(this.handDeck);
    if (animate) {
      this.scene.tweens.add({
        targets: this.handDeck,
        y: targetY,
        duration: PF2E_ELF_THEME.components.battleDirect.handTweenDuration,
        ease: 'Sine.easeOut',
      });
    } else {
      this.handDeck.setY(targetY);
    }
    this.onHandExpandedChange?.(expanded);
  }
}
