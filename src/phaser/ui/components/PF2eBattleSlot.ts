import type * as Phaser from 'phaser';
import { OverlapSizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import type { PF2eBattleCard } from './PF2eBattleCard.js';

export interface PF2eBattleSlotConfig {
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

export class PF2eBattleSlot extends OverlapSizer {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly emptyLabel: Phaser.GameObjects.Text;
  private card?: PF2eBattleCard;

  constructor(scene: Phaser.Scene, config: PF2eBattleSlotConfig) {
    const theme = PF2E_ELF_THEME.components.battleBoard;
    const background = scene.add
      .rectangle(
        0,
        0,
        config.width,
        config.height,
        theme.slotBackgroundColor,
        theme.slotBackgroundAlpha,
      )
      .setStrokeStyle(theme.slotBorderWidth, theme.slotBorderColor, theme.slotBorderAlpha);
    const emptyLabel = scene.add.text(0, 0, config.label, {
      color: PF2E_ELF_THEME.colors.mutedText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${Math.max(9, Math.round(config.width * 0.1))}px`,
      align: 'center',
    });

    super(scene, {
      width: config.width,
      height: config.height,
    });

    scene.add.existing(this);
    this.background = background;
    this.emptyLabel = emptyLabel;
    this.add(background, {
      key: 'background',
      align: 'center',
      expand: false,
    }).add(emptyLabel, {
      key: 'empty-label',
      align: 'center',
      expand: false,
    });
  }

  get currentCard(): PF2eBattleCard | undefined {
    return this.card;
  }

  setCard(card: PF2eBattleCard): this {
    if (this.card === card) {
      return this;
    }
    if (this.card !== undefined) {
      throw new Error('점유된 전투 Field 슬롯에는 다른 카드를 배치할 수 없습니다.');
    }

    this.card = card;
    card.setDepth(this.depth + 1);
    this.background.setVisible(false);
    this.emptyLabel.setVisible(false);
    this.add(card, { key: 'card', align: 'center', expand: false });
    return this;
  }

  detachCard(card: PF2eBattleCard): this {
    if (this.card !== card) {
      return this;
    }

    this.remove(card, false);
    this.card = undefined;
    this.background.setVisible(true);
    this.emptyLabel.setVisible(true);
    return this;
  }
}
