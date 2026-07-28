import * as Phaser from 'phaser';

import { PF2eCard } from '../components/PF2eCard.js';
import type {
  PF2eCardGrid,
  PF2eCardGridCell,
  PF2eCardGridItem,
} from '../components/PF2eCardGrid.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';

export type PF2eCardGridRole = 'collection' | 'deck';

export interface PF2eCardGridTransfer {
  readonly cardId: string;
  readonly from: PF2eCardGridRole;
  readonly to: PF2eCardGridRole;
  readonly input: 'click' | 'drag';
}

export interface PF2eCardGridPointerControllerConfig {
  readonly collection: PF2eCardGrid;
  readonly deck: PF2eCardGrid;
  readonly isEnabled?: () => boolean;
  readonly onTransfer: (transfer: PF2eCardGridTransfer) => void;
}

interface PendingPointer {
  readonly pointerId: number;
  readonly role: PF2eCardGridRole;
  readonly grid: PF2eCardGrid;
  readonly cell: PF2eCardGridCell;
  readonly item: PF2eCardGridItem;
  readonly startX: number;
  readonly startY: number;
}

/**
 * 카드 갤러리의 탭과 두 영역 사이 drag를 덱 편집 의도로 변환한다.
 */
export class PF2eCardGridPointerController {
  private readonly scene: Phaser.Scene;
  private readonly collection: PF2eCardGrid;
  private readonly deck: PF2eCardGrid;
  private readonly isEnabled: () => boolean;
  private readonly onTransfer: (transfer: PF2eCardGridTransfer) => void;
  private pending?: PendingPointer;
  private preview?: PF2eCard;
  private dragged = false;
  private ignoreClickId?: string;

  constructor(scene: Phaser.Scene, config: PF2eCardGridPointerControllerConfig) {
    this.scene = scene;
    this.collection = config.collection;
    this.deck = config.deck;
    this.isEnabled = config.isEnabled ?? (() => true);
    this.onTransfer = config.onTransfer;
    this.bindGrid(this.collection, 'collection');
    this.bindGrid(this.deck, 'deck');
    scene.input
      .on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove)
      .on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp);
  }

  destroy(): void {
    this.unbindGrid(this.collection);
    this.unbindGrid(this.deck);
    this.scene.input
      .off(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove)
      .off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp);
    this.finishPointer();
  }

  private bindGrid(grid: PF2eCardGrid, role: PF2eCardGridRole): void {
    const downHandler =
      role === 'collection' ? this.handleCollectionCellDown : this.handleDeckCellDown;
    const clickHandler =
      role === 'collection' ? this.handleCollectionCellClick : this.handleDeckCellClick;
    grid
      .on('cell.over', this.handleCellOver)
      .on('cell.out', this.handleCellOut)
      .on('cell.down', downHandler)
      .on('cell.up', this.handleCellUp)
      .on('cell.click', clickHandler);
  }

  private unbindGrid(grid: PF2eCardGrid): void {
    const isCollection = grid === this.collection;
    grid
      .off('cell.over', this.handleCellOver)
      .off('cell.out', this.handleCellOut)
      .off('cell.down', isCollection ? this.handleCollectionCellDown : this.handleDeckCellDown)
      .off('cell.up', this.handleCellUp)
      .off('cell.click', isCollection ? this.handleCollectionCellClick : this.handleDeckCellClick);
  }

  private readonly handleCellOver = (cell: PF2eCardGridCell): void => {
    if (this.isEnabled() && this.pending === undefined) {
      cell.setVisualState('hover');
    }
  };

  private readonly handleCellOut = (cell: PF2eCardGridCell): void => {
    if (this.pending?.cell !== cell) {
      cell.setVisualState('idle');
    }
  };

  private beginPointer(
    role: PF2eCardGridRole,
    grid: PF2eCardGrid,
    cell: PF2eCardGridCell,
    pointer: Phaser.Input.Pointer,
  ): void {
    if (!this.isEnabled()) {
      return;
    }
    this.pending = {
      pointerId: pointer.id,
      role,
      grid,
      cell,
      item: cell.item,
      startX: pointer.worldX,
      startY: pointer.worldY,
    };
    this.dragged = false;
    cell.setVisualState('pressed');
  }

  private readonly handleCollectionCellDown = (
    cell: PF2eCardGridCell,
    _index: number,
    pointer: Phaser.Input.Pointer,
  ): void => {
    this.beginPointer('collection', this.collection, cell, pointer);
  };

  private readonly handleDeckCellDown = (
    cell: PF2eCardGridCell,
    _index: number,
    pointer: Phaser.Input.Pointer,
  ): void => {
    this.beginPointer('deck', this.deck, cell, pointer);
  };

  private readonly handleCellUp = (cell: PF2eCardGridCell): void => {
    if (this.pending?.cell === cell && !this.dragged) {
      cell.setVisualState('hover');
    }
  };

  private transferFromClick(role: PF2eCardGridRole, cell: PF2eCardGridCell): void {
    if (!this.isEnabled() || this.ignoreClickId === cell.id) {
      return;
    }
    this.onTransfer({
      cardId: cell.id,
      from: role,
      to: role === 'collection' ? 'deck' : 'collection',
      input: 'click',
    });
  }

  private readonly handleCollectionCellClick = (cell: PF2eCardGridCell): void => {
    this.transferFromClick('collection', cell);
  };

  private readonly handleDeckCellClick = (cell: PF2eCardGridCell): void => {
    this.transferFromClick('deck', cell);
  };

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    const pending = this.pending;
    if (pending === undefined || pending.pointerId !== pointer.id || !pointer.isDown) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(
      pending.startX,
      pending.startY,
      pointer.worldX,
      pointer.worldY,
    );
    if (!this.dragged && distance >= PF2E_ELF_THEME.components.cardGrid.dragThreshold) {
      this.dragged = true;
      pending.grid.setScrollerEnable(false);
      this.preview = new PF2eCard(this.scene, {
        card: pending.item.card,
        width: PF2E_ELF_THEME.components.cardGrid.dragPreviewWidth,
        compact: true,
      })
        .setAlpha(PF2E_ELF_THEME.components.cardGrid.dragPreviewAlpha)
        .setDepth(PF2E_ELF_THEME.components.cardGrid.dragPreviewDepth)
        .setPosition(pointer.worldX, pointer.worldY)
        .layout();
    }
    this.preview?.setPosition(pointer.worldX, pointer.worldY);
  };

  private readonly handlePointerUp = (pointer: Phaser.Input.Pointer): void => {
    const pending = this.pending;
    if (pending === undefined || pending.pointerId !== pointer.id) {
      return;
    }

    if (this.dragged) {
      const target = this.resolveDropRole(pointer.worldX, pointer.worldY);
      this.ignoreClickId = pending.item.id;
      this.scene.time.delayedCall(0, () => {
        this.ignoreClickId = undefined;
      });
      if (target !== undefined && target !== pending.role && this.isEnabled()) {
        this.onTransfer({
          cardId: pending.item.id,
          from: pending.role,
          to: target,
          input: 'drag',
        });
      }
    }

    this.finishPointer();
  };

  private resolveDropRole(x: number, y: number): PF2eCardGridRole | undefined {
    if (this.deck.getBounds().contains(x, y)) {
      return 'deck';
    }
    if (this.collection.getBounds().contains(x, y)) {
      return 'collection';
    }
    return undefined;
  }

  private finishPointer(): void {
    this.pending?.grid.setScrollerEnable(true);
    this.pending?.cell.setVisualState('idle');
    this.pending = undefined;
    this.dragged = false;
    this.preview?.destroy();
    this.preview = undefined;
  }
}
