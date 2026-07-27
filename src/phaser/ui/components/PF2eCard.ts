import type * as Phaser from 'phaser';
import { OverlapSizer, Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { CardDisplayModel, CardStatDisplay } from '../../../game/cards/cardDisplay';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme';
import { PF2eCardStatBadge } from './PF2eCardStatBadge';

export interface PF2eCardConfig {
  readonly card: CardDisplayModel;
  readonly width?: number;
}

function scaleMetric(metric: number, scale: number, minimum = 1): number {
  return Math.max(minimum, Math.round(metric * scale));
}

export class PF2eCard extends OverlapSizer {
  private readonly art: Phaser.GameObjects.Image;
  private readonly frame: Phaser.GameObjects.Image;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly rulesText: Phaser.GameObjects.Text;
  private readonly costBadge: PF2eCardStatBadge;
  private readonly dominanceBadge: PF2eCardStatBadge;
  private readonly attackBadge: PF2eCardStatBadge;
  private readonly healthBadge: PF2eCardStatBadge;
  private displayedStats: CardStatDisplay;

  constructor(scene: Phaser.Scene, config: PF2eCardConfig) {
    const theme = PF2E_ELF_THEME.components.card;
    const width = Math.min(
      theme.maximumWidth,
      Math.max(theme.minimumWidth, Math.round(config.width ?? theme.defaultWidth)),
    );
    const height = Math.round(width / theme.aspectRatio);
    const scale = width / theme.defaultWidth;
    const badgeSize = scaleMetric(theme.statBadgeSize, scale, 42);
    const badgeFontSize = scaleMetric(theme.statBadgeFontSize, scale, 14);
    const badgeInset = scaleMetric(theme.statBadgeInset, scale);
    const contentInsetX = scaleMetric(theme.contentInsetX, scale);
    const contentBottomInset = scaleMetric(theme.contentBottomInset, scale);
    const contentHeight = scaleMetric(theme.contentHeight, scale, 82);
    const contentWidth = Math.max(1, width - contentInsetX * 2);
    const contentPaddingX = scaleMetric(theme.contentPaddingX, scale);
    const contentPaddingY = scaleMetric(theme.contentPaddingY, scale);
    const contentGap = scaleMetric(theme.contentGap, scale);
    const art = scene.add.image(0, 0, config.card.artAssetKey).setDisplaySize(width, height);
    const frame = scene.add
      .image(0, 0, theme.frameVariants[config.card.frameVariant].key)
      .setDisplaySize(width, height);
    const contentBackground = scene.add.rectangle(
      0,
      0,
      contentWidth,
      contentHeight,
      theme.contentBackgroundColor,
      theme.contentBackgroundAlpha,
    );
    const nameText = scene.add.text(0, 0, config.card.name, {
      color: theme.nameTextColor,
      fontFamily: PF2E_ELF_THEME.typography.display,
      fontSize: `${scaleMetric(theme.nameFontSize, scale, 15)}px`,
      fontStyle: 'bold',
      stroke: theme.textStrokeColor,
      strokeThickness: 2,
      align: 'center',
      wordWrap: {
        width: Math.max(1, contentWidth - contentPaddingX * 2),
        useAdvancedWrap: true,
      },
    });
    const rulesText = scene.add.text(0, 0, config.card.rulesText, {
      color: theme.rulesTextColor,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${scaleMetric(theme.rulesFontSize, scale, 10)}px`,
      lineSpacing: scaleMetric(theme.rulesLineSpacing, scale),
      stroke: theme.textStrokeColor,
      strokeThickness: 1,
      align: 'left',
      wordWrap: {
        width: Math.max(1, contentWidth - contentPaddingX * 2),
        useAdvancedWrap: true,
      },
    });
    const content = new Sizer(scene, {
      width: contentWidth,
      height: contentHeight,
      orientation: 'y',
      space: {
        left: contentPaddingX,
        right: contentPaddingX,
        top: contentPaddingY,
        bottom: contentPaddingY,
        item: contentGap,
      },
    });
    scene.add.existing(content);
    content
      .addBackground(contentBackground)
      .add(nameText, { align: 'center' })
      .add(rulesText, { proportion: 1, align: 'left', expand: true });

    const costBadge = new PF2eCardStatBadge(scene, {
      value: config.card.stats.cost,
      type: 'cost',
      size: badgeSize,
      fontSize: badgeFontSize,
    });
    const dominanceBadge = new PF2eCardStatBadge(scene, {
      value: config.card.stats.dominance,
      type: 'dominance',
      size: badgeSize,
      fontSize: badgeFontSize,
    });
    const attackBadge = new PF2eCardStatBadge(scene, {
      value: config.card.stats.attack,
      type: 'attack',
      size: badgeSize,
      fontSize: badgeFontSize,
    });
    const healthBadge = new PF2eCardStatBadge(scene, {
      value: config.card.stats.hp,
      type: 'health',
      size: badgeSize,
      fontSize: badgeFontSize,
    });

    super(scene, {
      width,
      height,
    });

    scene.add.existing(this);
    this.art = art;
    this.frame = frame;
    this.nameText = nameText;
    this.rulesText = rulesText;
    this.costBadge = costBadge;
    this.dominanceBadge = dominanceBadge;
    this.attackBadge = attackBadge;
    this.healthBadge = healthBadge;
    this.displayedStats = Object.freeze({ ...config.card.stats });

    this.add(art, { key: 'art', align: 'center', expand: true })
      .add(content, {
        key: 'content',
        align: 'bottom',
        expand: false,
        padding: {
          bottom: contentBottomInset,
        },
      })
      .add(frame, { key: 'frame', align: 'center', expand: true })
      .add(costBadge, {
        key: 'cost',
        align: 'left-top',
        expand: false,
        padding: {
          left: badgeInset,
          top: badgeInset,
        },
      })
      .add(dominanceBadge, {
        key: 'dominance',
        align: 'right-top',
        expand: false,
        padding: {
          right: badgeInset,
          top: badgeInset,
        },
      })
      .add(attackBadge, {
        key: 'attack',
        align: 'left-bottom',
        expand: false,
        padding: {
          left: badgeInset,
          bottom: badgeInset,
        },
      })
      .add(healthBadge, {
        key: 'health',
        align: 'right-bottom',
        expand: false,
        padding: {
          right: badgeInset,
          bottom: badgeInset,
        },
      });
  }

  setCard(card: CardDisplayModel): this {
    this.art.setTexture(card.artAssetKey);
    this.frame.setTexture(PF2E_ELF_THEME.components.card.frameVariants[card.frameVariant].key);
    this.nameText.setText(card.name);
    this.rulesText.setText(card.rulesText);
    this.setStats(card.stats);
    this.layout();
    return this;
  }

  setStats(stats: CardStatDisplay): this {
    this.costBadge.setBadgeValue(stats.cost);
    this.dominanceBadge.setBadgeValue(stats.dominance);
    this.attackBadge.setBadgeValue(stats.attack);
    this.healthBadge.setBadgeValue(stats.hp);
    this.displayedStats = Object.freeze({ ...stats });
    return this;
  }

  getDisplayedStats(): CardStatDisplay {
    return this.displayedStats;
  }
}
