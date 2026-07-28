import type * as Phaser from 'phaser';
import { GridTable, Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { CardDisplayModel } from '../../../game/cards/cardDisplay.js';
import { PF2E_ELF_THEME, type PF2eVisualState } from '../theme/pf2eElfTheme.js';
import {
  bindPF2eScrollbarThumbStates,
  createPF2eScrollbarConfig,
} from './createPF2eScrollbarConfig.js';
import { PF2eCard } from './PF2eCard.js';
import { PF2eSurface } from './PF2eSurface.js';

export interface PF2eCardGridItem {
  readonly id: string;
  readonly card: CardDisplayModel;
  readonly caption: string;
}

export interface PF2eCardGridConfig {
  readonly width: number;
  readonly height: number;
  readonly items: readonly PF2eCardGridItem[];
  readonly columns: number;
  readonly cardWidth: number;
}

export class PF2eCardGridCell extends Sizer {
  private readonly background: PF2eSurface;
  private readonly card: PF2eCard;
  private readonly captionText: Phaser.GameObjects.Text;
  private itemValue: PF2eCardGridItem;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    cardWidth: number,
    item: PF2eCardGridItem,
  ) {
    const background = new PF2eSurface(scene, {
      variant: 'gridCell',
      width: 2,
      height: 2,
    });
    const card = new PF2eCard(scene, {
      card: item.card,
      width: cardWidth,
      compact: true,
    });
    const captionText = scene.add.text(0, 0, item.caption, {
      color: PF2E_ELF_THEME.colors.accentText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${PF2E_ELF_THEME.components.cardGrid.captionFontSize}px`,
      fontStyle: 'bold',
      align: 'center',
      wordWrap: {
        width: cardWidth,
        useAdvancedWrap: true,
      },
    });

    super(scene, {
      width,
      height,
      orientation: 'y',
      space: {
        left: PF2E_ELF_THEME.components.cardGrid.cellInset,
        right: PF2E_ELF_THEME.components.cardGrid.cellInset,
        top: PF2E_ELF_THEME.components.cardGrid.cellInset,
        bottom: PF2E_ELF_THEME.components.cardGrid.cellInset,
        item: PF2E_ELF_THEME.components.cardGrid.captionGap,
      },
    });

    scene.add.existing(this);
    this.background = background;
    this.card = card;
    this.captionText = captionText;
    this.itemValue = item;
    this.addBackground(background)
      .add(card, { align: 'center' })
      .add(captionText, { align: 'center' });
    this.setItem(item);
  }

  get id(): string {
    return this.itemValue.id;
  }

  get item(): PF2eCardGridItem {
    return this.itemValue;
  }

  setItem(item: PF2eCardGridItem): this {
    this.itemValue = item;
    this.setName(item.id);
    this.card.setCard(item.card);
    this.captionText.setText(item.caption);
    return this;
  }

  setVisualState(state: PF2eVisualState): this {
    this.background.setVisualState(state);
    return this;
  }
}

/**
 * PF2eCard 자체를 재사용 셀로 표시하는 세로 스크롤 카드 갤러리다.
 */
export class PF2eCardGrid extends GridTable {
  private readonly visualStateByItemId = new Map<string, PF2eVisualState>();

  constructor(scene: Phaser.Scene, config: PF2eCardGridConfig) {
    const theme = PF2E_ELF_THEME.components.cardGrid;
    const columns = Math.max(1, Math.round(config.columns));
    const scrollbar = createPF2eScrollbarConfig(scene, 'right', true);
    const tableWidth =
      config.width -
      PF2E_ELF_THEME.sizes.scrollbar -
      PF2E_ELF_THEME.components.scrollablePanel.sliderGap;
    const cellWidth = Math.max(1, Math.floor(tableWidth / columns));
    const cardWidth = Math.min(config.cardWidth, Math.max(1, cellWidth - theme.cellInset * 2));
    const cardHeight = Math.round(cardWidth / PF2E_ELF_THEME.components.card.aspectRatio);
    const cellHeight =
      cardHeight + theme.captionHeight + theme.captionGap + theme.cellInset * 2 + theme.cellGap;
    const visualStateByItemId = new Map<string, PF2eVisualState>();

    super(scene, {
      width: config.width,
      height: config.height,
      scrollMode: 'vertical',
      table: {
        cellWidth,
        cellHeight,
        columns,
        reuseCellContainer: true,
        mask: {
          padding: PF2E_ELF_THEME.components.scrollablePanel.maskPadding,
          maskType: 'stencil',
        },
        click: {
          mode: 'release',
          threshold: theme.dragThreshold,
        },
        over: {
          mode: 'pointer',
        },
      },
      items: [...config.items],
      createCellContainerCallback: (cell, cellContainer): PF2eCardGridCell => {
        if (!isPF2eCardGridItem(cell.item)) {
          throw new Error('PF2eCardGrid received an invalid item');
        }
        const container =
          cellContainer instanceof PF2eCardGridCell
            ? cellContainer
            : new PF2eCardGridCell(
                scene,
                Math.max(1, cell.width - theme.cellGap),
                Math.max(1, cell.height - theme.cellGap),
                cardWidth,
                cell.item,
              );
        return container
          .setItem(cell.item)
          .setVisualState(visualStateByItemId.get(cell.item.id) ?? 'idle')
          .layout();
      },
      slider: scrollbar.config,
      scroller: {
        threshold: theme.dragThreshold,
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

  setItemVisualState(itemId: string, state: PF2eVisualState): this {
    this.visualStateByItemId.set(itemId, state);
    return this;
  }

  refreshItemVisualStates(): this {
    this.refresh();
    return this;
  }
}

function isPF2eCardGridItem(value: unknown): value is PF2eCardGridItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'card' in value &&
    typeof value.card === 'object' &&
    value.card !== null &&
    'caption' in value &&
    typeof value.caption === 'string'
  );
}
