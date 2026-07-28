import type * as Phaser from 'phaser';
import { OverlapSizer, Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { BattlePlayerId } from '../../../game/simulation/battle/index.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eSurface } from './PF2eSurface.js';

export type PF2eBattlePileZone = 'DECK' | 'DROP' | 'EXILE';

export interface PF2eBattlePileConfig {
  readonly playerId: BattlePlayerId;
  readonly zone: PF2eBattlePileZone;
  readonly width: number;
  readonly height: number;
}

/**
 * 전장의 Deck, Drop 또는 Exile 장수를 표시하는 OverlapSizer다.
 */
export class PF2eBattlePile extends OverlapSizer {
  readonly playerId: BattlePlayerId;
  readonly zone: PF2eBattlePileZone;
  private readonly background: PF2eSurface;
  private readonly countText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: PF2eBattlePileConfig) {
    const theme = PF2E_ELF_THEME.components.battleDirect;
    const background = new PF2eSurface(scene, {
      variant: 'control',
      width: config.width,
      height: config.height,
    });
    const titleText = scene.add.text(
      0,
      0,
      `${config.playerId === 'PLAYER' ? '내' : '적'} ${config.zone}`,
      {
        color: PF2E_ELF_THEME.colors.mutedText,
        fontFamily: PF2E_ELF_THEME.typography.body,
        fontSize: `${theme.pileLabelFontSize}px`,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: {
          width: Math.max(1, config.width - theme.pileInset * 2),
          useAdvancedWrap: true,
        },
      },
    );
    const countText = scene.add.text(0, 0, '0', {
      color: PF2E_ELF_THEME.colors.text,
      fontFamily: PF2E_ELF_THEME.typography.display,
      fontSize: `${theme.pileCountFontSize}px`,
      fontStyle: 'bold',
      align: 'center',
    });
    const content = new Sizer(scene, {
      width: config.width,
      height: config.height,
      orientation: 'y',
      space: {
        left: theme.pileInset,
        right: theme.pileInset,
        top: theme.pileInset,
        bottom: theme.pileInset,
        item: theme.pileGap,
      },
    });
    scene.add.existing(content);
    content.add(titleText, { align: 'center' }).add(countText, { align: 'center' });

    super(scene, {
      width: config.width,
      height: config.height,
    });

    scene.add.existing(this);
    this.playerId = config.playerId;
    this.zone = config.zone;
    this.background = background;
    this.countText = countText;
    this.setName(`${config.playerId}:${config.zone}`);
    this.add(background, { align: 'center' }).add(content, { align: 'center' });
  }

  setCount(count: number): this {
    this.countText.setText(String(count));
    return this;
  }

  setTargetState(state: 'idle' | 'legal-target' | 'disabled'): this {
    this.background.setVisualState(
      state === 'legal-target' ? 'focused' : state === 'disabled' ? 'disabled' : 'idle',
    );
    return this;
  }
}
