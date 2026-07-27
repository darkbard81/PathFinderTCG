import type * as Phaser from 'phaser';
import { BadgeLabel, Label } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME, type PF2eBadgeType } from '../theme/pf2eElfTheme';

export interface PF2eCardStatBadgeConfig {
  readonly value: string | number;
  readonly type: Extract<PF2eBadgeType, 'cost' | 'dominance' | 'attack' | 'health'>;
  readonly size?: number;
  readonly fontSize?: number;
}

export class PF2eCardStatBadge extends BadgeLabel {
  private readonly badge: Label;
  private readonly badgeText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: PF2eCardStatBadgeConfig) {
    const cardTheme = PF2E_ELF_THEME.components.card;
    const size = config.size ?? cardTheme.statBadgeSize;
    const badgeStyle = PF2E_ELF_THEME.components.badgeLabel.variants[config.type];
    const badgeImage = scene.add.image(0, 0, badgeStyle.key).setDisplaySize(size, size);
    const badgeText = scene.add.text(0, 0, String(config.value), {
      color: badgeStyle.textColor,
      fontFamily: PF2E_ELF_THEME.typography.display,
      fontSize: `${config.fontSize ?? cardTheme.statBadgeFontSize}px`,
      fontStyle: 'bold',
      stroke: badgeStyle.strokeColor,
      strokeThickness: 2,
      align: 'center',
    });
    const badge = new Label(scene, {
      width: size,
      height: size,
      background: badgeImage,
      text: badgeText,
      align: 'center',
      space: {
        left: PF2E_ELF_THEME.components.badgeLabel.badgePadding,
        right: PF2E_ELF_THEME.components.badgeLabel.badgePadding,
        top: PF2E_ELF_THEME.components.badgeLabel.badgePadding,
        bottom: PF2E_ELF_THEME.components.badgeLabel.badgePadding,
      },
    });
    scene.add.existing(badge);

    super(scene, {
      width: size,
      height: size,
      center: badge,
    });

    scene.add.existing(this);
    this.badge = badge;
    this.badgeText = badgeText;
  }

  setBadgeValue(value: string | number): this {
    this.badgeText.setText(String(value));
    this.badge.layout();
    return this;
  }
}
