import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eLabel } from './PF2eLabel.js';
import { PF2eSurface } from './PF2eSurface.js';

export interface PF2eScreenPanelConfig {
  readonly width: number;
  readonly height: number;
  readonly inset: number;
  readonly gap: number;
  readonly title: string;
  readonly subtitle: string;
  readonly titleFontSize: number;
  readonly bodyFontSize: number;
  readonly content: Phaser.GameObjects.GameObject;
  readonly actions?: Phaser.GameObjects.GameObject;
}

export class PF2eScreenPanel extends Sizer {
  private readonly statusText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: PF2eScreenPanelConfig) {
    const theme = PF2E_ELF_THEME.components.phaseSeven;
    const heading = new PF2eLabel(scene, {
      text: config.title,
      variant: 'heading',
      height: theme.screenTitleHeight,
      fontSize: config.titleFontSize,
    });
    const subtitle = scene.add.text(0, 0, config.subtitle, {
      color: PF2E_ELF_THEME.colors.mutedText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${config.bodyFontSize}px`,
      lineSpacing: theme.screenSubtitleLineSpacing,
      align: 'center',
      wordWrap: {
        width: Math.max(1, config.width - config.inset * 2),
        useAdvancedWrap: true,
      },
    });
    const statusText = scene.add.text(0, 0, '', {
      color: PF2E_ELF_THEME.colors.accentText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${config.bodyFontSize}px`,
      lineSpacing: theme.statusLineSpacing,
      align: 'center',
      wordWrap: {
        width: Math.max(1, config.width - config.inset * 2),
        useAdvancedWrap: true,
      },
    });

    super(scene, {
      width: config.width,
      height: config.height,
      orientation: 'y',
      space: {
        left: config.inset,
        right: config.inset,
        top: config.inset,
        bottom: config.inset,
        item: config.gap,
      },
    });

    scene.add.existing(this);
    this.statusText = statusText;
    const background = new PF2eSurface(scene, {
      variant: 'panel',
      width: 2,
      height: 2,
    });
    scene.children.sendToBack(background);
    this.addBackground(background)
      .add(heading, { align: 'center', expand: true })
      .add(subtitle, { align: 'center' })
      .add(statusText, {
        align: 'center',
        minHeight: theme.screenStatusHeight,
      })
      .add(config.content, { proportion: 1, expand: true });

    if (config.actions !== undefined) {
      this.add(config.actions, { expand: true });
    }
  }

  setStatus(message: string, tone: 'normal' | 'danger' = 'normal'): this {
    this.statusText
      .setColor(
        tone === 'danger' ? PF2E_ELF_THEME.colors.dangerText : PF2E_ELF_THEME.colors.accentText,
      )
      .setText(message);
    this.layout();
    return this;
  }
}
