import type * as Phaser from 'phaser';
import { GridTable, Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME, type PF2eNinePatchVisualState } from '../theme/pf2eElfTheme';
import {
  bindPF2eScrollbarThumbStates,
  createPF2eScrollbarConfig,
} from './createPF2eScrollbarConfig';
import { PF2eNinePatch2 } from './PF2eNinePatch2';

export interface PF2eGridTableItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
}

export interface PF2eGridTableConfig {
  readonly width: number;
  readonly height: number;
  readonly items: readonly PF2eGridTableItem[];
  readonly columns?: number;
  readonly initialSelectedId?: string;
  readonly scrollbarPosition?: 'left' | 'right';
  readonly onSelectionChange?: (item: PF2eGridTableItem, index: number) => void;
}

interface SelectionState {
  id?: string;
}

class PF2eGridCell extends Sizer {
  private readonly background: PF2eNinePatch2;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly detailText: Phaser.GameObjects.Text;
  private itemId = '';

  constructor(scene: Phaser.Scene, width: number, height: number) {
    const theme = PF2E_ELF_THEME.components.gridTable;
    const background = new PF2eNinePatch2(scene, {
      variant: 'gridCell',
      width: 2,
      height: 2,
    });
    const titleText = scene.add.text(0, 0, '', {
      color: PF2E_ELF_THEME.colors.text,
      fontFamily: PF2E_ELF_THEME.typography.display,
      fontSize: `${theme.titleFontSize}px`,
      fontStyle: 'bold',
    });
    const detailText = scene.add.text(0, 0, '', {
      color: PF2E_ELF_THEME.colors.mutedText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${theme.detailFontSize}px`,
    });

    super(scene, {
      width,
      height,
      orientation: 'y',
      space: {
        left: theme.cellInsetX,
        right: theme.cellInsetX,
        top: theme.cellInsetY,
        bottom: theme.cellInsetY,
        item: Math.round(theme.cellGap / 2),
      },
    });

    scene.add.existing(this);
    this.background = background;
    this.titleText = titleText;
    this.detailText = detailText;

    this.addBackground(background)
      .add(titleText, { align: 'left' })
      .add(detailText, { align: 'left' });
  }

  get id(): string {
    return this.itemId;
  }

  setItem(item: PF2eGridTableItem): this {
    this.itemId = item.id;
    this.setName(item.id);
    this.titleText.setText(item.title);
    this.detailText.setText(item.detail);
    return this;
  }

  setVisualState(state: PF2eNinePatchVisualState): this {
    this.background.setVisualState(state);
    return this;
  }
}

export class PF2eGridTable extends GridTable {
  private readonly itemById = new Map<string, PF2eGridTableItem>();
  private readonly selection: SelectionState;
  private readonly onSelectionChange?: (item: PF2eGridTableItem, index: number) => void;

  constructor(scene: Phaser.Scene, config: PF2eGridTableConfig) {
    const theme = PF2E_ELF_THEME.components.gridTable;
    const columns = Math.max(1, Math.round(config.columns ?? theme.columns));
    const scrollbar = createPF2eScrollbarConfig(scene, config.scrollbarPosition ?? 'right', true);
    const tableWidth =
      config.width -
      PF2E_ELF_THEME.sizes.scrollbar -
      PF2E_ELF_THEME.components.scrollablePanel.sliderGap;
    const cellWidth = Math.max(120, Math.floor(tableWidth / columns));
    const selection: SelectionState = {
      id: config.initialSelectedId,
    };

    super(scene, {
      width: config.width,
      height: config.height,
      scrollMode: 'vertical',
      table: {
        cellWidth,
        cellHeight: theme.cellHeight,
        columns,
        reuseCellContainer: true,
        mask: {
          padding: PF2E_ELF_THEME.components.scrollablePanel.maskPadding,
          maskType: 'stencil',
        },
        click: {
          mode: 'release',
          threshold: 10,
        },
        over: {
          mode: 'pointer',
        },
      },
      items: [...config.items],
      createCellContainerCallback: (cell, cellContainer): PF2eGridCell => {
        if (!isPF2eGridTableItem(cell.item)) {
          throw new Error('PF2eGridTable received an invalid item');
        }
        const container =
          cellContainer instanceof PF2eGridCell
            ? cellContainer
            : new PF2eGridCell(
                scene,
                Math.max(1, cell.width - theme.cellGap),
                Math.max(1, cell.height - theme.cellGap),
              );
        return container
          .setItem(cell.item)
          .setVisualState(cell.item.id === selection.id ? 'selected' : 'idle')
          .layout();
      },
      slider: scrollbar.config,
      scroller: {
        threshold: PF2E_ELF_THEME.components.scrollablePanel.dragThreshold,
        pointerOutRelease: true,
      },
      mouseWheelScroller: {
        focus: true,
        speed: PF2E_ELF_THEME.components.scrollablePanel.wheelSpeed,
      },
      clampChildOY: true,
      space: {
        sliderY: PF2E_ELF_THEME.components.scrollablePanel.sliderGap,
      },
    });

    scene.add.existing(this);
    bindPF2eScrollbarThumbStates(scrollbar.thumb);
    this.selection = selection;
    for (const item of config.items) {
      if (this.itemById.has(item.id)) {
        throw new Error(`Duplicate PF2e grid-table item id: ${item.id}`);
      }
      this.itemById.set(item.id, item);
    }
    if (this.selection.id !== undefined && !this.itemById.has(this.selection.id)) {
      throw new Error(`Unknown initial PF2e grid-table item: ${this.selection.id}`);
    }
    this.onSelectionChange = config.onSelectionChange;

    this.on('cell.over', this.handleCellOver)
      .on('cell.out', this.handleCellOut)
      .on('cell.down', this.handleCellDown)
      .on('cell.up', this.handleCellUp)
      .on('cell.click', this.handleCellClick);
  }

  get selectedItemId(): string | undefined {
    return this.selection.id;
  }

  setSelectedItem(itemId: string | undefined): this {
    if (itemId !== undefined && !this.itemById.has(itemId)) {
      throw new Error(`Unknown PF2e grid-table item: ${itemId}`);
    }
    this.selection.id = itemId;
    this.refresh();
    return this;
  }

  private readonly handleCellOver = (cell: PF2eGridCell): void => {
    cell.setVisualState(cell.id === this.selection.id ? 'selected' : 'hover');
  };

  private readonly handleCellOut = (cell: PF2eGridCell): void => {
    cell.setVisualState(cell.id === this.selection.id ? 'selected' : 'idle');
  };

  private readonly handleCellDown = (cell: PF2eGridCell): void => {
    cell.setVisualState('pressed');
  };

  private readonly handleCellUp = (cell: PF2eGridCell): void => {
    cell.setVisualState(cell.id === this.selection.id ? 'selected' : 'hover');
  };

  private readonly handleCellClick = (cell: PF2eGridCell, index: number): void => {
    const item = this.itemById.get(cell.id);
    if (!item) {
      return;
    }
    this.selection.id = item.id;
    this.refresh();
    this.onSelectionChange?.(item, index);
  };
}

function isPF2eGridTableItem(value: unknown): value is PF2eGridTableItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'title' in value &&
    typeof value.title === 'string' &&
    'detail' in value &&
    typeof value.detail === 'string'
  );
}
