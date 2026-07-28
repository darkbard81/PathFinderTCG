import type * as Phaser from 'phaser';
import { OverlapSizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { BattleCardViewModel } from '../controllers/battleUiModels.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eCard } from './PF2eCard.js';
import { PF2eLabel } from './PF2eLabel.js';
import { PF2eSurface } from './PF2eSurface.js';

export interface PF2eHandDeckItem {
  readonly id: string;
  readonly model: BattleCardViewModel;
}

export interface PF2eHandDeckConfig {
  readonly width: number;
  readonly height: number;
  readonly cardWidth: number;
  readonly items: readonly PF2eHandDeckItem[];
}

/**
 * 손패 카드를 겹쳐 펼치고 접는 popup HandDeck이다.
 */
export class PF2eHandDeck extends OverlapSizer {
  private readonly panelWidth: number;
  private readonly cardWidth: number;
  private readonly handle: PF2eLabel;
  private readonly cardById = new Map<string, PF2eCard>();
  private readonly modelById = new Map<string, BattleCardViewModel>();

  constructor(scene: Phaser.Scene, config: PF2eHandDeckConfig) {
    const background = new PF2eSurface(scene, {
      variant: 'panel',
      width: config.width,
      height: config.height,
    });
    const handle = new PF2eLabel(scene, {
      text: '',
      variant: 'status',
      width: Math.min(config.width - 24, 380),
      height: PF2E_ELF_THEME.components.battleDirect.handHandleHeight,
      fontSize: PF2E_ELF_THEME.components.battleDirect.commandStatusFontSize,
      paddingY: 5,
    });

    super(scene, {
      width: config.width,
      height: config.height,
    });

    scene.add.existing(this);
    this.panelWidth = config.width;
    this.cardWidth = config.cardWidth;
    this.handle = handle;
    this.setDepth(PF2E_ELF_THEME.components.battleDirect.handDepth);
    this.add(background, { key: 'background', align: 'center' }).add(handle, {
      key: 'handle',
      align: 'top',
      expand: false,
      padding: {
        top: 4,
      },
    });
    this.renderItems(config.items);
  }

  renderItems(items: readonly PF2eHandDeckItem[]): this {
    for (const card of this.cardById.values()) {
      this.remove(card, true);
    }
    this.cardById.clear();
    this.modelById.clear();
    this.handle.setText(`HAND · ${items.length}장 · 누르거나 전장으로 드래그`);

    const theme = PF2E_ELF_THEME.components.battleDirect;
    const availableWidth = Math.max(1, this.panelWidth - theme.handInset * 2);
    const count = items.length;
    const step =
      count <= 1
        ? 0
        : Math.min(
            this.cardWidth + theme.handCardGap,
            Math.max(28, (availableWidth - this.cardWidth) / (count - 1)),
          );
    const totalWidth = count === 0 ? 0 : this.cardWidth + step * (count - 1);
    const startX = theme.handInset + Math.max(0, (availableWidth - totalWidth) / 2);

    items.forEach((item, index) => {
      const card = new PF2eCard(this.scene, {
        card: item.model.card,
        width: this.cardWidth,
        compact: true,
      })
        .setName(item.id)
        .setDepth(this.depth + index + 1);
      this.cardById.set(item.id, card);
      this.modelById.set(item.id, item.model);
      this.add(card, {
        key: `hand-card:${item.id}`,
        align: 'left-bottom',
        expand: false,
        padding: {
          left: Math.round(startX + step * index),
          bottom: theme.handInset,
        },
      });
    });
    this.layout();
    return this;
  }

  getCardEntries(): readonly (readonly [string, PF2eCard])[] {
    return Object.freeze([...this.cardById.entries()]);
  }

  get handleView(): PF2eLabel {
    return this.handle;
  }

  getCardView(cardId: string): PF2eCard | undefined {
    return this.cardById.get(cardId);
  }

  getCardModel(cardId: string): BattleCardViewModel | undefined {
    return this.modelById.get(cardId);
  }

  setCardState(cardId: string, state: 'idle' | 'selected' | 'legal-target' | 'disabled'): this {
    this.cardById.get(cardId)?.setSelectionState(state);
    return this;
  }
}
