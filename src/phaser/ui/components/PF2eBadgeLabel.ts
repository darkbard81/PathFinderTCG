import type * as Phaser from 'phaser';
import { BadgeLabel, Label } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { ASSET_KEYS } from '../../../game/assets/manifest';
import {
  PF2E_ELF_THEME,
  type PF2eNineLabelVariant,
  type PF2eNinePatchVisualState,
} from '../theme/pf2eElfTheme';
import { PF2eNineLabel } from './PF2eNineLabel';

export type PF2eBadgePosition =
  | 'leftTop'
  | 'centerTop'
  | 'rightTop'
  | 'leftCenter'
  | 'center'
  | 'rightCenter'
  | 'leftBottom'
  | 'centerBottom'
  | 'rightBottom';

export interface PF2eBadgeLabelConfig {
  readonly text: string;
  readonly badgeValue: string | number;
  readonly variant?: PF2eNineLabelVariant;
  readonly badgePosition?: PF2eBadgePosition;
  /**
   * Minimum bounds. A parent rexUI Sizer owns the final bounds and expands the main label.
   */
  readonly width?: number;
  readonly height?: number;
}

export class PF2eBadgeLabel extends BadgeLabel {
  private readonly mainLabel: PF2eNineLabel;
  private readonly badge: Label;
  private readonly badgeText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: PF2eBadgeLabelConfig) {
    const badgeSize = PF2E_ELF_THEME.sizes.badge;
    const badgePosition = config.badgePosition ?? 'rightTop';
    const mainLabel = new PF2eNineLabel(scene, {
      text: config.text,
      variant: config.variant ?? 'status',
      width: config.width,
      height: config.height,
    });
    const badgeImage = scene.add
      .image(0, 0, ASSET_KEYS.pf2eElfBadge)
      .setDisplaySize(badgeSize, badgeSize);
    const badgeText = scene.add.text(0, 0, String(config.badgeValue), {
      color: PF2E_ELF_THEME.colors.text,
      fontFamily: PF2E_ELF_THEME.typography.display,
      fontSize: `${PF2E_ELF_THEME.components.badgeLabel.badgeFontSize}px`,
      fontStyle: 'bold',
      stroke: '#14241c',
      strokeThickness: 2,
      align: 'center',
    });
    const badge = new Label(scene, {
      width: badgeSize,
      height: badgeSize,
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
    badge.layout();

    super(scene, {
      width: config.width,
      height: config.height,
      main: mainLabel,
      leftTop: badgePosition === 'leftTop' ? badge : undefined,
      centerTop: badgePosition === 'centerTop' ? badge : undefined,
      rightTop: badgePosition === 'rightTop' ? badge : undefined,
      leftCenter: badgePosition === 'leftCenter' ? badge : undefined,
      center: badgePosition === 'center' ? badge : undefined,
      rightCenter: badgePosition === 'rightCenter' ? badge : undefined,
      leftBottom: badgePosition === 'leftBottom' ? badge : undefined,
      centerBottom: badgePosition === 'centerBottom' ? badge : undefined,
      rightBottom: badgePosition === 'rightBottom' ? badge : undefined,
    });

    scene.add.existing(this);
    const mainLabelSizerConfig = this.getSizerConfig(mainLabel);
    mainLabelSizerConfig.expandWidth = 1;
    mainLabelSizerConfig.expandHeight = 1;
    this.mainLabel = mainLabel;
    this.badge = badge;
    this.badgeText = badgeText;
  }

  setBadgeValue(value: string | number): this {
    this.badgeText.setText(String(value));
    this.badge.layout();
    return this;
  }

  setVisualState(state: PF2eNinePatchVisualState): this {
    this.mainLabel.setVisualState(state);
    return this;
  }
}
