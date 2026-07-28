import type * as Phaser from 'phaser';
import { OverlapSizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { BattleFieldPosition } from '../../../game/data/index.js';
import type { BattlePlayerId } from '../../../game/simulation/battle/index.js';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import type { PF2eCard } from './PF2eCard.js';
import { PF2eSurface } from './PF2eSurface.js';

export interface PF2eBattleSlotConfig {
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly playerId: BattlePlayerId;
  readonly fieldPosition: BattleFieldPosition;
}

export class PF2eBattleSlot extends OverlapSizer {
  readonly playerId: BattlePlayerId;
  readonly fieldPosition: BattleFieldPosition;
  private readonly background: PF2eSurface;
  private readonly emptyLabel: Phaser.GameObjects.Text;
  private readonly dominanceText: Phaser.GameObjects.Text;
  private card?: PF2eCard;
  private cardInstanceId?: string;

  constructor(scene: Phaser.Scene, config: PF2eBattleSlotConfig) {
    const background = new PF2eSurface(scene, {
      variant: 'gridCell',
      width: config.width,
      height: config.height,
    });
    const emptyLabel = scene.add.text(0, 0, config.label, {
      color: PF2E_ELF_THEME.colors.mutedText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${Math.max(9, Math.round(config.width * 0.1))}px`,
      align: 'center',
    });
    const dominanceText = scene.add.text(0, 0, '0', {
      color: PF2E_ELF_THEME.colors.accentText,
      fontFamily: PF2E_ELF_THEME.typography.display,
      fontSize: `${PF2E_ELF_THEME.components.battleDirect.slotDominanceFontSize}px`,
      fontStyle: 'bold',
      align: 'center',
      stroke: PF2E_ELF_THEME.components.card.textStrokeColor,
      strokeThickness: PF2E_ELF_THEME.components.battleDirect.slotDominanceStrokeThickness,
    });

    super(scene, {
      width: config.width,
      height: config.height,
    });

    scene.add.existing(this);
    this.playerId = config.playerId;
    this.fieldPosition = config.fieldPosition;
    this.background = background;
    this.emptyLabel = emptyLabel;
    this.dominanceText = dominanceText;
    this.add(background, {
      key: 'background',
      align: 'center',
      expand: false,
    })
      .add(emptyLabel, {
        key: 'empty-label',
        align: 'center',
        expand: false,
      })
      .add(dominanceText, {
        key: 'dominance',
        align: 'top',
        expand: false,
        padding: {
          top: PF2E_ELF_THEME.components.battleDirect.slotDominanceInsetY,
        },
      });
  }

  get currentCard(): PF2eCard | undefined {
    return this.card;
  }

  get currentCardId(): string | undefined {
    return this.cardInstanceId;
  }

  setCard(cardId: string, card: PF2eCard): this {
    if (this.card === card) {
      this.cardInstanceId = cardId;
      return this;
    }
    if (this.card !== undefined) {
      throw new Error('점유된 전투 Field 슬롯에는 다른 카드를 배치할 수 없습니다.');
    }

    this.card = card;
    this.cardInstanceId = cardId;
    card.setDepth(this.depth + 1);
    this.background.setVisible(false);
    this.emptyLabel.setVisible(false);
    this.dominanceText.setVisible(false);
    this.add(card, { key: 'card', align: 'center', expand: false });
    return this;
  }

  detachCard(card: PF2eCard): this {
    if (this.card !== card) {
      return this;
    }

    this.remove(card, false);
    this.card = undefined;
    this.cardInstanceId = undefined;
    this.background.setVisible(true);
    this.emptyLabel.setVisible(true);
    this.dominanceText.setVisible(true);
    return this;
  }

  setDominance(value: number): this {
    this.dominanceText.setText(String(value));
    return this;
  }

  setTargetState(state: 'idle' | 'selected' | 'legal-target' | 'disabled'): this {
    const surfaceState =
      state === 'legal-target'
        ? 'focused'
        : state === 'selected'
          ? 'selected'
          : state === 'disabled'
            ? 'disabled'
            : 'idle';
    this.background.setVisible(this.card === undefined).setVisualState(surfaceState);
    this.card?.setSelectionState(state);
    return this;
  }
}
