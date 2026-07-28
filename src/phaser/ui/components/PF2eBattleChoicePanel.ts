import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eButtons } from './PF2eButtons.js';
import { PF2eGridTable, type PF2eGridTableItem } from './PF2eGridTable.js';
import { PF2eSurface } from './PF2eSurface.js';

export interface PF2eBattleChoicePanelConfig {
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly message: string;
  readonly items: readonly PF2eGridTableItem[];
}

export class PF2eBattleChoicePanel extends Sizer {
  readonly table: PF2eGridTable;
  readonly buttons: PF2eButtons;
  private readonly statusText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: PF2eBattleChoicePanelConfig) {
    const inset = PF2E_ELF_THEME.spacing.compactInset;
    const gap = PF2E_ELF_THEME.spacing.compactGap;
    const contentWidth = Math.max(180, config.width - inset * 2);
    const background = new PF2eSurface(scene, {
      variant: 'dialog',
      width: 2,
      height: 2,
    });
    const titleText = scene.add.text(0, 0, config.title, {
      color: PF2E_ELF_THEME.colors.text,
      fontFamily: PF2E_ELF_THEME.typography.display,
      fontSize: `${PF2E_ELF_THEME.components.phaseSeven.summaryTitleFontSize}px`,
      fontStyle: 'bold',
      align: 'center',
    });
    const messageText = scene.add.text(0, 0, config.message, {
      color: PF2E_ELF_THEME.colors.mutedText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${PF2E_ELF_THEME.components.phaseSeven.summaryDetailFontSize}px`,
      align: 'center',
      wordWrap: {
        width: contentWidth,
        useAdvancedWrap: true,
      },
    });
    const statusText = scene.add.text(0, 0, '항목을 선택한 뒤 확인하세요.', {
      color: PF2E_ELF_THEME.colors.accentText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${PF2E_ELF_THEME.components.phaseSeven.summaryDetailFontSize}px`,
      align: 'center',
    });
    const tableHeight = Math.max(
      120,
      config.height - inset * 2 - PF2E_ELF_THEME.components.buttons.height - gap * 4 - 110,
    );
    const table = new PF2eGridTable(scene, {
      width: contentWidth,
      height: tableHeight,
      items: config.items,
      columns: 1,
    });
    const buttons = new PF2eButtons(scene, {
      orientation: 'x',
      buttons: [{ id: 'confirm', text: '선택 확인' }],
    });

    super(scene, {
      width: config.width,
      height: config.height,
      orientation: 'y',
      space: {
        left: inset,
        right: inset,
        top: inset,
        bottom: inset,
        item: gap,
      },
    });

    scene.add.existing(this);
    this.table = table;
    this.buttons = buttons;
    this.statusText = statusText;
    this.addBackground(background)
      .add(titleText, { align: 'center' })
      .add(messageText, { align: 'center' })
      .add(table, { proportion: 1, expand: true })
      .add(statusText, { align: 'center' })
      .add(buttons, { expand: true });
  }

  setStatus(message: string, danger = false): this {
    this.statusText
      .setText(message)
      .setColor(danger ? PF2E_ELF_THEME.colors.dangerText : PF2E_ELF_THEME.colors.accentText);
    return this;
  }
}
