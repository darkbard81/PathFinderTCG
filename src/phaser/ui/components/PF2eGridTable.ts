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
  readonly scrollbarPosition?: 'left' | 'right';
}

export class PF2eGridCell extends Sizer {
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
  private readonly visualStateByItemId: Map<string, PF2eNinePatchVisualState>;

  constructor(scene: Phaser.Scene, config: PF2eGridTableConfig) {
    const theme = PF2E_ELF_THEME.components.gridTable;
    const columns = Math.max(1, Math.round(config.columns ?? theme.columns));
    const scrollbar = createPF2eScrollbarConfig(scene, config.scrollbarPosition ?? 'right', true);
    const tableWidth =
      config.width -
      PF2E_ELF_THEME.sizes.scrollbar -
      PF2E_ELF_THEME.components.scrollablePanel.sliderGap;
    const cellWidth = Math.max(120, Math.floor(tableWidth / columns));
    const visualStateByItemId = new Map<string, PF2eNinePatchVisualState>();

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
          .setVisualState(visualStateByItemId.get(cell.item.id) ?? 'idle')
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
    this.visualStateByItemId = visualStateByItemId;
  }

  setItemVisualState(itemId: string, state: PF2eNinePatchVisualState): this {
    this.visualStateByItemId.set(itemId, state);
    return this;
  }

  refreshItemVisualStates(): this {
    this.refresh();
    return this;
  }
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
